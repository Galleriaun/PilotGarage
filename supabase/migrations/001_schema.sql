-- ============================================================
-- PilotGarage — 001: Schema
-- Run in Supabase SQL editor. Prerequisite: pg_cron enabled in
-- Database -> Extensions (pgcrypto ships enabled on Supabase).
-- ============================================================

create extension if not exists pgcrypto;

-- Turkey is UTC+3 year-round (no DST since 2016).
create or replace function public.istanbul_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'Europe/Istanbul')::date
$$;

-- ── Enums ────────────────────────────────────────────────────

create type public.role_type as enum ('YONETICI', 'MUHASEBE', 'PERSONEL');
create type public.account_status as enum ('PENDING', 'ACTIVE', 'DISABLED');
create type public.business_code as enum ('SERVIS', 'GALERI');
create type public.islem_tur as enum ('GELIR', 'GIDER');
create type public.islem_kaynak as enum ('MANUEL', 'KAYIT', 'CARI_HESAP', 'SABIT_GIDER', 'PERSONEL');
create type public.islem_durum as enum ('BEKLIYOR', 'ONAYLANDI', 'REDDEDILDI');
create type public.kayit_durum as enum ('AKTIF', 'BEKLENEN', 'TAMAMLANDI');
create type public.kasa_durum as enum ('YOK', 'BEKLIYOR', 'YANSIDI');
create type public.odeme_tur as enum ('MAAS', 'AVANS');
create type public.tekrar_siklik as enum ('HAFTALIK', 'AYLIK', 'YILLIK');

-- ── Tables ───────────────────────────────────────────────────

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  code public.business_code not null unique,
  name text not null check (length(trim(name)) > 0),
  telefon text not null default '',
  adres text not null default ''
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role public.role_type,             -- NULL until Yönetici approves the signup
  status public.account_status not null default 'PENDING',
  created_at timestamptz not null default now()
);

create table public.business_members (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  maas numeric(12,2) not null default 0 check (maas >= 0),
  odeme_gunu int not null default 0 check (odeme_gunu between 0 and 28), -- 0 = elle ödeme
  primary key (profile_id, business_id)
);

create table public.paketler (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  price numeric(12,2) not null check (price >= 0),
  is_active boolean not null default true,   -- soft delete: history references packages
  created_at timestamptz not null default now()
);
create index paketler_business_idx on public.paketler (business_id) where is_active;

create table public.kayitlar (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  musteri_adi text not null default '',
  plaka text not null check (length(trim(plaka)) > 0),
  marka text not null default '',
  model text not null default '',
  yil int check (yil between 1900 and 2100),
  km int check (km >= 0),
  ruhsat_no text not null default '',
  paket_id uuid references public.paketler (id),
  tarih date not null default public.istanbul_today(),
  durum public.kayit_durum not null default 'AKTIF',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index kayitlar_business_durum_idx on public.kayitlar (business_id, durum);

create table public.kayit_fotograflar (
  id uuid primary key default gen_random_uuid(),
  kayit_id uuid not null references public.kayitlar (id) on delete cascade,
  storage_path text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index kayit_fotograflar_kayit_idx on public.kayit_fotograflar (kayit_id);

create table public.kategoriler (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  tur public.islem_tur not null,
  label text not null check (length(trim(label)) > 0),
  is_active boolean not null default true    -- soft delete: işlemler reference categories
);
create index kategoriler_business_idx on public.kategoriler (business_id, tur);

create table public.cari_isletmeler (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  note text not null default '',
  created_at timestamptz not null default now()
);

create table public.cari_hareketler (
  id uuid primary key default gen_random_uuid(),
  cari_isletme_id uuid not null references public.cari_isletmeler (id) on delete cascade,
  tur public.islem_tur not null,
  tutar numeric(12,2) not null check (tutar > 0),
  note text not null default '',
  tarih date not null default public.istanbul_today(),
  kasa_durumu public.kasa_durum not null default 'YOK', -- YOK -> BEKLIYOR -> YANSIDI, only via RPCs
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index cari_hareketler_isletme_idx on public.cari_hareketler (cari_isletme_id);

create table public.sabit_giderler (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  tutar numeric(12,2) not null check (tutar > 0),
  odeme_gunu int not null check (odeme_gunu between 1 and 28)
);

create table public.tekrar_kurallari (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  tur public.islem_tur not null,
  tutar numeric(12,2) not null check (tutar > 0),
  baslik text not null check (length(trim(baslik)) > 0),
  kategori_id uuid references public.kategoriler (id),
  siklik public.tekrar_siklik not null,
  next_run date not null,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null
);

create table public.islemler (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  tur public.islem_tur not null,
  tutar numeric(12,2) not null check (tutar > 0), -- sign derives from tur, never stored negative
  baslik text not null check (length(trim(baslik)) > 0),
  kategori_id uuid references public.kategoriler (id),
  kaynak public.islem_kaynak not null,
  durum public.islem_durum not null default 'BEKLIYOR',
  islem_tarihi date not null default public.istanbul_today(),
  created_by uuid references public.profiles (id) on delete set null, -- NULL = system (cron)
  onaylayan uuid references public.profiles (id) on delete set null,  -- NULL = system-approved
  onaylanma_tarihi timestamptz,
  kayit_id uuid references public.kayitlar (id) on delete set null,
  cari_hareket_id uuid references public.cari_hareketler (id) on delete set null,
  sabit_gider_id uuid references public.sabit_giderler (id) on delete set null,
  tekrar_kural_id uuid references public.tekrar_kurallari (id) on delete set null,
  created_at timestamptz not null default now(),
  check (durum <> 'ONAYLANDI' or onaylanma_tarihi is not null)
);
create index islemler_business_durum_idx on public.islemler (business_id, durum, islem_tarihi);
-- one işlem per kayıt / cari hareket; cron dedupe for sabit gider & tekrar
create unique index islemler_kayit_ux on public.islemler (kayit_id) where kayit_id is not null;
create unique index islemler_cari_ux on public.islemler (cari_hareket_id) where cari_hareket_id is not null;
create unique index islemler_sabit_ux on public.islemler (sabit_gider_id, islem_tarihi) where sabit_gider_id is not null;
create unique index islemler_tekrar_ux on public.islemler (tekrar_kural_id, islem_tarihi) where tekrar_kural_id is not null;

create table public.personel_odemeler (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  tur public.odeme_tur not null,
  tutar numeric(12,2) not null check (tutar > 0),
  note text not null default '',
  tarih date not null default public.istanbul_today(),
  islem_id uuid references public.islemler (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null, -- NULL = system (cron)
  created_at timestamptz not null default now()
);
create index personel_odemeler_member_idx on public.personel_odemeler (profile_id, business_id, tarih);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor uuid,               -- NULL = system (cron)
  action text not null,
  table_name text not null,
  row_id text not null default '',
  details jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);

-- ── Kasa balance: ALWAYS derived from approved işlemler, never stored ──
-- security_invoker so the querying user's RLS applies to the underlying tables.
create view public.v_kasa_ozet with (security_invoker = true) as
select
  b.id as business_id,
  coalesce(sum(i.tutar) filter (where i.tur = 'GELIR'), 0)::numeric(14,2) as toplam_gelir,
  coalesce(sum(i.tutar) filter (where i.tur = 'GIDER'), 0)::numeric(14,2) as toplam_gider,
  (coalesce(sum(i.tutar) filter (where i.tur = 'GELIR'), 0)
   - coalesce(sum(i.tutar) filter (where i.tur = 'GIDER'), 0))::numeric(14,2) as bakiye
from public.businesses b
left join public.islemler i on i.business_id = b.id and i.durum = 'ONAYLANDI'
group by b.id;
