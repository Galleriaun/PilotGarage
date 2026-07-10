-- ============================================================
-- PilotGarage — 015: Cari işletme silme (owner request 2026-07-10)
-- Finance can delete a cari işletme. Its still-pending kasa entries die
-- with it (kasa untouched); decided işlemler stay as immutable history,
-- detached by the FK cascade (cari_hareket_id -> NULL, legal since 013).
-- The client shows those as "Silinen işletme: …" (kaynak = CARI_HESAP
-- with a NULL hareket reference only happens on işletme deletion).
-- ============================================================

create or replace function public.delete_cari_isletme(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  ci record;
begin
  select * into ci from cari_isletmeler where id = p_id for update;
  if not found then
    raise exception 'İşletme bulunamadı.';
  end if;
  if not is_finance(ci.business_id) then
    raise exception 'Bu işletmeyi silme yetkiniz yok.';
  end if;

  delete from islemler
  where durum = 'BEKLIYOR'
    and cari_hareket_id in
      (select id from cari_hareketler where cari_isletme_id = p_id);

  -- cascades: cari_hareketler + cari-targeted tekrar_kurallari (011)
  delete from cari_isletmeler where id = p_id;

  perform log_audit('DELETE_CARI', 'cari_isletmeler', p_id::text,
    jsonb_build_object('name', ci.name));
end;
$$;
