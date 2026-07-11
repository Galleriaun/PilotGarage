-- ============================================================
-- PilotGarage — 019: Tekrar kuralları da Onay'ı atlar (owner, 2026-07-10)
-- Same reasoning as 016 (sabit giderler): a recurring gelir/gider was
-- approved once when it was set up — the cron now materializes its monthly
-- işlem born ONAYLANDI, straight to kasa. Cari-targeted rules are unchanged
-- (hareket born YOK; kasa only via yansıt + Onay).
-- ============================================================

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
        insert into islemler
          (business_id, tur, tutar, baslik, kategori_id, kaynak, durum,
           islem_tarihi, onaylanma_tarihi, tekrar_kural_id)
        values
          (r.business_id, r.tur, r.tutar, r.baslik, r.kategori_id,
           'MANUEL', 'ONAYLANDI', r.next_run, now(), r.id)
        on conflict (tekrar_kural_id, islem_tarihi) where tekrar_kural_id is not null do nothing;
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
