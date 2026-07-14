-- ============================================================
-- PilotGarage — 037: İstekler (owner request 2026-07-14)
--
-- Personel istekleri: AVANS (tutar + opsiyonel not), SIKAYET / ONERI
-- (serbest metin). Personel kendi isteğini oluşturur ve durumunu görür;
-- Yönetici/Muhasebe Personel ekranındaki "İstekler" panelinden karara
-- bağlar:
--   • AVANS  → approve_avans_istek: mevcut give_avans RPC'sini AYNEN
--     çağırır (born-ONAYLANDI kasa gideri + personel_odemeler satırı —
--     Avans Ver'den hiçbir farkı yok) ve isteği ONAYLANDI yapar;
--     reject_avans_istek → REDDEDILDI (kasa untouched).
--   • SIKAYET/ONERI → alindi_istek: ALINDI (görüldü işareti).
-- Kararlar yalnızca RPC'lerle (client UPDATE/DELETE yok); kırmızı nokta
-- istemcide "durum = BEKLIYOR satır var mı" sorgusudur.
-- ============================================================

create type public.istek_tur as enum ('AVANS', 'SIKAYET', 'ONERI');
create type public.istek_durum as enum ('BEKLIYOR', 'ONAYLANDI', 'REDDEDILDI', 'ALINDI');

create table public.istekler (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  tur public.istek_tur not null,
  tutar numeric(12,2),                 -- AVANS only
  metin text not null default '',      -- şikayet/öneri metni; avansta opsiyonel not
  durum public.istek_durum not null default 'BEKLIYOR',
  islem_id uuid references public.islemler (id) on delete set null, -- onaylanan avansın gideri
  karar_veren uuid references public.profiles (id) on delete set null,
  karar_tarihi timestamptz,
  created_at timestamptz not null default now(),
  check (case when tur = 'AVANS'
              then tutar is not null and tutar > 0
              else tutar is null and length(trim(metin)) > 0 end)
);
create index istekler_business_idx on public.istekler (business_id, created_at desc);

alter table public.istekler enable row level security;

-- Personel kendi isteklerini görür (durum takibi); finans hepsini görür.
create policy istekler_select on public.istekler
  for select using (
    (profile_id = auth.uid() and public.auth_is_active())
    or public.is_finance(business_id)
  );

-- Yalnızca kendi adına, üyesi olduğu işletmede, BEKLIYOR doğar.
create policy istekler_insert on public.istekler
  for insert with check (
    profile_id = auth.uid()
    and public.auth_is_active()
    and public.is_member_of(business_id)
    and durum = 'BEKLIYOR'
    and islem_id is null
    and karar_veren is null
    and karar_tarihi is null
  );

-- Kararlar yalnızca RPC'lerle: client güncelleme/silme yolu yok.
revoke update, delete on public.istekler from anon, authenticated;

-- ── Karar RPC'leri ──

create function public.approve_avans_istek(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  r record;
  v_islem uuid;
begin
  select * into r from istekler where id = p_id for update;
  if not found then
    raise exception 'İstek bulunamadı.';
  end if;
  if not is_finance(r.business_id) then
    raise exception 'Bu isteği onaylama yetkiniz yok.';
  end if;
  if r.tur <> 'AVANS' then
    raise exception 'Bu bir avans isteği değil.';
  end if;
  if r.durum <> 'BEKLIYOR' then
    raise exception 'İstek zaten sonuçlandırılmış.';
  end if;

  -- Avans Ver ile birebir aynı yol (kendi yetki/tutar kontrolleri dahil)
  v_islem := give_avans(r.profile_id, r.business_id, r.tutar,
                        coalesce(nullif(trim(r.metin), ''), 'Avans isteği'));

  update istekler
  set durum = 'ONAYLANDI', islem_id = v_islem,
      karar_veren = auth.uid(), karar_tarihi = now()
  where id = p_id;

  perform log_audit('ISTEK_ONAY', 'istekler', p_id::text,
    jsonb_build_object('tutar', r.tutar, 'islem_id', v_islem));
  return v_islem;
end;
$$;

create function public.reject_avans_istek(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  r record;
begin
  select * into r from istekler where id = p_id for update;
  if not found then
    raise exception 'İstek bulunamadı.';
  end if;
  if not is_finance(r.business_id) then
    raise exception 'Bu isteği reddetme yetkiniz yok.';
  end if;
  if r.tur <> 'AVANS' or r.durum <> 'BEKLIYOR' then
    raise exception 'İstek reddedilemez.';
  end if;

  update istekler
  set durum = 'REDDEDILDI', karar_veren = auth.uid(), karar_tarihi = now()
  where id = p_id;

  perform log_audit('ISTEK_RED', 'istekler', p_id::text,
    jsonb_build_object('tutar', r.tutar));
end;
$$;

create function public.alindi_istek(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  r record;
begin
  select * into r from istekler where id = p_id for update;
  if not found then
    raise exception 'İstek bulunamadı.';
  end if;
  if not is_finance(r.business_id) then
    raise exception 'Bu istek için yetkiniz yok.';
  end if;
  if r.tur = 'AVANS' or r.durum <> 'BEKLIYOR' then
    raise exception 'İstek alındı olarak işaretlenemez.';
  end if;

  update istekler
  set durum = 'ALINDI', karar_veren = auth.uid(), karar_tarihi = now()
  where id = p_id;

  perform log_audit('ISTEK_ALINDI', 'istekler', p_id::text, '{}'::jsonb);
end;
$$;
