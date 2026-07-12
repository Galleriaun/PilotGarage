-- ============================================================
-- PilotGarage — 028: Gözden geçirme düzeltmeleri (audit 2026-07-12)
--
-- 1) Push aboneliği sahiplik hatası: the client saved subscriptions with a
--    plain upsert. A device's push endpoint is unique — when a SECOND
--    account signs in on the same phone and enables push, ON CONFLICT
--    UPDATE hits the previous owner's row, own-rows RLS refuses it and the
--    toggle errors out. The RPC below (SECURITY DEFINER) reassigns the
--    endpoint to the current user instead — the device follows whoever is
--    signed in, and the old account stops receiving on that device.
--
-- 2) kayitlar INSERT hardening: the insert grant was table-wide, so a
--    client could create a kayıt born with silme_talebi_* set (skipping
--    request_kayit_silme and its audit trail). Inserts are now scoped to
--    the form fields, mirroring the 013 UPDATE grant.
-- ============================================================

create or replace function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or not auth_is_active() then
    raise exception 'Oturum geçersiz.';
  end if;
  if coalesce(p_endpoint, '') = '' then
    raise exception 'Geçersiz abonelik.';
  end if;

  insert into push_subscriptions (endpoint, profile_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update
    set profile_id = auth.uid(),
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        created_at = now();
end;
$$;

revoke insert on public.kayitlar from anon, authenticated;
grant insert (business_id, musteri_adi, plaka, marka, model, yil, km,
              ruhsat_no, paket_id, tarih, baslangic_saati, bitis_saati,
              durum, notlar, created_by)
  on public.kayitlar to authenticated;
