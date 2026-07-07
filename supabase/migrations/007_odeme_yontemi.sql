-- ============================================================
-- PilotGarage — 007: Ödeme yöntemi (Nakit / Kredi Kartı)
-- Owner decision 2026-07-07: transactions carry a payment method.
-- It is NOT asked on the kayıt screens — for KAYIT-sourced işlemler
-- the approver chooses it in the Onay section, and the RPC refuses
-- to approve a KAYIT işlem without one (DB-enforced, not UI-only).
-- ============================================================

create type public.odeme_yontemi as enum ('NAKIT', 'KREDI_KARTI');

alter table public.islemler
  add column odeme_yontemi public.odeme_yontemi; -- NULL = not specified

-- approve_islem gains an optional payment-method parameter. The old
-- 1-arg signature must be dropped first — otherwise Postgres keeps it
-- as an overload and RPC calls become ambiguous.
drop function if exists public.approve_islem(uuid);

create function public.approve_islem(
  p_islem_id uuid,
  p_odeme_yontemi public.odeme_yontemi default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v record;
begin
  select * into v from islemler where id = p_islem_id for update;
  if not found then
    raise exception 'İşlem bulunamadı.';
  end if;
  if not is_finance(v.business_id) then
    raise exception 'Bu işlemi onaylama yetkiniz yok.';
  end if;
  if v.durum <> 'BEKLIYOR' then
    raise exception 'İşlem zaten sonuçlandırılmış.';
  end if;
  if v.kaynak = 'KAYIT' and p_odeme_yontemi is null and v.odeme_yontemi is null then
    raise exception 'Kayıt işlemi onaylanırken ödeme yöntemi (Nakit / Kredi Kartı) seçilmelidir.';
  end if;

  update islemler
  set durum = 'ONAYLANDI',
      onaylayan = auth.uid(),
      onaylanma_tarihi = now(),
      odeme_yontemi = coalesce(p_odeme_yontemi, odeme_yontemi)
  where id = p_islem_id;

  if v.cari_hareket_id is not null then
    update cari_hareketler set kasa_durumu = 'YANSIDI' where id = v.cari_hareket_id;
  end if;

  perform log_audit('APPROVE', 'islemler', p_islem_id::text,
    jsonb_build_object(
      'tutar', v.tutar,
      'tur', v.tur,
      'kaynak', v.kaynak,
      'odeme_yontemi', coalesce(p_odeme_yontemi, v.odeme_yontemi)
    ));
end;
$$;
