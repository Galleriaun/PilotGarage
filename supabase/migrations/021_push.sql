-- ============================================================
-- PilotGarage — 021: Web Push abonelikleri (owner request 2026-07-11)
-- One row per device/browser subscription. The send-push Edge Function
-- (service role, bypasses RLS) reads these when a notifications row is
-- inserted (database webhook) and web-pushes to the recipient's devices.
-- ============================================================

create table public.push_subscriptions (
  endpoint text primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subs_profile_idx on public.push_subscriptions (profile_id);

alter table public.push_subscriptions enable row level security;

create policy push_subs_select_own on public.push_subscriptions
  for select using (profile_id = auth.uid());
create policy push_subs_insert_own on public.push_subscriptions
  for insert with check (profile_id = auth.uid() and public.auth_is_active());
create policy push_subs_update_own on public.push_subscriptions
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy push_subs_delete_own on public.push_subscriptions
  for delete using (profile_id = auth.uid());
