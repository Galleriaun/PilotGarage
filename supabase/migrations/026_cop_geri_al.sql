-- ============================================================
-- PilotGarage — 026: Çöp Kutusu geri al / kalıcı sil (owner, 2026-07-11)
-- • restore_trash(id): re-inserts the snapshotted row (same id) from
--   trash.payload, then removes the trash entry. Dangling references are
--   nulled (işlem) or refused (hareket/kural whose işletme is gone).
--   A transaction-local flag (app.geri_al) keeps the insert triggers quiet:
--   no duplicate kayıt-geliri, no notification spam.
-- • Permanent delete: finance may DELETE trash rows directly (new policy).
-- ============================================================

-- ── permanent delete ──
create policy trash_delete on public.trash
  for delete using (public.is_finance(business_id));

-- ── insert triggers honor the restore flag ──

create or replace function public.kayit_tamamlandi_islem()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_paket record;
  v_kategori uuid;
  v_was_tamamlandi boolean;
begin
  if current_setting('app.geri_al', true) = '1' then
    return new; -- restoring a snapshot: its gelir already exists (or was decided)
  end if;
  if tg_op = 'INSERT' then
    v_was_tamamlandi := false;
  else
    v_was_tamamlandi := (old.durum = 'TAMAMLANDI');
  end if;

  if new.durum = 'TAMAMLANDI' and not v_was_tamamlandi then
    if new.paket_id is not null
       and not exists (select 1 from islemler
                       where kayit_id = new.id and durum <> 'REDDEDILDI') then
      select name, price into v_paket from paketler where id = new.paket_id;
      if found and v_paket.price > 0 then
        select id into v_kategori
        from kategoriler
        where business_id = new.business_id and tur = 'GELIR'
          and label = 'Servis Ücreti' and is_active
        limit 1;
        insert into islemler
          (business_id, tur, tutar, baslik, kategori_id, kaynak, durum,
           islem_tarihi, created_by, kayit_id)
        values
          (new.business_id, 'GELIR', v_paket.price,
           new.plaka || ' — ' || v_paket.name,
           v_kategori, 'KAYIT', 'BEKLIYOR', istanbul_today(), auth.uid(), new.id);
      end if;
    end if;
  elsif v_was_tamamlandi and new.durum <> 'TAMAMLANDI' then
    delete from islemler where kayit_id = new.id and durum = 'BEKLIYOR';
  end if;
  return new;
end;
$$;

create or replace function public.notif_yeni_kayit()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_creator text;
begin
  if current_setting('app.geri_al', true) = '1' then
    return new;
  end if;
  select full_name into v_creator from profiles where id = new.created_by;
  insert into notifications (profile_id, business_id, type, baslik, body, link)
  select bm.profile_id, new.business_id, 'KAYIT', 'Yeni kayıt oluşturuldu',
         new.plaka
           || case when new.musteri_adi <> '' then ' — ' || new.musteri_adi else '' end
           || ' • ' || coalesce(nullif(v_creator, ''), 'Bilinmiyor'),
         '/kayit/' || new.id
  from business_members bm
  join profiles p on p.id = bm.profile_id
  where bm.business_id = new.business_id
    and p.status = 'ACTIVE'
    and (new.created_by is null or bm.profile_id <> new.created_by);
  return new;
end;
$$;

create or replace function public.notif_islem_bekliyor()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if current_setting('app.geri_al', true) = '1' then
    return new;
  end if;
  if new.durum = 'BEKLIYOR' then
    perform notify_finance(new.business_id, 'ONAY', 'Onay bekleyen işlem',
      new.baslik, '/yonetim/onay', new.created_by);
  end if;
  return new;
end;
$$;

-- ── restore ──

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
    -- null any reference whose parent is gone (history stays valid detached)
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
    insert into islemler select * from jsonb_populate_record(null::public.islemler, r);
    -- a restored cari işlem re-claims its hareket's kasa state
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
