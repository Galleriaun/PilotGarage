-- ============================================================
-- PilotGarage — 017: Prim (bonus) + son Yönetici koruması (owner, 2026-07-10)
-- Prim works like avans: born-ONAYLANDI kasa gideri via its own RPC, but it
-- is a bonus ON TOP of maaş — never deducted from it.
-- set_role: a Yönetici can change another Yönetici's role (already allowed),
-- but demoting the LAST active Yönetici is now refused (would lock the app).
-- ============================================================

alter type public.odeme_tur add value if not exists 'PRIM';

create or replace function public.give_prim(
  p_profile uuid, p_business uuid, p_tutar numeric, p_note text default ''
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
  v_kategori uuid;
  v_islem uuid;
begin
  if not is_finance(p_business) then
    raise exception 'Prim verme yetkiniz yok.';
  end if;
  if p_tutar is null or p_tutar <= 0 then
    raise exception 'Tutar 0''dan büyük olmalı.';
  end if;
  if p_tutar <> round(p_tutar, 2) then
    raise exception 'Tutar en fazla 2 ondalık basamak içerebilir.';
  end if;
  if not exists (select 1 from business_members
                 where profile_id = p_profile and business_id = p_business) then
    raise exception 'Personel bu işletmede kayıtlı değil.';
  end if;

  select full_name into v_name from profiles where id = p_profile;
  select id into v_kategori
  from kategoriler
  where business_id = p_business and tur = 'GIDER'
    and label = 'Personel Maaşı' and is_active
  limit 1;

  insert into islemler
    (business_id, tur, tutar, baslik, kategori_id, kaynak, durum,
     islem_tarihi, created_by, onaylayan, onaylanma_tarihi)
  values
    (p_business, 'GIDER', p_tutar, v_name || ' — Prim', v_kategori, 'PERSONEL',
     'ONAYLANDI', istanbul_today(), auth.uid(), auth.uid(), now())
  returning id into v_islem;

  insert into personel_odemeler (profile_id, business_id, tur, tutar, note, islem_id, created_by)
  values (p_profile, p_business, 'PRIM', p_tutar, coalesce(p_note, ''), v_islem, auth.uid());

  perform log_audit('PRIM', 'personel_odemeler', p_profile::text,
    jsonb_build_object('tutar', p_tutar, 'islem_id', v_islem));
  return v_islem;
end;
$$;

create or replace function public.set_role(p_profile uuid, p_role public.role_type)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_role public.role_type;
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

  select role into v_role from profiles where id = p_profile;
  if v_role = 'YONETICI' and p_role <> 'YONETICI'
     and not exists (select 1 from profiles
                     where role = 'YONETICI' and status = 'ACTIVE' and id <> p_profile) then
    raise exception 'Son aktif Yönetici''nin rolü değiştirilemez.';
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
