-- ============================================================
-- PilotGarage — 008: Reject-path fixes (Sprint 4 hardening audit)
--
-- Bug 1: reject_islem resets a cari hareket to kasa_durumu = 'YOK'
-- (inviting a retry), but the rejected işlem still occupies the
-- one-per-hareket unique index — so "Kasaya Yansıt" after a rejection
-- always failed with a unique violation.
--
-- Bug 2: the kayıt-tamamlandı trigger's duplicate guard counted
-- REDDEDILDI rows, so a kayıt whose queued gelir was rejected could
-- never queue a gelir again (revert -> re-complete inserted nothing,
-- silently). Money would be lost without any error.
--
-- Fix for both: rejected işlemler stay as immutable history but no
-- longer "occupy the slot" — the dedupe indexes and the trigger guard
-- ignore REDDEDILDI rows. Approved rows still block duplicates.
-- ============================================================

-- ── Indexes: one *live* (non-rejected) işlem per kayıt / cari hareket ──

drop index if exists public.islemler_kayit_ux;
create unique index islemler_kayit_ux on public.islemler (kayit_id)
  where kayit_id is not null and durum <> 'REDDEDILDI';

drop index if exists public.islemler_cari_ux;
create unique index islemler_cari_ux on public.islemler (cari_hareket_id)
  where cari_hareket_id is not null and durum <> 'REDDEDILDI';

-- (sabit gider / tekrar dedupe indexes intentionally unchanged: rejecting
-- a materialized period means "don't post that period", not "post again".)

-- ── Trigger: ignore rejected rows when deciding whether to queue gelir ──

create or replace function public.kayit_tamamlandi_islem()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_paket record;
  v_kategori uuid;
  v_was_tamamlandi boolean;
begin
  -- OLD is unassigned in INSERT triggers and SQL boolean operators do not
  -- guarantee short-circuit evaluation — branch explicitly on TG_OP.
  if tg_op = 'INSERT' then
    v_was_tamamlandi := false;
  else
    v_was_tamamlandi := (old.durum = 'TAMAMLANDI');
  end if;

  if new.durum = 'TAMAMLANDI' and not v_was_tamamlandi then
    -- a REDDEDILDI gelir no longer blocks re-queueing; a BEKLIYOR or
    -- ONAYLANDI one still does (no double income)
    if new.paket_id is not null
       and not exists (select 1 from islemler
                       where kayit_id = new.id and durum <> 'REDDEDILDI') then
      select name, price into v_paket from paketler where id = new.paket_id;
      if found and v_paket.price > 0 then
        select id into v_kategori
        from kategoriler
        where business_id = new.business_id and tur = 'GELIR'
          and label = 'Servis Ücreti' and is_active
        limit 1;
        insert into islemler
          (business_id, tur, tutar, baslik, kategori_id, kaynak, durum,
           islem_tarihi, created_by, kayit_id)
        values
          (new.business_id, 'GELIR', v_paket.price,
           new.plaka || ' — ' || v_paket.name,
           v_kategori, 'KAYIT', 'BEKLIYOR', istanbul_today(), auth.uid(), new.id);
      end if;
    end if;
  elsif v_was_tamamlandi and new.durum <> 'TAMAMLANDI' then
    -- only a still-pending işlem is removed; an approved one stays (correct manually)
    delete from islemler where kayit_id = new.id and durum = 'BEKLIYOR';
  end if;
  return new;
end;
$$;
