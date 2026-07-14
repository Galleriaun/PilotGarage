-- ============================================================
-- PilotGarage — 031: Bildirim görünürlüğü rol'e bağlı (owner, 2026-07-13)
-- Notifications are targeted correctly at creation (UYELIK → Yönetici,
-- ONAY/KAYIT_SILME → finance, KAYIT → all staff), but the SELECT policy
-- only checked row ownership — so rows created while an account held a
-- higher role (or broader business access) stayed visible after a
-- demotion. Visibility now re-checks the CURRENT role/access per type:
--   UYELIK            → is_yonetici()
--   ONAY, KAYIT_SILME → is_finance(business_id)
--   everything else   → can_access_business(business_id)
-- Rows themselves are kept: a restored role sees its history again.
-- (Safe to re-run: policy is dropped first.)
-- ============================================================

drop policy notifications_select_own on public.notifications;

create policy notifications_select_own on public.notifications
  for select using (
    profile_id = auth.uid()
    and public.auth_is_active()
    and case type
          when 'UYELIK'      then public.is_yonetici()
          when 'ONAY'        then public.is_finance(business_id)
          when 'KAYIT_SILME' then public.is_finance(business_id)
          else business_id is null or public.can_access_business(business_id)
        end
  );
