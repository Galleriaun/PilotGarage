-- ============================================================
-- PilotGarage — 003: Row Level Security
-- Deny-by-default: RLS is enabled on every table and any operation
-- without a policy is denied. PENDING (role = NULL) and DISABLED users
-- match nothing except their own profile row (needed for the
-- "onay bekliyor" gate). Every helper requires status = 'ACTIVE'.
-- ============================================================

alter table public.businesses enable row level security;
alter table public.profiles enable row level security;
alter table public.business_members enable row level security;
alter table public.paketler enable row level security;
alter table public.kayitlar enable row level security;
alter table public.kayit_fotograflar enable row level security;
alter table public.kategoriler enable row level security;
alter table public.cari_isletmeler enable row level security;
alter table public.cari_hareketler enable row level security;
alter table public.sabit_giderler enable row level security;
alter table public.tekrar_kurallari enable row level security;
alter table public.islemler enable row level security;
alter table public.personel_odemeler enable row level security;
alter table public.audit_log enable row level security;

-- ── profiles ─────────────────────────────────────────────────
-- Own row always readable (pending gate). Yönetici reads all;
-- Muhasebe reads colleagues in shared businesses (pending users have
-- no memberships, so they stay invisible to Muhasebe).

create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());

create policy profiles_select_staff on public.profiles
  for select using (
    public.is_yonetici()
    or (public.auth_role() = 'MUHASEBE'
        and public.auth_is_active()
        and public.shares_business_with(id))
  );

-- Own-row update limited to full_name via column grant below.
-- role/status have NO client write path — only the Yönetici RPCs.
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

revoke update on public.profiles from anon, authenticated;
grant update (full_name) on public.profiles to authenticated;

-- ── businesses ───────────────────────────────────────────────

create policy businesses_select on public.businesses
  for select using (public.can_access_business(id));

-- İşletme Ayarları: Muhasebe + Yönetici; code is immutable via column grant
create policy businesses_update on public.businesses
  for update using (public.is_finance(id)) with check (public.is_finance(id));

revoke update on public.businesses from anon, authenticated;
grant update (name, telefon, adres) on public.businesses to authenticated;

-- ── business_members ─────────────────────────────────────────
-- Reads only. ALL writes go through RPCs:
--   set_business_access / approve_signup (Yönetici), update_member_pay (finance).

create policy members_select_own on public.business_members
  for select using (profile_id = auth.uid() and public.auth_is_active());

create policy members_select_finance on public.business_members
  for select using (public.is_finance(business_id));

-- ── paketler (soft delete via is_active) ─────────────────────

create policy paketler_select on public.paketler
  for select using (public.can_access_business(business_id));

create policy paketler_insert on public.paketler
  for insert with check (public.is_finance(business_id));

create policy paketler_update on public.paketler
  for update using (public.is_finance(business_id))
  with check (public.is_finance(business_id));

-- ── kayitlar (all three active roles, business-scoped) ───────

create policy kayitlar_select on public.kayitlar
  for select using (public.can_access_business(business_id));

create policy kayitlar_insert on public.kayitlar
  for insert with check (
    public.can_access_business(business_id) and created_by = auth.uid()
  );

create policy kayitlar_update on public.kayitlar
  for update using (public.can_access_business(business_id))
  with check (public.can_access_business(business_id));

-- ── kayit_fotograflar (scoped through the parent kayıt) ──────

create policy foto_select on public.kayit_fotograflar
  for select using (
    exists (select 1 from public.kayitlar k
            where k.id = kayit_id and public.can_access_business(k.business_id))
  );

create policy foto_insert on public.kayit_fotograflar
  for insert with check (
    created_by = auth.uid()
    and exists (select 1 from public.kayitlar k
                where k.id = kayit_id and public.can_access_business(k.business_id))
  );

create policy foto_delete on public.kayit_fotograflar
  for delete using (
    exists (select 1 from public.kayitlar k
            where k.id = kayit_id and public.can_access_business(k.business_id))
  );

-- ── kategoriler (finance-only; soft delete via is_active) ────

create policy kategoriler_select on public.kategoriler
  for select using (public.is_finance(business_id));

create policy kategoriler_insert on public.kategoriler
  for insert with check (public.is_finance(business_id));

create policy kategoriler_update on public.kategoriler
  for update using (public.is_finance(business_id))
  with check (public.is_finance(business_id));

-- ── cari hesap ───────────────────────────────────────────────

create policy cari_isletme_select on public.cari_isletmeler
  for select using (public.is_finance(business_id));

create policy cari_isletme_insert on public.cari_isletmeler
  for insert with check (public.is_finance(business_id));

create policy cari_isletme_update on public.cari_isletmeler
  for update using (public.is_finance(business_id))
  with check (public.is_finance(business_id));

-- Hareket inserts must be born kasa_durumu = 'YOK'; the YOK -> BEKLIYOR ->
-- YANSIDI transitions happen only inside yansit/approve/reject RPCs.
create policy cari_hareket_select on public.cari_hareketler
  for select using (
    exists (select 1 from public.cari_isletmeler ci
            where ci.id = cari_isletme_id and public.is_finance(ci.business_id))
  );

create policy cari_hareket_insert on public.cari_hareketler
  for insert with check (
    kasa_durumu = 'YOK'
    and created_by = auth.uid()
    and exists (select 1 from public.cari_isletmeler ci
                where ci.id = cari_isletme_id and public.is_finance(ci.business_id))
  );

-- ── sabit giderler & tekrar kuralları ────────────────────────

create policy sabit_select on public.sabit_giderler
  for select using (public.is_finance(business_id));
create policy sabit_insert on public.sabit_giderler
  for insert with check (public.is_finance(business_id));
create policy sabit_update on public.sabit_giderler
  for update using (public.is_finance(business_id))
  with check (public.is_finance(business_id));
create policy sabit_delete on public.sabit_giderler
  for delete using (public.is_finance(business_id));

create policy tekrar_select on public.tekrar_kurallari
  for select using (public.is_finance(business_id));
create policy tekrar_insert on public.tekrar_kurallari
  for insert with check (public.is_finance(business_id));
create policy tekrar_update on public.tekrar_kurallari
  for update using (public.is_finance(business_id))
  with check (public.is_finance(business_id));
create policy tekrar_delete on public.tekrar_kurallari
  for delete using (public.is_finance(business_id));

-- ── islemler: the Onay gate ──────────────────────────────────
-- Clients can only INSERT manual entries born BEKLIYOR. No UPDATE policy —
-- durum transitions exist solely in approve_islem/reject_islem (plus the
-- born-approved maaş/avans RPCs). Pending rows may be deleted (typo escape
-- hatch); the immutability trigger protects everything else.

create policy islemler_select on public.islemler
  for select using (public.is_finance(business_id));

create policy islemler_insert on public.islemler
  for insert with check (
    public.is_finance(business_id)
    and durum = 'BEKLIYOR'
    and kaynak = 'MANUEL'
    and created_by = auth.uid()
  );

create policy islemler_delete on public.islemler
  for delete using (public.is_finance(business_id) and durum = 'BEKLIYOR');

-- ── personel_odemeler (reads only; writes via RPC/cron) ──────

create policy odemeler_select on public.personel_odemeler
  for select using (
    public.is_finance(business_id)
    or (profile_id = auth.uid() and public.auth_is_active())
  );

-- ── audit_log (Yönetici read; writes via SECURITY DEFINER only) ──

create policy audit_select on public.audit_log
  for select using (public.is_yonetici());

-- ── Storage: kayıt photos, path = {business_id}/{kayit_id}/{file} ──
-- NOTE: on some Supabase projects CREATE POLICY on storage.objects fails
-- with an ownership error in the SQL editor. If that happens, create these
-- three policies via Dashboard -> Storage -> kayit-fotograflar -> Policies
-- with the same USING/WITH CHECK expressions.

insert into storage.buckets (id, name, public)
values ('kayit-fotograflar', 'kayit-fotograflar', false)
on conflict (id) do nothing;

create policy kayit_foto_read on storage.objects
  for select using (
    bucket_id = 'kayit-fotograflar'
    and public.can_access_business(((storage.foldername(name))[1])::uuid)
  );

create policy kayit_foto_write on storage.objects
  for insert with check (
    bucket_id = 'kayit-fotograflar'
    and public.can_access_business(((storage.foldername(name))[1])::uuid)
  );

create policy kayit_foto_delete on storage.objects
  for delete using (
    bucket_id = 'kayit-fotograflar'
    and public.can_access_business(((storage.foldername(name))[1])::uuid)
  );
