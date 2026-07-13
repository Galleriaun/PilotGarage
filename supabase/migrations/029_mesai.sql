-- ============================================================
-- PilotGarage — 029: Mesai (Giriş/Çıkış) — konum + statik IP doğrulamalı
-- (owner request 2026-07-12)
--
-- Personel gün içi giriş/çıkış kaydeder. Doğrulama SERVER TARAFINDA yapılır
-- (sahtelenemez): the RPC reads the caller's IP from request headers, checks
-- the business's allowed static IPs first, and otherwise measures the GPS
-- distance (Haversine) against the business location. Only a passing check
-- writes a row — there is no client insert path.
-- ============================================================

create type public.mesai_tip as enum ('GIRIS', 'CIKIS');
create type public.mesai_kaynak as enum ('IP', 'KONUM');

-- ── İşletme konum/IP ayarı (İşletme Ayarları'nda finans düzenler) ──
alter table public.businesses
  add column konum_lat numeric(9,6),
  add column konum_lng numeric(9,6),
  add column konum_yaricap_m int not null default 300
    check (konum_yaricap_m between 10 and 100000),
  add column statik_ipler text[] not null default '{}';

grant update (konum_lat, konum_lng, konum_yaricap_m, statik_ipler)
  on public.businesses to authenticated;

-- ── Kayıtlar ──
create table public.mesai_kayitlari (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  tip public.mesai_tip not null,
  kaynak public.mesai_kaynak not null,
  mesafe_m int,
  lat numeric(9,6),
  lng numeric(9,6),
  ip text not null default '',
  created_at timestamptz not null default now()
);
create index mesai_profil_idx
  on public.mesai_kayitlari (profile_id, business_id, created_at desc);
create index mesai_business_idx
  on public.mesai_kayitlari (business_id, created_at desc);

alter table public.mesai_kayitlari enable row level security;

-- own rows (personel) or finance of the business; no client insert/update
create policy mesai_select on public.mesai_kayitlari
  for select using (
    (profile_id = auth.uid() and public.auth_is_active())
    or public.is_finance(business_id)
  );

-- ── Caller IP from PostgREST request headers ──
create or replace function public.mesai_caller_ip()
returns text
language sql stable security definer set search_path = public
as $$
  select trim(split_part(
    coalesce(
      nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for',
      nullif(current_setting('request.headers', true), '')::json ->> 'x-real-ip',
      ''
    ), ',', 1))
$$;

-- Does the caller's IP alone satisfy the business (office WiFi)? Lets the UI
-- skip the GPS prompt like the reference flow.
create or replace function public.mesai_ip_uygun(p_business uuid)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  v_ip text := public.mesai_caller_ip();
  v_ips text[];
begin
  if not public.can_access_business(p_business) then
    raise exception 'Bu işletme için yetkiniz yok.';
  end if;
  select statik_ipler into v_ips from businesses where id = p_business;
  return v_ip <> '' and v_ip = any(v_ips);
end;
$$;

-- The check-in/out. p_lat/p_lng optional (only needed when IP doesn't match).
create or replace function public.mesai_giris_cikis(
  p_business uuid,
  p_tip public.mesai_tip,
  p_lat numeric default null,
  p_lng numeric default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  b record;
  v_ip text := public.mesai_caller_ip();
  v_kaynak public.mesai_kaynak;
  v_mesafe int;
  v_last public.mesai_tip;
begin
  if not public.can_access_business(p_business) then
    raise exception 'Bu işletme için yetkiniz yok.';
  end if;

  -- alternation: no double giriş, no çıkış before giriş
  select tip into v_last from mesai_kayitlari
  where profile_id = auth.uid() and business_id = p_business
  order by created_at desc limit 1;
  if p_tip = 'GIRIS' and v_last = 'GIRIS' then
    raise exception 'Zaten giriş yaptınız. Önce çıkış yapın.';
  end if;
  if p_tip = 'CIKIS' and (v_last is null or v_last = 'CIKIS') then
    raise exception 'Önce giriş yapmalısınız.';
  end if;

  select * into b from businesses where id = p_business;

  if v_ip <> '' and v_ip = any(b.statik_ipler) then
    v_kaynak := 'IP';
    v_mesafe := null;
  else
    if b.konum_lat is null or b.konum_lng is null then
      raise exception 'İşletme konumu ayarlanmamış. Yöneticinize bildirin.';
    end if;
    if p_lat is null or p_lng is null then
      raise exception 'Konum alınamadı. Konum iznini verin.';
    end if;
    v_mesafe := round(
      6371000 * 2 * asin(sqrt(
        power(sin(radians(p_lat - b.konum_lat) / 2), 2) +
        cos(radians(b.konum_lat)) * cos(radians(p_lat)) *
        power(sin(radians(p_lng - b.konum_lng) / 2), 2)
      ))
    );
    if v_mesafe > b.konum_yaricap_m then
      raise exception 'Konumunuz limitin dışında (% m). İşletmeye yaklaşın.', v_mesafe;
    end if;
    v_kaynak := 'KONUM';
  end if;

  insert into mesai_kayitlari (profile_id, business_id, tip, kaynak, mesafe_m, lat, lng, ip)
  values (auth.uid(), p_business, p_tip, v_kaynak, v_mesafe,
          case when v_kaynak = 'KONUM' then p_lat end,
          case when v_kaynak = 'KONUM' then p_lng end,
          v_ip);

  perform log_audit('MESAI', 'mesai_kayitlari', p_business::text,
    jsonb_build_object('tip', p_tip, 'kaynak', v_kaynak, 'mesafe_m', v_mesafe));

  return jsonb_build_object('kaynak', v_kaynak, 'mesafe_m', v_mesafe, 'tip', p_tip);
end;
$$;
