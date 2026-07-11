-- ============================================================
-- PilotGarage — 018: Bildirimler + Çöp Kutusu (owner request 2026-07-10)
-- • notifications: per-user rows created by DB triggers (pending işlem,
--   kayıt silme isteği, yeni üyelik). Clients read/mark-read their own only.
-- • profiles.notif_prefs: which notification types the user wants (client
--   filters display; generation stays server-side).
-- • trash: AFTER DELETE triggers snapshot deleted kayıt / cari işletme /
--   hareket / sabit gider / tekrar kuralı; capped at the newest 50 per
--   business. Finance-only read; no client write path.
-- ============================================================

-- ── notifications ──

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  business_id uuid references public.businesses (id) on delete cascade,
  type text not null,               -- ONAY | KAYIT_SILME | UYELIK
  baslik text not null,
  body text not null default '',
  link text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_profile_idx
  on public.notifications (profile_id, created_at desc);

alter table public.notifications enable row level security;

create policy notifications_select_own on public.notifications
  for select using (profile_id = auth.uid() and public.auth_is_active());

-- mark-read only (column grant); rows are created by SECURITY DEFINER triggers
create policy notifications_update_own on public.notifications
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy notifications_delete_own on public.notifications
  for delete using (profile_id = auth.uid());

revoke insert, update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

alter table public.profiles
  add column notif_prefs jsonb not null default '{}'::jsonb;
grant update (full_name, notif_prefs) on public.profiles to authenticated;

create or replace function public.notify_finance(
  p_business uuid, p_type text, p_baslik text, p_body text, p_link text, p_exclude uuid
)
returns void
language sql security definer set search_path = public
as $$
  insert into notifications (profile_id, business_id, type, baslik, body, link)
  select bm.profile_id, p_business, p_type, p_baslik, p_body, p_link
  from business_members bm
  join profiles p on p.id = bm.profile_id
  where bm.business_id = p_business
    and p.status = 'ACTIVE' and p.role in ('YONETICI', 'MUHASEBE')
    and (p_exclude is null or bm.profile_id <> p_exclude)
$$;

create or replace function public.notif_islem_bekliyor()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.durum = 'BEKLIYOR' then
    perform notify_finance(new.business_id, 'ONAY', 'Onay bekleyen işlem',
      new.baslik, '/yonetim/onay', new.created_by);
  end if;
  return new;
end;
$$;
create trigger notif_islem after insert on public.islemler
for each row execute function public.notif_islem_bekliyor();

create or replace function public.notif_kayit_silme()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.silme_talebi_at is not null and old.silme_talebi_at is null then
    perform notify_finance(new.business_id, 'KAYIT_SILME', 'Kayıt silme isteği',
      new.plaka, '/yonetim/onay', new.silme_talebi_by);
  end if;
  return new;
end;
$$;
create trigger notif_silme after update of silme_talebi_at on public.kayitlar
for each row execute function public.notif_kayit_silme();

create or replace function public.notif_yeni_uyelik()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into notifications (profile_id, type, baslik, body, link)
  select id, 'UYELIK', 'Yeni üyelik başvurusu', coalesce(new.full_name, ''),
         '/yonetim/personel'
  from profiles where role = 'YONETICI' and status = 'ACTIVE';
  return new;
end;
$$;
create trigger notif_uyelik after insert on public.profiles
for each row execute function public.notif_yeni_uyelik();

-- ── trash ──

create table public.trash (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  item_type text not null,          -- KAYIT | ISLETME | HAREKET | SABIT_GIDER | TEKRAR
  title text not null,
  payload jsonb not null default '{}'::jsonb,
  deleted_by uuid,
  deleted_at timestamptz not null default now()
);
create index trash_business_idx on public.trash (business_id, deleted_at desc);

alter table public.trash enable row level security;
create policy trash_select on public.trash
  for select using (public.is_finance(business_id));
-- no client insert/update/delete: rows come from the capture trigger,
-- pruning from the cap trigger

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
  elsif tg_table_name = 'cari_hareketler' then
    -- during an işletme cascade the parent is already gone: the işletme row
    -- itself is in the trash, skip the per-hareket spam
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

create trigger trash_kayit    after delete on public.kayitlar         for each row execute function public.trash_capture();
create trigger trash_isletme  after delete on public.cari_isletmeler  for each row execute function public.trash_capture();
create trigger trash_hareket  after delete on public.cari_hareketler  for each row execute function public.trash_capture();
create trigger trash_sabit    after delete on public.sabit_giderler   for each row execute function public.trash_capture();
create trigger trash_tekrar   after delete on public.tekrar_kurallari for each row execute function public.trash_capture();

-- cap: keep only the newest 50 per business
create or replace function public.trash_cap()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  delete from trash
  where business_id = new.business_id
    and id not in (select id from trash
                   where business_id = new.business_id
                   order by deleted_at desc limit 50);
  return null;
end;
$$;
create trigger trash_cap after insert on public.trash
for each row execute function public.trash_cap();
