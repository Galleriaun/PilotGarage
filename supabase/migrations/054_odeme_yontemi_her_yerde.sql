-- ============================================================
-- PilotGarage — 054: Ödeme yöntemi her ödeme yolunda (owner request 2026-07-29)
--
-- Şikâyet: "ödeme yapılırken ödeme yaptığımız türü seçelim, türden düşsün."
-- Yöntemsiz (NULL) doğan işlemler Toplam Bakiye'yi hareket ettiriyor ama
-- HİÇBİR kovaya (Nakit/KK/Havale) girmiyordu → kovaların toplamı Toplam'dan
-- küçük kalıyordu. Yöntemsiz doğan beş yol vardı:
--   maaş (pay_maas + cron), avans, prim, sabit gider, cari tahsilat.
--
-- Owner kararları (birebir):
--   * MEVCUT satırlar OLDUĞU GİBİ KALIR — hiçbir backfill yok ve onaylanmış
--     işlemin yöntemini sonradan değiştiren bir yol AÇILMAZ (owner kararı):
--     yöntem her zaman TANIMIN üstünde (kişi / sabit gider kuralı / hareket)
--     durur, oradan değişir ve bundan sonraki ödemeleri kapsar. Böylece
--     işlem değişmezliği (immutability) hiç delinmez.
--   * Avans/prim: YENİ olanlarda oluştururken seçilir, Yönetici Onay'da da
--     seçebilir/değiştirebilir.
--   * Maaş: yöntem KİŞİNİN üstünde durur (business_members) ve Personel
--     Detay'ın "düzenle" bölümünden değiştirilir — hem elle ödemede hem
--     cron'un otomatik maaşında kullanılır. Mevcut maaş SATIRLARI yöntemsiz
--     kalır (onaylanmış satır değişmez); ayar bundan sonrasını kapsar.
--   * Sabit gider: mevcutlar yöntemsiz kalır, düzenle'den seçilebilir —
--     yöntem KURALIN üstünde durur, cron her ay işleme kopyalar.
--   * Cari: ödeme eklerken seçilir; "Tümünü Topla" her hareketi KENDİ
--     yöntemiyle kasaya yansıtır → kovalara ayrışmış gelir.
--
-- Onay gate DEĞİŞMEDİ: bu migration hiçbir satırın doğum durumunu
-- (BEKLIYOR/ONAYLANDI) değiştirmez, yalnızca yöntem taşır.
-- ============================================================

-- ── A. Yeni kolonlar (ikisi de nullable → mevcut satırlar yöntemsiz kalır) ──

alter table public.sabit_giderler
  add column odeme_yontemi public.odeme_yontemi;

alter table public.cari_hareketler
  add column odeme_yontemi public.odeme_yontemi;

-- Maaşın kovası kişinin üyelik satırında durur (owner: "kendi düzenle
-- bölümünden"): elle ödeme de cron da buradan okur.
alter table public.business_members
  add column odeme_yontemi public.odeme_yontemi;

comment on column public.sabit_giderler.odeme_yontemi is
  'Kural üstünde durur; cron her dönem üretilen işleme kopyalar. NULL = seçilmemiş.';
comment on column public.cari_hareketler.odeme_yontemi is
  'Tahsilatın hangi kovaya gireceği; yansıtırken işleme kopyalanır. NULL = seçilmemiş.';
comment on column public.business_members.odeme_yontemi is
  'Maaşın kasa kovası; pay_maas ve cron otomatik maaşı buradan okur. NULL = seçilmemiş.';

-- ── B. Avans / Prim / Maaş: oluştururken yöntem ──
-- Parametre listesi değiştiği için `create or replace` YETMEZ (yeni imza
-- eski fonksiyonun yanına AŞIRI YÜKLEME olarak eklenir, çağrılar belirsiz
-- kalırdı). Eski imzalar düşürülür — 033'te approve_islem için yapılanın aynısı.
-- p_yontem'in default'u null: eski 4/2 argümanlı çağrılar (ör. 037'nin
-- approve_avans_istek'i) kırılmadan çalışmaya devam eder, yöntem Onay'da seçilir.

drop function if exists public.give_avans(uuid, uuid, numeric, text);

create or replace function public.give_avans(
  p_profile uuid, p_business uuid, p_tutar numeric, p_note text default '',
  p_yontem public.odeme_yontemi default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
  v_kategori uuid;
  v_islem uuid;
begin
  if not is_finance(p_business) then
    raise exception 'Avans verme yetkiniz yok.';
  end if;
  if p_tutar is null or p_tutar <= 0 then
    raise exception 'Tutar 0''dan büyük olmalı.';
  end if;
  if p_tutar <> round(p_tutar, 2) then
    raise exception 'Tutar en fazla 2 ondalık basamak içerebilir.';
  end if;
  if not exists (select 1 from business_members
                 where profile_id = p_profile and business_id = p_business) then
    raise exception 'Personel bu işletmede kayıtlı değil.';
  end if;

  select full_name into v_name from profiles where id = p_profile;
  select id into v_kategori
  from kategoriler
  where business_id = p_business and tur = 'GIDER'
    and label = 'Personel Maaşı' and is_active
  limit 1;

  -- 045: Onay'a düşer (onaylayan/onaylanma_tarihi boş)
  insert into islemler
    (business_id, tur, tutar, baslik, kategori_id, kaynak, durum,
     islem_tarihi, created_by, odeme_yontemi)
  values
    (p_business, 'GIDER', p_tutar, v_name || ' — Avans', v_kategori, 'PERSONEL',
     'BEKLIYOR', istanbul_today(), auth.uid(), p_yontem)
  returning id into v_islem;

  insert into personel_odemeler (profile_id, business_id, tur, tutar, note, islem_id, created_by)
  values (p_profile, p_business, 'AVANS', p_tutar, coalesce(p_note, ''), v_islem, auth.uid());

  perform log_audit('AVANS', 'personel_odemeler', p_profile::text,
    jsonb_build_object('tutar', p_tutar, 'islem_id', v_islem, 'durum', 'BEKLIYOR'));
  return v_islem;
end;
$$;

drop function if exists public.give_prim(uuid, uuid, numeric, text);

create or replace function public.give_prim(
  p_profile uuid, p_business uuid, p_tutar numeric, p_note text default '',
  p_yontem public.odeme_yontemi default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
  v_kategori uuid;
  v_islem uuid;
begin
  if not is_finance(p_business) then
    raise exception 'Prim verme yetkiniz yok.';
  end if;
  if p_tutar is null or p_tutar <= 0 then
    raise exception 'Tutar 0''dan büyük olmalı.';
  end if;
  if p_tutar <> round(p_tutar, 2) then
    raise exception 'Tutar en fazla 2 ondalık basamak içerebilir.';
  end if;
  if not exists (select 1 from business_members
                 where profile_id = p_profile and business_id = p_business) then
    raise exception 'Personel bu işletmede kayıtlı değil.';
  end if;

  select full_name into v_name from profiles where id = p_profile;
  select id into v_kategori
  from kategoriler
  where business_id = p_business and tur = 'GIDER'
    and label = 'Personel Maaşı' and is_active
  limit 1;

  insert into islemler
    (business_id, tur, tutar, baslik, kategori_id, kaynak, durum,
     islem_tarihi, created_by, odeme_yontemi)
  values
    (p_business, 'GIDER', p_tutar,
     v_name || ' — ' || coalesce(nullif(trim(p_note), ''), 'Prim'),
     v_kategori, 'PERSONEL', 'BEKLIYOR', istanbul_today(), auth.uid(), p_yontem)
  returning id into v_islem;

  insert into personel_odemeler (profile_id, business_id, tur, tutar, note, islem_id, created_by)
  values (p_profile, p_business, 'PRIM', p_tutar, coalesce(p_note, ''), v_islem, auth.uid());

  perform log_audit('PRIM', 'personel_odemeler', p_profile::text,
    jsonb_build_object('tutar', p_tutar, 'islem_id', v_islem, 'durum', 'BEKLIYOR'));
  return v_islem;
end;
$$;

-- Maaş: yöntem kişinin üyelik satırından gelir (p_yontem verilirse o kazanır,
-- ama istemci vermez). Cron da aynı ayarı okur → elle ve otomatik maaş aynı
-- kovaya düşer. Maaş born-ONAYLANDI kalır (045 istisnası korunur).

drop function if exists public.pay_maas(uuid, uuid);

create or replace function public.pay_maas(
  p_profile uuid, p_business uuid,
  p_yontem public.odeme_yontemi default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  m record;
  v_name text;
  v_kategori uuid;
  v_islem uuid;
begin
  if not is_finance(p_business) then
    raise exception 'Maaş ödeme yetkiniz yok.';
  end if;
  select * into m from business_members
  where profile_id = p_profile and business_id = p_business;
  if not found then
    raise exception 'Personel bu işletmede kayıtlı değil.';
  end if;
  if m.maas <= 0 then
    raise exception 'Bu personel için maaş tanımlı değil.';
  end if;

  select full_name into v_name from profiles where id = p_profile;
  select id into v_kategori
  from kategoriler
  where business_id = p_business and tur = 'GIDER'
    and label = 'Personel Maaşı' and is_active
  limit 1;

  insert into islemler
    (business_id, tur, tutar, baslik, kategori_id, kaynak, durum,
     islem_tarihi, created_by, onaylayan, onaylanma_tarihi, odeme_yontemi)
  values
    (p_business, 'GIDER', m.maas, v_name || ' — Maaş', v_kategori, 'PERSONEL',
     'ONAYLANDI', istanbul_today(), auth.uid(), auth.uid(), now(),
     coalesce(p_yontem, m.odeme_yontemi))
  returning id into v_islem;

  insert into personel_odemeler (profile_id, business_id, tur, tutar, islem_id, created_by)
  values (p_profile, p_business, 'MAAS', m.maas, v_islem, auth.uid());

  perform log_audit('MAAS', 'personel_odemeler', p_profile::text,
    jsonb_build_object('tutar', m.maas, 'islem_id', v_islem));
  return v_islem;
end;
$$;

-- ── C. Cari: ödeme eklerken yöntem, yansıtırken kopyala ──

drop function if exists public.topla_cari_odeme(uuid, numeric, text);

create or replace function public.topla_cari_odeme(
  p_cari uuid, p_tutar numeric, p_note text default '',
  p_yontem public.odeme_yontemi default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  ci record;
  v_hareket uuid;
  v_islem uuid;
begin
  select * into ci from cari_isletmeler where id = p_cari;
  if not found then
    raise exception 'İşletme bulunamadı.';
  end if;
  if not is_finance(ci.business_id) then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;
  if p_tutar is null or p_tutar <= 0 then
    raise exception 'Geçerli bir tutar girin.';
  end if;

  -- born BEKLIYOR: bakiyeden hemen düşer; reddedilirse YOK'a döner (008)
  insert into cari_hareketler
    (cari_isletme_id, tur, tutar, note, kasa_durumu, created_by, odeme_yontemi)
  values
    (p_cari, 'GIDER', p_tutar, coalesce(nullif(p_note, ''), 'Ödeme'),
     'BEKLIYOR', auth.uid(), p_yontem)
  returning id into v_hareket;

  insert into islemler
    (business_id, tur, tutar, baslik, kaynak, durum, islem_tarihi, created_by,
     cari_hareket_id, odeme_yontemi)
  values
    (ci.business_id, 'GELIR', p_tutar,
     ci.name || ' — ' || coalesce(nullif(p_note, ''), 'Ödeme'),
     'CARI_HESAP', 'BEKLIYOR', istanbul_today(), auth.uid(), v_hareket, p_yontem)
  returning id into v_islem;

  perform log_audit('ODEME_TOPLA', 'cari_hareketler', v_hareket::text,
    jsonb_build_object('islem_id', v_islem, 'tutar', p_tutar));
  return v_islem;
end;
$$;

-- Yansıtma hareketin KENDİ yöntemini taşır → "Tümünü Topla" toplu da olsa
-- her hareket kendi kovasına gider (owner: "tip type'a göre ayrışsın").
create or replace function public.yansit_cari_hareket(p_hareket_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  h record;
  ci record;
  v_islem uuid;
begin
  select * into h from cari_hareketler where id = p_hareket_id for update;
  if not found then
    raise exception 'Hareket bulunamadı.';
  end if;
  select * into ci from cari_isletmeler where id = h.cari_isletme_id;
  if not is_finance(ci.business_id) then
    raise exception 'Bu hareket için yetkiniz yok.';
  end if;
  if h.kasa_durumu <> 'YOK' then
    raise exception 'Bu hareket için ödeme zaten toplanmış veya onay bekliyor.';
  end if;

  insert into islemler
    (business_id, tur, tutar, baslik, kaynak, durum, islem_tarihi, created_by,
     cari_hareket_id, odeme_yontemi)
  values
    (ci.business_id, 'GELIR', h.tutar,
     ci.name || ' — ' || coalesce(nullif(h.note, ''),
       case when h.tur = 'GELIR' then 'Tahsilat' else 'Ödeme' end),
     'CARI_HESAP', 'BEKLIYOR', istanbul_today(), auth.uid(), h.id, h.odeme_yontemi)
  returning id into v_islem;

  update cari_hareketler set kasa_durumu = 'BEKLIYOR' where id = h.id;

  perform log_audit('YANSIT', 'cari_hareketler', h.id::text,
    jsonb_build_object('islem_id', v_islem, 'tutar', h.tutar));
  return v_islem;
end;
$$;

-- ── D. Materializer: sabit gider + cari tekrar yöntemi taşır ──
-- 039'un gövdesi birebir korundu; yalnızca iki insert'e odeme_yontemi eklendi.

create or replace function public.run_daily_materializer()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  d date := istanbul_today();
  gun int := extract(day from istanbul_today())::int;
  r record;
  v_islem uuid;
  v_kategori uuid;
  safety int;
begin
  -- 054: sabit giderin yöntemi işleme kopyalanır (kural boşsa işlem de boş)
  insert into islemler
    (business_id, tur, tutar, baslik, kategori_id, kaynak, durum,
     islem_tarihi, onaylanma_tarihi, sabit_gider_id, odeme_yontemi)
  select sg.business_id, 'GIDER', sg.tutar, sg.name, sg.kategori_id,
         'SABIT_GIDER', 'ONAYLANDI', d, now(), sg.id, sg.odeme_yontemi
  from sabit_giderler sg
  where sg.odeme_gunu = gun
  on conflict (sabit_gider_id, islem_tarihi) where sabit_gider_id is not null do nothing;

  for r in
    select bm.profile_id, bm.business_id, bm.maas, bm.odeme_yontemi, p.full_name
    from business_members bm
    join profiles p on p.id = bm.profile_id
    where bm.odeme_gunu = gun and bm.maas > 0 and p.status = 'ACTIVE'
  loop
    if not exists (
      select 1 from personel_odemeler po
      where po.profile_id = r.profile_id
        and po.business_id = r.business_id
        and po.tur = 'MAAS'
        and date_trunc('month', po.tarih) = date_trunc('month', d)
    ) then
      select id into v_kategori
      from kategoriler
      where business_id = r.business_id and tur = 'GIDER'
        and label = 'Personel Maaşı' and is_active
      limit 1;

      -- 054: otomatik maaş da kişinin ayarladığı kovaya düşer
      insert into islemler
        (business_id, tur, tutar, baslik, kategori_id, kaynak, durum,
         islem_tarihi, onaylanma_tarihi, odeme_yontemi)
      values
        (r.business_id, 'GIDER', r.maas, r.full_name || ' — Maaş', v_kategori,
         'PERSONEL', 'ONAYLANDI', d, now(), r.odeme_yontemi)
      returning id into v_islem;

      insert into personel_odemeler (profile_id, business_id, tur, tutar, note, islem_id)
      values (r.profile_id, r.business_id, 'MAAS', r.maas, 'Otomatik ödeme', v_islem);
    end if;
  end loop;

  for r in select * from tekrar_kurallari where is_active and next_run <= d loop
    safety := 0;
    while r.next_run <= d and safety < 24 loop
      if r.cari_isletme_id is null then
        v_islem := null;
        insert into islemler
          (business_id, tur, tutar, baslik, kategori_id, kaynak, durum,
           islem_tarihi, onaylanma_tarihi, tekrar_kural_id, odeme_yontemi)
        values
          (r.business_id, r.tur, r.tutar, r.baslik, r.kategori_id,
           'MANUEL', 'ONAYLANDI', r.next_run, now(), r.id, r.odeme_yontemi)
        on conflict (tekrar_kural_id, islem_tarihi) where tekrar_kural_id is not null do nothing
        returning id into v_islem;

        if v_islem is not null
           and r.odeme_yontemi = 'KREDI_KARTI'
           and coalesce(r.komisyon, 0) > 0 then
          insert into islemler
            (business_id, tur, tutar, baslik, kaynak, durum,
             islem_tarihi, onaylanma_tarihi, odeme_yontemi, komisyon_of)
          values
            (r.business_id, 'GIDER', r.komisyon,
             r.baslik || ' — bu işlemin komisyonu', 'MANUEL', 'ONAYLANDI',
             r.next_run, now(), 'KREDI_KARTI', v_islem);
        end if;
      else
        -- 054: cari tekrar hareketi de kuralın yöntemini taşır → yansıtınca
        -- doğru kovaya gider
        insert into cari_hareketler
          (cari_isletme_id, tur, tutar, note, tarih, kasa_durumu, tekrar_kural_id,
           odeme_yontemi)
        values
          (r.cari_isletme_id, r.tur, r.tutar, r.baslik, r.next_run, 'YOK', r.id,
           r.odeme_yontemi)
        on conflict (tekrar_kural_id, tarih) where tekrar_kural_id is not null do nothing;
      end if;

      r.next_run := case r.siklik
        when 'HAFTALIK' then (r.next_run + interval '7 days')::date
        when 'AYLIK'    then (r.next_run + interval '1 month')::date
        when 'YILLIK'   then (r.next_run + interval '1 year')::date
      end;
      safety := safety + 1;
    end loop;
    update tekrar_kurallari set next_run = r.next_run where id = r.id;
  end loop;

  perform log_audit('DAILY_CRON', 'system', d::text, '{}'::jsonb);
end;
$$;

-- ── E. Maaş yöntemi Personel Detay'ın düzenle bölümünden kaydedilir ──
-- update_member_pay maaş + ödeme günü ile aynı taslakta yöntemi de yazar.
-- Eski 4 argümanlı imza düşürülür (yukarıdakilerle aynı gerekçe).
--
-- DİKKAT: p_yontem DOĞRUDAN yazılır (coalesce YOK) — çünkü kullanıcının
-- seçimi kaldırıp "seçilmedi"ye dönebilmesi gerekiyor. Bunun bedeli:
-- p_yontem'siz (4 argümanlı) bir çağrı kayıtlı yöntemi SİLER. Tek çağıran
-- Personel Detay'ın taslağıdır ve her kaydetmede mevcut değeri gönderir;
-- yeni bir çağıran eklenirse yöntemi de göndermek ZORUNDA.

drop function if exists public.update_member_pay(uuid, uuid, numeric, int);

create or replace function public.update_member_pay(
  p_profile uuid, p_business uuid, p_maas numeric, p_odeme_gunu int,
  p_yontem public.odeme_yontemi default null
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_finance(p_business) then
    raise exception 'Maaş bilgisi güncelleme yetkiniz yok.';
  end if;
  if p_maas is null or p_maas < 0 or p_maas <> round(p_maas, 2) then
    raise exception 'Geçersiz maaş.';
  end if;
  if p_odeme_gunu is null or p_odeme_gunu not between 0 and 28 then
    raise exception 'Geçersiz ödeme günü (0–28).';
  end if;

  update business_members
  set maas = p_maas, odeme_gunu = p_odeme_gunu, odeme_yontemi = p_yontem
  where profile_id = p_profile and business_id = p_business;
  if not found then
    raise exception 'Üyelik bulunamadı.';
  end if;

  perform log_audit('UPDATE_PAY', 'business_members', p_profile::text,
    jsonb_build_object('business_id', p_business, 'maas', p_maas,
                       'odeme_gunu', p_odeme_gunu, 'odeme_yontemi', p_yontem));
end;
$$;
