-- ============================================================
-- PilotGarage — 013: Kayıt silme Onay üzerinden (owner request 2026-07-10)
--
-- Deleting a kayıt is a two-step flow: any staff member with access files a
-- silme isteği (flag on the row), which appears in the Onay queue; only
-- finance (Yönetici/Muhasebe) can approve. Approval deletes the kayıt and
-- its still-pending gelir; an ONAYLANDI/REDDEDILDI gelir stays as immutable
-- kasa history with kayit_id detached (corrections are counter-entries).
--
-- Also fixes a latent bug in islemler_immutable_guard: the FK
-- ON DELETE SET NULL actions fire the UPDATE trigger, so deleting ANY parent
-- of a decided işlem (kayıt, sabit gider, rejected-then-YOK cari hareket)
-- used to fail with the immutability error. The guard now permits exactly
-- that shape — a reference column going NULL with every other column
-- byte-identical — and nothing else.
-- ============================================================

-- ── Silme isteği flags (RPC-only, see column grants below) ──

alter table public.kayitlar
  add column silme_talebi_by uuid references public.profiles (id) on delete set null,
  add column silme_talebi_at timestamptz;

create index kayitlar_silme_talebi_idx on public.kayitlar (business_id)
  where silme_talebi_at is not null;

-- Clients keep editing the form fields; the silme flags (and scoping/audit
-- columns, which never had a legitimate client write) are RPC-only.
revoke update on public.kayitlar from anon, authenticated;
grant update (musteri_adi, plaka, marka, model, yil, km, ruhsat_no,
              paket_id, tarih, durum, notlar)
  on public.kayitlar to authenticated;

-- ── Immutability guard fix (see header) ──

create or replace function public.islemler_immutable_guard()
returns trigger
language plpgsql
as $$
declare
  detachable text[] := array['kayit_id', 'cari_hareket_id', 'sabit_gider_id', 'tekrar_kural_id'];
begin
  if old.durum = 'BEKLIYOR' then
    if tg_op = 'UPDATE' then
      return new;
    end if;
    return old;
  end if;
  -- Decided rows: the only permitted change is a parent's ON DELETE SET NULL
  -- detaching a reference. Every other column must be identical, and a
  -- reference may only keep its value or become NULL — never point elsewhere.
  -- (No client UPDATE policy exists on islemler; this path is FK/RPC-only.)
  if tg_op = 'UPDATE'
     and to_jsonb(new) - detachable = to_jsonb(old) - detachable
     and (new.kayit_id is not distinct from old.kayit_id or new.kayit_id is null)
     and (new.cari_hareket_id is not distinct from old.cari_hareket_id or new.cari_hareket_id is null)
     and (new.sabit_gider_id is not distinct from old.sabit_gider_id or new.sabit_gider_id is null)
     and (new.tekrar_kural_id is not distinct from old.tekrar_kural_id or new.tekrar_kural_id is null)
  then
    return new;
  end if;
  raise exception 'Onaylanmış veya reddedilmiş işlem değiştirilemez/silinemez — düzeltme için karşı kayıt girin.';
end;
$$;

-- ── RPCs ──

create or replace function public.request_kayit_silme(p_kayit_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  k record;
begin
  select * into k from kayitlar where id = p_kayit_id for update;
  if not found then
    raise exception 'Kayıt bulunamadı.';
  end if;
  if not can_access_business(k.business_id) then
    raise exception 'Bu kayıt için yetkiniz yok.';
  end if;
  if k.silme_talebi_at is not null then
    raise exception 'Silme isteği zaten gönderilmiş.';
  end if;

  update kayitlar
  set silme_talebi_by = auth.uid(), silme_talebi_at = now()
  where id = p_kayit_id;

  perform log_audit('REQUEST_KAYIT_SILME', 'kayitlar', p_kayit_id::text,
    jsonb_build_object('plaka', k.plaka, 'musteri', k.musteri_adi));
end;
$$;

create or replace function public.reject_kayit_silme(p_kayit_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  k record;
begin
  select * into k from kayitlar where id = p_kayit_id for update;
  if not found then
    raise exception 'Kayıt bulunamadı.';
  end if;
  if not is_finance(k.business_id) then
    raise exception 'Kayıt silmeyi reddetme yetkiniz yok.';
  end if;
  if k.silme_talebi_at is null then
    raise exception 'Bu kayıt için silme isteği yok.';
  end if;

  update kayitlar
  set silme_talebi_by = null, silme_talebi_at = null
  where id = p_kayit_id;

  perform log_audit('REJECT_KAYIT_SILME', 'kayitlar', p_kayit_id::text,
    jsonb_build_object('plaka', k.plaka, 'talep_eden', k.silme_talebi_by));
end;
$$;

-- Returns the storage paths of the kayıt's photos so the client can clean up
-- the bucket afterwards (best-effort — an orphaned object is harmless).
create or replace function public.approve_kayit_silme(p_kayit_id uuid)
returns text[]
language plpgsql security definer set search_path = public
as $$
declare
  k record;
  v_paths text[];
begin
  select * into k from kayitlar where id = p_kayit_id for update;
  if not found then
    raise exception 'Kayıt bulunamadı.';
  end if;
  if not is_finance(k.business_id) then
    raise exception 'Kayıt silmeyi onaylama yetkiniz yok.';
  end if;
  if k.silme_talebi_at is null then
    raise exception 'Bu kayıt için silme isteği yok.';
  end if;

  select coalesce(array_agg(storage_path), '{}')
  into v_paths
  from kayit_fotograflar
  where kayit_id = p_kayit_id;

  -- a queued-but-undecided gelir dies with the kayıt; decided işlemler are
  -- kasa history and survive with kayit_id detached (FK set null)
  delete from islemler where kayit_id = p_kayit_id and durum = 'BEKLIYOR';
  delete from kayitlar where id = p_kayit_id;

  perform log_audit('APPROVE_KAYIT_SILME', 'kayitlar', p_kayit_id::text,
    jsonb_build_object('plaka', k.plaka, 'musteri', k.musteri_adi,
                       'talep_eden', k.silme_talebi_by));
  return v_paths;
end;
$$;
