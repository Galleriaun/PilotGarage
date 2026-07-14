-- ============================================================
-- PilotGarage — 033: Kredi kartı komisyonu (owner request 2026-07-13)
--
-- KREDI_KARTI seçilen işlemlere isteğe bağlı komisyon tutarı girilir;
-- işlem kasaya işlendiği anda komisyon AYRI bir gider işlemi olarak
-- düşülür (baslik: '<işlem> — bu işlemin komisyonu', yöntem KK, born
-- ONAYLANDI — ana işlem zaten onaydan geçti). Uygulama noktaları:
--   • approve_islem: bekleyen işlemin saklı komisyonu ya da onay anında
--     girilen p_komisyon (KAYIT işlemlerinde KK seçilince). p_komisyon = 0
--     saklı komisyonu iptal eder. Yalnızca nihai yöntem KREDI_KARTI ise
--     uygulanır; reddedilen işlem komisyon üretmez.
--   • run_daily_materializer: tekrar kuralı KK + komisyonlu ise her
--     dönemde ana işlemle birlikte komisyon gideri de oluşur (dedupe:
--     komisyon yalnızca ana işlem gerçekten eklendiyse eklenir).
-- ============================================================

alter table public.islemler
  add column komisyon numeric(12,2) check (komisyon is null or komisyon >= 0);

alter table public.tekrar_kurallari
  add column odeme_yontemi public.odeme_yontemi,
  add column komisyon numeric(12,2) check (komisyon is null or komisyon >= 0);

-- ── approve: komisyon parametresi (3. arg) ──
-- Eski 2-arg imza düşürülür ki adlandırılmış çağrılar belirsiz kalmasın (007 dersi).

drop function if exists public.approve_islem(uuid, public.odeme_yontemi);

create function public.approve_islem(
  p_islem_id uuid,
  p_odeme_yontemi public.odeme_yontemi default null,
  p_komisyon numeric default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v record;
  v_yontem public.odeme_yontemi;
  v_komisyon numeric;
begin
  select * into v from islemler where id = p_islem_id for update;
  if not found then
    raise exception 'İşlem bulunamadı.';
  end if;
  if not is_finance(v.business_id) then
    raise exception 'Bu işlemi onaylama yetkiniz yok.';
  end if;
  if v.durum <> 'BEKLIYOR' then
    raise exception 'İşlem zaten sonuçlandırılmış.';
  end if;
  if v.kaynak = 'KAYIT' and p_odeme_yontemi is null and v.odeme_yontemi is null then
    raise exception 'Kayıt işlemi onaylanırken ödeme yöntemi (Nakit / Kredi Kartı / Havale) seçilmelidir.';
  end if;
  if p_komisyon is not null and p_komisyon < 0 then
    raise exception 'Geçerli bir komisyon girin.';
  end if;

  v_yontem := coalesce(p_odeme_yontemi, v.odeme_yontemi);
  -- p_komisyon = 0 → saklı komisyon iptal; null → saklı komisyon geçerli
  v_komisyon := nullif(coalesce(p_komisyon, v.komisyon, 0), 0);
  if v_komisyon is not null and v_yontem <> 'KREDI_KARTI' then
    v_komisyon := null; -- komisyon yalnızca kredi kartında uygulanır
  end if;
  if v_komisyon is not null and v_komisyon >= v.tutar then
    raise exception 'Komisyon işlem tutarından küçük olmalıdır.';
  end if;

  update islemler
  set durum = 'ONAYLANDI',
      onaylayan = auth.uid(),
      onaylanma_tarihi = now(),
      odeme_yontemi = coalesce(p_odeme_yontemi, odeme_yontemi)
  where id = p_islem_id;

  if v.cari_hareket_id is not null then
    update cari_hareketler set kasa_durumu = 'YANSIDI' where id = v.cari_hareket_id;
  end if;

  if v_komisyon is not null then
    insert into islemler
      (business_id, tur, tutar, baslik, kaynak, durum,
       islem_tarihi, created_by, onaylayan, onaylanma_tarihi, odeme_yontemi)
    values
      (v.business_id, 'GIDER', v_komisyon,
       v.baslik || ' — bu işlemin komisyonu', 'MANUEL', 'ONAYLANDI',
       v.islem_tarihi, auth.uid(), auth.uid(), now(), 'KREDI_KARTI');
  end if;

  perform log_audit('APPROVE', 'islemler', p_islem_id::text,
    jsonb_build_object(
      'tutar', v.tutar,
      'tur', v.tur,
      'kaynak', v.kaynak,
      'odeme_yontemi', coalesce(p_odeme_yontemi, v.odeme_yontemi),
      'komisyon', v_komisyon
    ));
end;
$$;

-- ── Materializer: tekrar kuralı yöntemini kopyalar + KK komisyonunu düşer ──

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
  -- 1) Sabit giderler due today -> born-ONAYLANDI GİDER, straight to kasa
  --    (unique index dedupes reruns)
  insert into islemler
    (business_id, tur, tutar, baslik, kategori_id, kaynak, durum,
     islem_tarihi, onaylanma_tarihi, sabit_gider_id)
  select sg.business_id, 'GIDER', sg.tutar, sg.name, sg.kategori_id,
         'SABIT_GIDER', 'ONAYLANDI', d, now(), sg.id
  from sabit_giderler sg
  where sg.odeme_gunu = gun
  on conflict (sabit_gider_id, islem_tarihi) where sabit_gider_id is not null do nothing;

  -- 2) Otomatik maaş: members with odeme_gunu = today, once per month
  for r in
    select bm.profile_id, bm.business_id, bm.maas, p.full_name
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

      insert into islemler
        (business_id, tur, tutar, baslik, kategori_id, kaynak, durum,
         islem_tarihi, onaylanma_tarihi)
      values
        (r.business_id, 'GIDER', r.maas, r.full_name || ' — Maaş', v_kategori,
         'PERSONEL', 'ONAYLANDI', d, now())
      returning id into v_islem;

      insert into personel_odemeler (profile_id, business_id, tur, tutar, note, islem_id)
      values (r.profile_id, r.business_id, 'MAAS', r.maas, 'Otomatik ödeme', v_islem);
    end if;
  end loop;

  -- 3) Tekrar kuralları due -> born-ONAYLANDI işlem (kasa) OR cari hareket
  --    born YOK, one per period, advancing next_run
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

        -- KK komisyonu: her dönem, yalnızca ana işlem gerçekten eklendiyse
        -- (rerun dedupe — komisyonun kendi dedupe anahtarı yok)
        if v_islem is not null
           and r.odeme_yontemi = 'KREDI_KARTI'
           and coalesce(r.komisyon, 0) > 0 then
          insert into islemler
            (business_id, tur, tutar, baslik, kaynak, durum,
             islem_tarihi, onaylanma_tarihi, odeme_yontemi)
          values
            (r.business_id, 'GIDER', r.komisyon,
             r.baslik || ' — bu işlemin komisyonu', 'MANUEL', 'ONAYLANDI',
             r.next_run, now(), 'KREDI_KARTI');
        end if;
      else
        -- cari hareket born YOK: reaches the kasa only via yansıt + Onay
        insert into cari_hareketler
          (cari_isletme_id, tur, tutar, note, tarih, kasa_durumu, tekrar_kural_id)
        values
          (r.cari_isletme_id, r.tur, r.tutar, r.baslik, r.next_run, 'YOK', r.id)
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
