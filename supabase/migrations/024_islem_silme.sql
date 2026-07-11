-- ============================================================
-- PilotGarage — 024: İşlem silme (owner request 2026-07-11)
-- Finance can delete any işlem from Tüm İşlemler. Deletion is RPC-only:
-- the immutability guard now permits exactly the row the RPC flagged via
-- a transaction-local setting — no other delete path for decided rows.
-- The kasa is a view over ONAYLANDI rows, so it recalculates by itself.
-- A deleted cari işlem releases its hareket back to YOK (re-yansıt'able);
-- the deleted row is snapshotted into the trash (018).
-- ============================================================

-- Guard: BEKLIYOR rows behave as before; decided rows additionally allow
-- the DELETE flagged by delete_islem().
create or replace function public.islemler_immutable_guard()
returns trigger
language plpgsql
as $$
declare
  detachable text[] := array['kayit_id', 'cari_hareket_id', 'sabit_gider_id', 'tekrar_kural_id'];
begin
  if old.durum = 'BEKLIYOR' then
    if tg_op = 'UPDATE' then
      return new;
    end if;
    return old;
  end if;
  if tg_op = 'DELETE'
     and current_setting('app.islem_sil', true) = old.id::text then
    return old;
  end if;
  if tg_op = 'UPDATE'
     and to_jsonb(new) - detachable = to_jsonb(old) - detachable
     and (new.kayit_id is not distinct from old.kayit_id or new.kayit_id is null)
     and (new.cari_hareket_id is not distinct from old.cari_hareket_id or new.cari_hareket_id is null)
     and (new.sabit_gider_id is not distinct from old.sabit_gider_id or new.sabit_gider_id is null)
     and (new.tekrar_kural_id is not distinct from old.tekrar_kural_id or new.tekrar_kural_id is null)
  then
    return new;
  end if;
  raise exception 'Onaylanmış veya reddedilmiş işlem değiştirilemez/silinemez — düzeltme için karşı kayıt girin.';
end;
$$;

create or replace function public.delete_islem(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v record;
begin
  select * into v from islemler where id = p_id for update;
  if not found then
    raise exception 'İşlem bulunamadı.';
  end if;
  if not is_finance(v.business_id) then
    raise exception 'Bu işlemi silme yetkiniz yok.';
  end if;

  -- release the hareket so it can be sent to the kasa again if needed
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

-- deleted işlemler go to the trash like everything else
create or replace function public.trash_capture()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_business uuid;
  v_title text;
  v_type text;
begin
  if tg_table_name = 'kayitlar' then
    v_business := old.business_id; v_type := 'KAYIT';
    v_title := old.plaka
      || case when old.musteri_adi <> '' then ' — ' || old.musteri_adi else '' end;
  elsif tg_table_name = 'cari_isletmeler' then
    v_business := old.business_id; v_type := 'ISLETME'; v_title := old.name;
  elsif tg_table_name = 'sabit_giderler' then
    v_business := old.business_id; v_type := 'SABIT_GIDER'; v_title := old.name;
  elsif tg_table_name = 'tekrar_kurallari' then
    v_business := old.business_id; v_type := 'TEKRAR'; v_title := old.baslik;
  elsif tg_table_name = 'islemler' then
    v_business := old.business_id; v_type := 'ISLEM';
    v_title := old.baslik
      || ' (' || case when old.tur = 'GELIR' then '+' else '-' end || old.tutar || ' ₺)';
  elsif tg_table_name = 'cari_hareketler' then
    select ci.business_id, ci.name into v_business, v_title
    from cari_isletmeler ci where ci.id = old.cari_isletme_id;
    if v_business is null then return old; end if;
    v_type := 'HAREKET';
    v_title := v_title || ' — ' || coalesce(nullif(old.note, ''),
      case when old.tur = 'GELIR' then 'Tahsilat' else 'Ödeme' end);
  else
    return old;
  end if;

  insert into trash (business_id, item_type, title, payload, deleted_by)
  values (v_business, v_type, v_title, to_jsonb(old), auth.uid());
  return old;
end;
$$;

drop trigger if exists trash_islem on public.islemler;
create trigger trash_islem after delete on public.islemler
for each row execute function public.trash_capture();
