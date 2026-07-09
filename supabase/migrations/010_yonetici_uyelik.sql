-- ============================================================
-- PilotGarage — 010: Yönetici membership rows (owner request 2026-07-09)
--
-- Previously a Yönetici had NO business_members row — access came purely
-- from is_yonetici() in RLS. The consequence: the owner never appeared in
-- the Personel roster (a list of business_members) and could not draw
-- their own maaş/avans.
--
-- This gives every Yönetici a membership in BOTH businesses. Access is
-- unchanged (is_yonetici() still grants everything); the rows exist so the
-- owner shows up in the roster and can be paid like any staff member.
--
-- Safety: maas = 0, odeme_gunu = 0. The auto-maaş cron only fires on
-- `maas > 0 AND odeme_gunu = today`, so a Yönetici is never auto-paid until
-- they explicitly set their own salary. All finance/RBAC helpers already
-- short-circuit on is_yonetici(), so nothing else changes.
-- ============================================================

-- ── Backfill: every current Yönetici into every business ──
insert into public.business_members (profile_id, business_id, maas, odeme_gunu)
select p.id, b.id, 0, 0
from public.profiles p
cross join public.businesses b
where p.role = 'YONETICI'
on conflict (profile_id, business_id) do nothing;

-- ── approve_signup: a newly-approved Yönetici gets both-business rows ──
create or replace function public.approve_signup(
  p_profile uuid,
  p_role public.role_type,
  p_business_ids uuid[],
  p_maas numeric default 0,
  p_odeme_gunu int default 0
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_status public.account_status;
  bid uuid;
begin
  if not is_yonetici() then
    raise exception 'Sadece Yönetici kayıt onaylayabilir.';
  end if;
  if p_role is null then
    raise exception 'Rol seçilmeli.';
  end if;
  select status into v_status from profiles where id = p_profile;
  if not found then
    raise exception 'Kullanıcı bulunamadı.';
  end if;
  if v_status <> 'PENDING' then
    raise exception 'Kullanıcı onay beklemiyor.';
  end if;
  if p_maas is null or p_maas < 0 or p_maas <> round(p_maas, 2) then
    raise exception 'Geçersiz maaş.';
  end if;
  if p_odeme_gunu is null or p_odeme_gunu not between 0 and 28 then
    raise exception 'Geçersiz ödeme günü (0–28).';
  end if;
  if p_role <> 'YONETICI'
     and (p_business_ids is null or array_length(p_business_ids, 1) is null) then
    raise exception 'En az bir işletme seçilmeli.';
  end if;

  update profiles set role = p_role, status = 'ACTIVE' where id = p_profile;

  if p_role <> 'YONETICI' then
    foreach bid in array p_business_ids loop
      insert into business_members (profile_id, business_id, maas, odeme_gunu)
      values (p_profile, bid, p_maas, p_odeme_gunu)
      on conflict (profile_id, business_id) do nothing;
    end loop;
  else
    -- Yönetici spans every business; born with maas 0 (no auto-pay)
    insert into business_members (profile_id, business_id, maas, odeme_gunu)
    select p_profile, b.id, 0, 0 from businesses b
    on conflict (profile_id, business_id) do nothing;
  end if;

  perform log_audit('APPROVE_SIGNUP', 'profiles', p_profile::text,
    jsonb_build_object('role', p_role, 'businesses', p_business_ids));
end;
$$;

-- ── set_role: promoting to Yönetici ensures both-business rows ──
create or replace function public.set_role(p_profile uuid, p_role public.role_type)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_yonetici() then
    raise exception 'Sadece Yönetici rol değiştirebilir.';
  end if;
  if p_profile = auth.uid() then
    raise exception 'Kendi rolünüzü değiştiremezsiniz.';
  end if;
  if p_role is null then
    raise exception 'Rol seçilmeli.';
  end if;

  update profiles set role = p_role where id = p_profile and status = 'ACTIVE';
  if not found then
    raise exception 'Aktif kullanıcı bulunamadı.';
  end if;

  -- promoting to Yönetici grants membership in every business (maas 0);
  -- a demotion keeps existing rows, which the new role legitimately needs
  if p_role = 'YONETICI' then
    insert into business_members (profile_id, business_id, maas, odeme_gunu)
    select p_profile, b.id, 0, 0 from businesses b
    on conflict (profile_id, business_id) do nothing;
  end if;

  perform log_audit('SET_ROLE', 'profiles', p_profile::text,
    jsonb_build_object('role', p_role));
end;
$$;
