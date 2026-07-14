-- ============================================================
-- PilotGarage — 039: Komisyon işlemini ana işleme bağla (code review #1)
--
-- 033'te KK komisyonu AYRI bir gider işlemi olarak doğuyordu ama ana
-- işleme referansı yoktu — ana işlem delete_islem ile silinince komisyon
-- gideri kasada ÖKSÜZ kalıyordu ("… — bu işlemin komisyonu" ama işlem yok).
-- Çözüm: islemler.komisyon_of ana işleme işaret eder; approve_islem ve
-- materializer komisyonu bu bağla üretir; delete_islem ana işlemi silerken
-- bağlı komisyonu da (aynı flag'li yolla) siler; restore_trash ana işlem
-- gitmişse komisyon_of'u null'lar.
-- ============================================================

alter table public.islemler
  add column if not exists komisyon_of uuid references public.islemler (id) on delete set null;
create index if not exists islemler_komisyon_of_idx on public.islemler (komisyon_of)
  where komisyon_of is not null;

-- ── approve: komisyonu ana işleme bağla (033 gövdesi + komisyon_of) ──

create or replace function public.approve_islem(
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
  v_komisyon := nullif(coalesce(p_komisyon, v.komisyon, 0), 0);
  if v_komisyon is not null and v_yontem <> 'KREDI_KARTI' then
    v_komisyon := null;
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
       islem_tarihi, created_by, onaylayan, onaylanma_tarihi, odeme_yontemi, komisyon_of)
    values
      (v.business_id, 'GIDER', v_komisyon,
       v.baslik || ' — bu işlemin komisyonu', 'MANUEL', 'ONAYLANDI',
       v.islem_tarihi, auth.uid(), auth.uid(), now(), 'KREDI_KARTI', p_islem_id);
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

-- ── materializer: cron komisyonunu da ana işleme bağla (033 gövdesi) ──

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
  insert into islemler
    (business_id, tur, tutar, baslik, kategori_id, kaynak, durum,
     islem_tarihi, onaylanma_tarihi, sabit_gider_id)
  select sg.business_id, 'GIDER', sg.tutar, sg.name, sg.kategori_id,
         'SABIT_GIDER', 'ONAYLANDI', d, now(), sg.id
  from sabit_giderler sg
  where sg.odeme_gunu = gun
  on conflict (sabit_gider_id, islem_tarihi) where sabit_gider_id is not null do nothing;

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

-- ── delete_islem: bağlı komisyonu da sil (024 gövdesi + komisyon çocuğu) ──

create or replace function public.delete_islem(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v record;
  c record;
begin
  select * into v from islemler where id = p_id for update;
  if not found then
    raise exception 'İşlem bulunamadı.';
  end if;
  if not is_finance(v.business_id) then
    raise exception 'Bu işlemi silme yetkiniz yok.';
  end if;

  -- bağlı komisyon giderleri (ONAYLANDI) — ana işlemle birlikte silinir
  for c in select id from islemler where komisyon_of = p_id loop
    perform set_config('app.islem_sil', c.id::text, true);
    delete from islemler where id = c.id;
  end loop;

  if v.cari_hareket_id is not null then
    update cari_hareketler set kasa_durumu = 'YOK' where id = v.cari_hareket_id;
  end if;

  perform set_config('app.islem_sil', p_id::text, true);
  delete from islemler where id = p_id;
  perform set_config('app.islem_sil', '', true);

  perform log_audit('DELETE_ISLEM', 'islemler', p_id::text,
    jsonb_build_object('baslik', v.baslik, 'tutar', v.tutar, 'tur', v.tur,
                       'kaynak', v.kaynak, 'durum', v.durum));
end;
$$;

-- ── restore_trash: ISLEM dalına komisyon_of dangling-FK null'laması ──
-- (026 gövdesi; yalnızca ISLEM dalına bir kontrol eklendi.)

create or replace function public.restore_trash(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  t record;
  r jsonb;
begin
  select * into t from trash where id = p_id for update;
  if not found then
    raise exception 'Öğe bulunamadı.';
  end if;
  if not is_finance(t.business_id) then
    raise exception 'Geri alma yetkiniz yok.';
  end if;
  r := t.payload;
  perform set_config('app.geri_al', '1', true);

  if t.item_type = 'KAYIT' then
    r := r || '{"silme_talebi_by": null, "silme_talebi_at": null}'::jsonb;
    if r->>'paket_id' is not null
       and not exists (select 1 from paketler where id = (r->>'paket_id')::uuid) then
      r := jsonb_set(r, '{paket_id}', 'null');
    end if;
    insert into kayitlar select * from jsonb_populate_record(null::public.kayitlar, r);

  elsif t.item_type = 'ISLETME' then
    insert into cari_isletmeler
    select * from jsonb_populate_record(null::public.cari_isletmeler, r);

  elsif t.item_type = 'HAREKET' then
    if not exists (select 1 from cari_isletmeler
                   where id = (r->>'cari_isletme_id')::uuid) then
      raise exception 'Bağlı işletme silinmiş — hareket geri alınamaz.';
    end if;
    if r->>'tekrar_kural_id' is not null
       and not exists (select 1 from tekrar_kurallari
                       where id = (r->>'tekrar_kural_id')::uuid) then
      r := jsonb_set(r, '{tekrar_kural_id}', 'null');
    end if;
    insert into cari_hareketler
    select * from jsonb_populate_record(null::public.cari_hareketler, r);

  elsif t.item_type = 'SABIT_GIDER' then
    insert into sabit_giderler
    select * from jsonb_populate_record(null::public.sabit_giderler, r);

  elsif t.item_type = 'TEKRAR' then
    if r->>'cari_isletme_id' is not null
       and not exists (select 1 from cari_isletmeler
                       where id = (r->>'cari_isletme_id')::uuid) then
      raise exception 'Bağlı işletme silinmiş — kural geri alınamaz.';
    end if;
    insert into tekrar_kurallari
    select * from jsonb_populate_record(null::public.tekrar_kurallari, r);

  elsif t.item_type = 'ISLEM' then
    if r->>'kayit_id' is not null
       and not exists (select 1 from kayitlar where id = (r->>'kayit_id')::uuid) then
      r := jsonb_set(r, '{kayit_id}', 'null');
    end if;
    if r->>'cari_hareket_id' is not null
       and not exists (select 1 from cari_hareketler
                       where id = (r->>'cari_hareket_id')::uuid) then
      r := jsonb_set(r, '{cari_hareket_id}', 'null');
    end if;
    if r->>'sabit_gider_id' is not null
       and not exists (select 1 from sabit_giderler
                       where id = (r->>'sabit_gider_id')::uuid) then
      r := jsonb_set(r, '{sabit_gider_id}', 'null');
    end if;
    if r->>'tekrar_kural_id' is not null
       and not exists (select 1 from tekrar_kurallari
                       where id = (r->>'tekrar_kural_id')::uuid) then
      r := jsonb_set(r, '{tekrar_kural_id}', 'null');
    end if;
    -- ana işlem gitmişse komisyon bağını kopar (öksüz komisyon geri alınabilir)
    if r->>'komisyon_of' is not null
       and not exists (select 1 from islemler where id = (r->>'komisyon_of')::uuid) then
      r := jsonb_set(r, '{komisyon_of}', 'null');
    end if;
    insert into islemler select * from jsonb_populate_record(null::public.islemler, r);
    if r->>'cari_hareket_id' is not null then
      update cari_hareketler
      set kasa_durumu = case when r->>'durum' = 'ONAYLANDI' then 'YANSIDI'
                             when r->>'durum' = 'BEKLIYOR' then 'BEKLIYOR'
                             else kasa_durumu end::public.kasa_durum
      where id = (r->>'cari_hareket_id')::uuid;
    end if;

  else
    raise exception 'Bilinmeyen öğe türü.';
  end if;

  perform set_config('app.geri_al', '', true);
  delete from trash where id = p_id;

  perform log_audit('RESTORE', 'trash', p_id::text,
    jsonb_build_object('type', t.item_type, 'title', t.title));
end;
$$;
