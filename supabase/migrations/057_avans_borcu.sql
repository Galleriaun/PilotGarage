-- ============================================================
-- PilotGarage — 057: Avans borcu ve maaştan düşme (owner request 2026-07-29)
--
-- MEVCUT AÇIK: avans ve maaş birbirinden bağımsız kasa gideri üretiyordu.
-- Personel Detay kartı "Kalan (ödenecek) = maaş − avans" yazıp avansın altına
-- "Maaştan düşülecek" notunu koyuyor AMA pay_maas işlemi TAM maaşla açıyordu.
-- Yani ₺30.000 maaşlı personele ₺15.000 avans verilip Maaş Öde'ye basılınca
-- kasadan ₺45.000 çıkıyordu — avans iki kez ödeniyordu. Bu migration düşümü
-- gerçekten yapar ve üstüne devir kuralını getirir:
--   avans maaşı aşarsa AŞAN KISIM sonraki maaş dönemine borç olarak devreder.
--
-- Owner kararları:
--   1) TEMİZ BAŞLANGIÇ — yalnızca bu migration'dan SONRA verilen avanslar
--      borca sayılır; mevcut avans satırları bilgi olarak kalır (kimsenin bir
--      sonraki maaşı geçmiş veriyle sıfırlanmasın).
--   2) Düşüm maaşı tamamen yerse `tutar = 0` bir kasa işlemi yazılır.
--   3) GEÇMİŞ DÜZELTİLMEZ — bugüne kadar tam ödenmiş maaşlara dokunulmaz
--      (karşı kayıt/backfill yok). Kasa, migration öncesi kurtarılmamış avans
--      kadar düşük kalır ve bu fark kapanmaz; düzeltme ileriye işler.
--
-- Borç HİÇBİR YERDE SAKLANMAZ — türetilir (projenin "balance is a view, never
-- a stored number" kuralı):
--   borç = Σ(onaylı + borca sayılan AVANS) − Σ(MAAS satırlarındaki avans_dusulen)
-- ============================================================

-- ── A. Defter kolonları ──

alter table public.personel_odemeler
  add column avans_dusulen numeric(12,2) not null default 0
    check (avans_dusulen >= 0),
  add column borca_sayilir boolean not null default true;

comment on column public.personel_odemeler.avans_dusulen is
  'MAAS satırında: bu ödemenin kapattığı avans borcu (kasaya net tutar yazılır).';
comment on column public.personel_odemeler.borca_sayilir is
  'AVANS satırında: borca dahil mi. 057 öncesi satırlar false (temiz başlangıç).';

-- Owner kararı 1: mevcut TÜM satırlar borç dışı. Yeni satırlar default true doğar.
update public.personel_odemeler set borca_sayilir = false;

-- ── B. Sıfır tutarlı kasa işlemine dar izin ──
-- Borç maaşı tamamen yerse kasaya 0 tutarlı bir maaş satırı yazılır (owner
-- kararı 2) — "maaşın tamamı avans borcuna sayıldı, kasadan para çıkmadı".
-- İzin BİLEREK DAR: yalnızca kaynak = PERSONEL. Kayıt/cari/manuel/transfer/
-- sabit gider tarafında `tutar > 0` değişmezliği aynen sürer.
-- Enum karşılaştırması ::text ile (041/052 dersi: yeni enum değeri güvenliği).

alter table public.islemler drop constraint if exists islemler_tutar_check;
alter table public.islemler add constraint islemler_tutar_check
  check (tutar > 0 or (tutar = 0 and kaynak::text = 'PERSONEL'));

-- Güvenlik ağı: `islemler_tutar_check` 001'deki satır-içi `check (tutar > 0)`
-- ifadesinin Postgres'in otomatik verdiği adıdır (<tablo>_<kolon>_check) ve
-- tutar üzerinde başka check yok — ama ad tutmazsa yukarıdaki `if exists`
-- SESSİZCE hiçbir şey düşürmez, eski `> 0` kısıtı kalır ve 0 tutarlı maaş
-- üretimde patlar. Yarım uygulanmış migration bırakmaktansa burada durur.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.islemler'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%tutar%>%0%'
      and pg_get_constraintdef(oid) not ilike '%PERSONEL%'
  ) then
    raise exception '057: eski "tutar > 0" kısıtı hâlâ duruyor — 0 tutarlı maaş yazılamaz. Kısıt adını kontrol edin.';
  end if;
end;
$$;

-- ── C. Borç hesabı (tek kaynak: hem pay_maas hem cron bunu kullanır) ──
-- is_finance GUARD'I YOK ve olamaz: materializer'ı cron çalıştırır, orada
-- auth.uid() null'dır ve guard her gece patlardı. Bunun yerine istemciye
-- doğrudan kapatılıyor (aşağıdaki revoke); ekran kendi sayısını zaten RLS'ten
-- okuduğu satırlardan hesaplıyor.

create or replace function public.avans_borcu(p_profile uuid, p_business uuid)
returns numeric
language sql stable security definer set search_path = public
as $$
  select greatest(
    coalesce((
      select sum(po.tutar)
      from personel_odemeler po
      join islemler i on i.id = po.islem_id
      where po.profile_id = p_profile
        and po.business_id = p_business
        and po.tur = 'AVANS'
        and po.borca_sayilir
        and i.durum = 'ONAYLANDI'   -- 045: avans Onay'dan geçer
    ), 0)
    -
    coalesce((
      select sum(po.avans_dusulen)
      from personel_odemeler po
      where po.profile_id = p_profile
        and po.business_id = p_business
        and po.tur = 'MAAS'
    ), 0),
    0);
$$;

revoke execute on function public.avans_borcu(uuid, uuid) from anon, authenticated;

-- ── D. Elle maaş ödeme: net öde, düşümü deftere yaz ──
-- Gövde 054'ten birebir; tek fark borç düşümü. Ödeme yöntemi yine kişinin
-- üyelik satırından gelir (054), maaş yine born-ONAYLANDI (045 istisnası).

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

-- ── E. Cron otomatik maaşı: birebir aynı düşüm ──
-- 054'ün gövdesi korunur; yalnızca maaş bloğuna borç düşümü girer. Elle ve
-- otomatik maaşın ayrışmasına izin verilmez (054'te bilerek hizalanmışlardı).

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
