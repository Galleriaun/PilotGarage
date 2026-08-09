-- ============================================================
-- PilotGarage — 059: Maaş borç düşümü serileştirilir (057 sertleştirmesi)
--
-- MEVCUT AÇIK: 057 avans borcunu TÜRETİR (saklamaz) ve maaş öderken
-- oku → karar ver → yaz yapar:
--     v_borc    := avans_borcu(...);        -- OKU  (defterden türetilir)
--     v_dusulen := least(m.maas, v_borc);   -- KARAR
--     insert into personel_odemeler (... avans_dusulen)  -- YAZ (borcu düşüren tek şey)
-- Arada hiçbir kilit yok ve Postgres READ COMMITTED çalışır: henüz commit
-- etmemiş bir işlem görünmez. İki düşüm çakışırsa İKİSİ DE aynı borcu okur
-- ve aynı borcu ayrı ayrı düşer.
--
-- ₺30.000 maaş / ₺15.000 borç ile:
--   doğru sıralı: net 15.000 + net 30.000 = 45.000 çıkar, Σ avans_dusulen 15.000
--   yarışan     : net 15.000 + net 15.000 = 30.000 çıkar, Σ avans_dusulen 30.000
-- Yani personel 15.000 EKSİK alır. Üstelik avans_borcu()'nun sonundaki
-- greatest(..., 0) ham sonucu (-15.000) sıfıra kırptığı için ekranda da,
-- audit'te de HİÇBİR İZ KALMAZ — her ödeme tek tek doğru görünür.
--
-- Bu, projede üçüncü kez aynı desen; diğer ikisi zaten kilitli:
--   043 para_transferi  → pg_advisory_xact_lock('para_transferi:' || business)
--   053 cepten_geri_ode → pg_advisory_xact_lock('cepten:' || business || ':' || yonetici)
--   057 pay_maas        → (yok)   ← burada kapatılıyor
--
-- GERÇEKÇİ ÇAKIŞMA YOLLARI (istemcideki çift dokunuş DEĞİL — Maaş Öde
-- ConfirmDialog'u mutation sürerken butonu kilitliyor):
--   • elle Maaş Öde, gece 00:05'teki cron'a denk gelirse
--   • iki Yönetici aynı kişiye aynı anda öderse
--   • RPC doğrudan çağrılırsa (istemci kilidi güvenlik sınırı değildir — 044 dersi)
--
-- KAPSAM: yalnızca kilit. Maaşın dönem başına tekilliği (pay_maas'ın ayda
-- ikinci kez çağrılabilmesi) BİLEREK DEĞİŞMEDİ — bu bir davranış kararıdır
-- (elle ödeme, otomatik ödemenin üstüne bilerek yapılabilir) ve unique index
-- ile kapatılması owner kararı gerektirir. Kilit sonrası bu senaryo da PARA
-- OLARAK DOĞRUDUR: ikinci ödeme borcu 0 görür ve tam maaş öder.
--
-- İMZALAR DEĞİŞMİYOR → drop gerekmez, create or replace yeterli
-- (033/054/055 dersi: parametre listesi değişseydi aşırı yükleme oluşurdu).
-- Gövdeler 057'den BİREBİR kopyalandı; aşağıda "059:" ile işaretli satırlar
-- dışında tek karakter farkı yoktur.
-- ============================================================

-- ── A. Elle maaş ödeme ──
-- Kilit borç OKUNMADAN ÖNCE alınır ve xact ömürlü olduğu için yazma da dahil
-- commit'e kadar sürer. Anahtar işletme+kişi başına: farklı personelin maaşı
-- birbirini beklemez.

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
  v_borc numeric;
  v_dusulen numeric;
  v_net numeric;
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

  -- 059: aynı kişiye eşzamanlı iki maaş ödemesi aynı borcu iki kez düşmesin.
  -- Yetki/üyelik kontrollerinden SONRA alınır (reddedilecek çağrı kilit tutmaz),
  -- avans_borcu() okumasından ÖNCE alınır (asıl korunan aralık burası).
  perform pg_advisory_xact_lock(
    hashtext('maas:' || p_business::text || ':' || p_profile::text));

  select full_name into v_name from profiles where id = p_profile;
  select id into v_kategori
  from kategoriler
  where business_id = p_business and tur = 'GIDER'
    and label = 'Personel Maaşı' and is_active
  limit 1;

  -- 057: borç (bu dönemin avansı dahil) maaştan düşülür; aşan kısım defterde
  -- kalır ve kendiliğinden sonraki döneme devreder (ayrı devir kaydı yok).
  v_borc := avans_borcu(p_profile, p_business);
  v_dusulen := least(m.maas, v_borc);
  v_net := m.maas - v_dusulen;

  insert into islemler
    (business_id, tur, tutar, baslik, kategori_id, kaynak, durum,
     islem_tarihi, created_by, onaylayan, onaylanma_tarihi, odeme_yontemi)
  values
    (p_business, 'GIDER', v_net, v_name || ' — Maaş', v_kategori, 'PERSONEL',
     'ONAYLANDI', istanbul_today(), auth.uid(), auth.uid(), now(),
     coalesce(p_yontem, m.odeme_yontemi))
  returning id into v_islem;

  -- Deftere TAM maaş yazılır (tutar > 0 kısıtı korunur); ne kadarının borca
  -- sayıldığı avans_dusulen'de durur.
  insert into personel_odemeler
    (profile_id, business_id, tur, tutar, islem_id, created_by, avans_dusulen)
  values (p_profile, p_business, 'MAAS', m.maas, v_islem, auth.uid(), v_dusulen);

  perform log_audit('MAAS', 'personel_odemeler', p_profile::text,
    jsonb_build_object('tutar', m.maas, 'islem_id', v_islem,
                       'avans_dusulen', v_dusulen, 'net', v_net));
  return v_islem;
end;
$$;

-- ── B. Cron otomatik maaşı: aynı kilit, DÖNGÜNÜN BAŞINDA ──
-- Kilit `if not exists (... bu ay MAAS var mı ...)` kontrolünden de ÖNCE
-- alınır: o kontrol de aynı yarışa açıktı (bayat okuma → ikinci maaş).
-- Kilit alındıktan sonraki ifade yeni bir snapshot görür, yani elle ödeme
-- commit ettiyse cron onu GÖRÜR ve atlar.
--
-- ORDER BY profile_id (059): xact kilitleri commit'e kadar tutulduğu için
-- döngü kişi başına kilit BİRİKTİRİR. İki materializer aynı anda koşarsa
-- (pg_cron normalde üst üste bindirmez ama fonksiyon dışarıdan da
-- çağrılabiliyordu — aşağıdaki revoke bunu da kapatıyor) kilitleri FARKLI
-- SIRADA alıp deadlock üretebilirlerdi. Deterministik sıra bu sınıfı tümden
-- eler. pay_maas ile deadlock zaten imkânsız: o TEK kilit alır ve ikincisini
-- hiç istemez, dolayısıyla döngü oluşamaz.

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
  v_borc numeric;
  v_dusulen numeric;
  v_net numeric;
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
    order by bm.profile_id, bm.business_id   -- 059: deterministik kilit sırası
  loop
    -- 059: elle Maaş Öde ile aynı anahtar; dedupe kontrolünden de önce
    perform pg_advisory_xact_lock(
      hashtext('maas:' || r.business_id::text || ':' || r.profile_id::text));

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

      -- 057: otomatik maaş da avans borcunu düşer (elle ödemeyle birebir)
      v_borc := avans_borcu(r.profile_id, r.business_id);
      v_dusulen := least(r.maas, v_borc);
      v_net := r.maas - v_dusulen;

      insert into islemler
        (business_id, tur, tutar, baslik, kategori_id, kaynak, durum,
         islem_tarihi, onaylanma_tarihi, odeme_yontemi)
      values
        (r.business_id, 'GIDER', v_net, r.full_name || ' — Maaş', v_kategori,
         'PERSONEL', 'ONAYLANDI', d, now(), r.odeme_yontemi)
      returning id into v_islem;

      insert into personel_odemeler
        (profile_id, business_id, tur, tutar, note, islem_id, avans_dusulen)
      values (r.profile_id, r.business_id, 'MAAS', r.maas, 'Otomatik ödeme',
              v_islem, v_dusulen);
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
        -- 054: cari tekrar hareketi de kuralın yöntemini taşır
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

-- ── C. Cron fonksiyonları istemciye kapatılır ──
-- 058 dersi: PostgreSQL yeni fonksiyonlara EXECUTE'u PUBLIC'e verir ve
-- `authenticated` PUBLIC üyesidir → `from anon, authenticated` TEK BAŞINA
-- hiçbir şey kapatmaz, `from public` şart.
--
-- Bu iki fonksiyonda `is_finance` GUARD'I YOK ve OLAMAZ (cron'da auth.uid()
-- null'dır, guard her gece patlardı — 057'nin avans_borcu ile aynı durumu).
-- Guard yoksa tek koruma grant'tır; şu ana kadar ikisi de HERKESE AÇIKTI:
-- giriş yapmış herhangi bir kullanıcı (PERSONEL dahil) gece işini elle
-- tetikleyip maaşları/sabit giderleri/tekrar işlemlerini kasaya yazdırabilir,
-- kayıt durumlarını ilerletebilirdi. Dedupe guard'ları sayesinde vadesi
-- gelmemiş para ÜRETİLEMİYORDU, ama bu bir yetki sınırıdır ve kapalı olmalı.
--
-- `create or replace` mevcut ACL'i korur (drop+create ACL'i sıfırlar), bu
-- yüzden revoke'lar tanımlardan SONRA gelir ve ileride gövde tekrar
-- değiştirilse de yerinde kalır.
-- İstemcide çağıran yok (src/ altında tek referans dahi yok — kontrol edildi).

revoke all on function public.run_daily_materializer() from public;
revoke all on function public.run_daily_materializer() from anon, authenticated;
revoke all on function public.run_saat_transitions() from public;
revoke all on function public.run_saat_transitions() from anon, authenticated;

-- Güvenlik ağı 1: revoke tuttu mu? (058 deseni — sessizce açık kalmasın)
do $$
begin
  if has_function_privilege('authenticated', 'public.run_daily_materializer()', 'execute') then
    raise exception '059: run_daily_materializer hâlâ authenticated tarafından çağrılabiliyor.';
  end if;
  if has_function_privilege('authenticated', 'public.run_saat_transitions()', 'execute') then
    raise exception '059: run_saat_transitions hâlâ authenticated tarafından çağrılabiliyor.';
  end if;
end;
$$;

-- Güvenlik ağı 2: revoke gece işini KIRMASIN. Cron job'ı kendi rolüyle çalışır;
-- fonksiyonun sahibi (SECURITY DEFINER) grant'lardan bağımsız olarak yetkisini
-- korur, ama job başka bir rolle kurulduysa bunu burada görmek gerekir —
-- yoksa hata ilk olarak gece 00:05'te, sessizce ortaya çıkardı.
do $$
declare
  j record;
begin
  if to_regclass('cron.job') is null then
    raise notice '059: pg_cron kurulu değil — cron rol kontrolü atlandı.';
  else
    for j in
      select jobname, username from cron.job
      where jobname in ('pilotgarage-daily', 'pilotgarage-saat')
    loop
      if j.jobname = 'pilotgarage-daily'
         and not has_function_privilege(j.username, 'public.run_daily_materializer()', 'execute') then
        raise exception '059: cron rolü (%) run_daily_materializer''ı çalıştıramıyor — gece işi durur.', j.username;
      end if;
      if j.jobname = 'pilotgarage-saat'
         and not has_function_privilege(j.username, 'public.run_saat_transitions()', 'execute') then
        raise exception '059: cron rolü (%) run_saat_transitions''ı çalıştıramıyor — saat işi durur.', j.username;
      end if;
    end loop;
  end if;
exception
  when others then
    -- Kendi raise'lerimiz YUTULMAZ: aşağıdaki satır onları yeniden fırlatır,
    -- yani "cron rolü çalıştıramıyor" hatası migration'ı yine durdurur.
    if sqlerrm like '059:%' then raise; end if;
    -- Ama bu blok yalnızca bir GÜVENLİK AĞI: pg_cron'un katalog şekli sürüme
    -- göre değişebilir (ör. cron.job.username yoksa) ve bu, revoke'un kendisini
    -- geçersiz kılmaz — metadata farkı yüzünden migration'ı düşürmek yanlış olur.
    raise notice '059: cron rol kontrolü yapılamadı (%) — gece işini elle doğrulayın.', sqlerrm;
end;
$$;
