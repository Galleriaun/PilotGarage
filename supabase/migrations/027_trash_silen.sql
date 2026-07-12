-- ============================================================
-- PilotGarage — 027: Çöp kutusunda silen kişi (owner, 2026-07-12)
-- trash.deleted_by gets a real FK so the client can embed the profile name.
-- ============================================================

alter table public.trash
  add constraint trash_deleted_by_fkey
  foreign key (deleted_by) references public.profiles (id) on delete set null;
