-- ============================================================
-- PilotGarage — 009: Colleague name visibility (owner decision 2026-07-09)
--
-- Kayıt cards and işlemler now display who created them. Yönetici and
-- Muhasebe could already read colleague profiles; PERSONEL could only
-- read their own row, so creator names would not resolve for them.
--
-- Change: every ACTIVE staff member with an assigned role can read the
-- profile rows (name/role/status) of people sharing a business with them.
-- Salaries are NOT exposed — they live in business_members, which stays
-- finance-only. PENDING users have no memberships, so they both see
-- nothing extra and stay invisible to non-Yönetici staff.
-- ============================================================

drop policy profiles_select_staff on public.profiles;

create policy profiles_select_staff on public.profiles
  for select using (
    public.is_yonetici()
    or (public.auth_is_active()
        and public.auth_role() is not null
        and public.shares_business_with(id))
  );
