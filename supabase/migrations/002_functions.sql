-- ============================================================
-- PilotGarage — 002: Helpers, triggers, RPCs
-- All money/role invariants live here and in RLS (003) — never client-only.
-- ============================================================

-- ── RLS helpers (SECURITY DEFINER: read profiles/memberships without
--    recursive-policy pitfalls; every one requires status = 'ACTIVE') ──

create or replace function public.auth_role()
returns public.role_type
language sql stable security definer set search_path = public
as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function public.auth_is_active()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select status = 'ACTIVE' from profiles where id = auth.uid()), false)
$$;

create or replace function public.is_yonetici()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.auth_is_active() and public.auth_role() = 'YONETICI'
$$;

create or replace function public.is_member_of(p_business uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.auth_is_active() and exists (
    select 1 from business_members
    where profile_id = auth.uid() and business_id = p_business
  )
$$;

-- Yönetici spans both businesses; everyone else needs a membership row.
create or replace function public.can_access_business(p_business uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_yonetici() or public.is_member_of(p_business)
$$;

create or replace function public.is_finance(p_business uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_yonetici()
      or (public.auth_role() = 'MUHASEBE' and public.is_member_of(p_business))
$$;

create or replace function public.shares_business_with(p_profile uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from business_members mine
    join business_members theirs on theirs.business_id = mine.business_id
    where mine.profile_id = auth.uid() and theirs.profile_id = p_profile
  )
$$;

create or replace function public.log_audit(
  p_action text, p_table text, p_row text, p_details jsonb default '{}'::jsonb
)
returns void
language sql security definer set search_path = public
as $$
  insert into audit_log (actor, action, table_name, row_id, details)
  values (auth.uid(), p_action, p_table, coalesce(p_row, ''), coalesce(p_details, '{}'::jsonb))
$$;

-- ── Signup: every new auth user gets a PENDING, role-less profile ──

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ── updated_at ──

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger kayitlar_touch
before update on public.kayitlar
for each row execute function public.touch_updated_at();

-- ── İşlem immutability: approved/rejected rows can never change.
--    Corrections are counter-entries, like real accounting. ──

create or replace function public.islemler_immutable_guard()
returns trigger
language plpgsql
as $$
begin
  if old.durum <> 'BEKLIYOR' then
    raise exception 'Onaylanmış veya reddedilmiş işlem değiştirilemez/silinemez — düzeltme için karşı kayıt girin.';
  end if;
  if tg_op = 'UPDATE' then
    return new;
  end if;
  return old;
end;
$$;

create trigger islemler_immutable
before update or delete on public.islemler
for each row execute function public.islemler_immutable_guard();

-- ── Kayıt tamamlandı -> pending GELİR for the paket price (source: KAYIT).
--    Reverting a still-pending completion removes the queued işlem. ──

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
    if new.paket_id is not null
       and not exists (select 1 from islemler where kayit_id = new.id) then
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

create trigger kayit_tamamlandi
after insert or update of durum on public.kayitlar
for each row execute function public.kayit_tamamlandi_islem();

-- ── Onay gate RPCs: the ONLY durum transitions in the system ──

create or replace function public.approve_islem(p_islem_id uuid)
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

  update islemler
  set durum = 'ONAYLANDI', onaylayan = auth.uid(), onaylanma_tarihi = now()
  where id = p_islem_id;

  if v.cari_hareket_id is not null then
    update cari_hareketler set kasa_durumu = 'YANSIDI' where id = v.cari_hareket_id;
  end if;

  perform log_audit('APPROVE', 'islemler', p_islem_id::text,
    jsonb_build_object('tutar', v.tutar, 'tur', v.tur, 'kaynak', v.kaynak));
end;
$$;

create or replace function public.reject_islem(p_islem_id uuid)
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
    raise exception 'Bu işlemi reddetme yetkiniz yok.';
  end if;
  if v.durum <> 'BEKLIYOR' then
    raise exception 'İşlem zaten sonuçlandırılmış.';
  end if;

  update islemler
  set durum = 'REDDEDILDI', onaylayan = auth.uid(), onaylanma_tarihi = now()
  where id = p_islem_id;

  if v.cari_hareket_id is not null then
    update cari_hareketler set kasa_durumu = 'YOK' where id = v.cari_hareket_id;
  end if;

  perform log_audit('REJECT', 'islemler', p_islem_id::text,
    jsonb_build_object('tutar', v.tutar, 'tur', v.tur, 'kaynak', v.kaynak));
end;
$$;

-- ── Cari hesap: "Kasaya Yansıt" (atomic: pending işlem + hareket status) ──

create or replace function public.yansit_cari_hareket(p_hareket_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  h record;
  ci record;
  v_islem uuid;
begin
  select * into h from cari_hareketler where id = p_hareket_id for update;
  if not found then
    raise exception 'Hareket bulunamadı.';
  end if;
  select * into ci from cari_isletmeler where id = h.cari_isletme_id;
  if not is_finance(ci.business_id) then
    raise exception 'Bu hareket için yetkiniz yok.';
  end if;
  if h.kasa_durumu <> 'YOK' then
    raise exception 'Hareket zaten kasaya yansıtılmış veya onay bekliyor.';
  end if;

  insert into islemler
    (business_id, tur, tutar, baslik, kaynak, durum, islem_tarihi, created_by, cari_hareket_id)
  values
    (ci.business_id, h.tur, h.tutar,
     ci.name || ' — ' || coalesce(nullif(h.note, ''),
       case when h.tur = 'GELIR' then 'Tahsilat' else 'Ödeme' end),
     'CARI_HESAP', 'BEKLIYOR', istanbul_today(), auth.uid(), h.id)
  returning id into v_islem;

  update cari_hareketler set kasa_durumu = 'BEKLIYOR' where id = h.id;

  perform log_audit('YANSIT', 'cari_hareketler', h.id::text,
    jsonb_build_object('islem_id', v_islem, 'tutar', h.tutar));
  return v_islem;
end;
$$;

-- ── Maaş & avans: born-ONAYLANDI gider (owner decision 2026-07-07 —
--    the caller is already an approver, so no Onay stop) ──

create or replace function public.give_avans(
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
    raise exception 'Avans verme yetkiniz yok.';
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
    (p_business, 'GIDER', p_tutar, v_name || ' — Avans', v_kategori, 'PERSONEL',
     'ONAYLANDI', istanbul_today(), auth.uid(), auth.uid(), now())
  returning id into v_islem;

  insert into personel_odemeler (profile_id, business_id, tur, tutar, note, islem_id, created_by)
  values (p_profile, p_business, 'AVANS', p_tutar, coalesce(p_note, ''), v_islem, auth.uid());

  perform log_audit('AVANS', 'personel_odemeler', p_profile::text,
    jsonb_build_object('tutar', p_tutar, 'islem_id', v_islem));
  return v_islem;
end;
$$;

create or replace function public.pay_maas(p_profile uuid, p_business uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  m record;
  v_name text;
  v_kategori uuid;
  v_islem uuid;
begin
  if not is_finance(p_business) then
    raise exception 'Maaş ödeme yetkiniz yok.';
  end if;
  select * into m from business_members
  where profile_id = p_profile and business_id = p_business;
  if not found then
    raise exception 'Personel bu işletmede kayıtlı değil.';
  end if;
  if m.maas <= 0 then
    raise exception 'Bu personel için maaş tanımlı değil.';
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
    (p_business, 'GIDER', m.maas, v_name || ' — Maaş', v_kategori, 'PERSONEL',
     'ONAYLANDI', istanbul_today(), auth.uid(), auth.uid(), now())
  returning id into v_islem;

  insert into personel_odemeler (profile_id, business_id, tur, tutar, islem_id, created_by)
  values (p_profile, p_business, 'MAAS', m.maas, v_islem, auth.uid());

  perform log_audit('MAAS', 'personel_odemeler', p_profile::text,
    jsonb_build_object('tutar', m.maas, 'islem_id', v_islem));
  return v_islem;
end;
$$;

-- ── Role & access control: Yönetici-only, the ONLY write paths to
--    profiles.role/status and business_members rows ──

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
  end if;

  perform log_audit('APPROVE_SIGNUP', 'profiles', p_profile::text,
    jsonb_build_object('role', p_role, 'businesses', p_business_ids));
end;
$$;

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

  perform log_audit('SET_ROLE', 'profiles', p_profile::text,
    jsonb_build_object('role', p_role));
end;
$$;

create or replace function public.set_status(p_profile uuid, p_status public.account_status)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_status public.account_status;
begin
  if not is_yonetici() then
    raise exception 'Sadece Yönetici durum değiştirebilir.';
  end if;
  if p_profile = auth.uid() then
    raise exception 'Kendi durumunuzu değiştiremezsiniz.';
  end if;
  if p_status not in ('ACTIVE', 'DISABLED') then
    raise exception 'Geçersiz durum.';
  end if;
  select status into v_status from profiles where id = p_profile;
  if not found then
    raise exception 'Kullanıcı bulunamadı.';
  end if;
  if v_status = 'PENDING' then
    raise exception 'Onay bekleyen kullanıcı için kayıt onayı kullanın.';
  end if;

  update profiles set status = p_status where id = p_profile;

  perform log_audit('SET_STATUS', 'profiles', p_profile::text,
    jsonb_build_object('status', p_status));
end;
$$;

create or replace function public.set_business_access(p_profile uuid, p_business_ids uuid[])
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_yonetici() then
    raise exception 'Sadece Yönetici işletme erişimi değiştirebilir.';
  end if;
  if p_business_ids is null or array_length(p_business_ids, 1) is null then
    raise exception 'En az bir işletme seçilmeli.';
  end if;
  if not exists (select 1 from profiles where id = p_profile) then
    raise exception 'Kullanıcı bulunamadı.';
  end if;

  -- kept memberships preserve their maaş/ödeme günü; removed ones go away
  delete from business_members
  where profile_id = p_profile and business_id <> all (p_business_ids);

  insert into business_members (profile_id, business_id)
  select p_profile, bid from unnest(p_business_ids) as bid
  on conflict (profile_id, business_id) do nothing;

  perform log_audit('SET_BUSINESS_ACCESS', 'profiles', p_profile::text,
    jsonb_build_object('businesses', p_business_ids));
end;
$$;

create or replace function public.update_member_pay(
  p_profile uuid, p_business uuid, p_maas numeric, p_odeme_gunu int
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_finance(p_business) then
    raise exception 'Maaş bilgisi güncelleme yetkiniz yok.';
  end if;
  if p_maas is null or p_maas < 0 or p_maas <> round(p_maas, 2) then
    raise exception 'Geçersiz maaş.';
  end if;
  if p_odeme_gunu is null or p_odeme_gunu not between 0 and 28 then
    raise exception 'Geçersiz ödeme günü (0–28).';
  end if;

  update business_members
  set maas = p_maas, odeme_gunu = p_odeme_gunu
  where profile_id = p_profile and business_id = p_business;
  if not found then
    raise exception 'Üyelik bulunamadı.';
  end if;

  perform log_audit('UPDATE_PAY', 'business_members', p_profile::text,
    jsonb_build_object('business_id', p_business, 'maas', p_maas, 'odeme_gunu', p_odeme_gunu));
end;
$$;

-- ── Daily materializer (pg_cron, 21:05 UTC = 00:05 Istanbul) ──
-- Sabit giderler & tekrar kuralları -> pending işlem (Onay queue).
-- Otomatik maaş -> born-ONAYLANDI işlem, once per member per month.

create or replace function public.run_daily_materializer()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  d date := istanbul_today();
  gun int := extract(day from istanbul_today())::int;
  r record;
  v_islem uuid;
  v_kategori uuid;
  safety int;
begin
  -- 1) Sabit giderler due today -> pending GİDER (unique index dedupes reruns)
  insert into islemler
    (business_id, tur, tutar, baslik, kaynak, durum, islem_tarihi, sabit_gider_id)
  select sg.business_id, 'GIDER', sg.tutar, sg.name, 'SABIT_GIDER', 'BEKLIYOR', d, sg.id
  from sabit_giderler sg
  where sg.odeme_gunu = gun
  on conflict (sabit_gider_id, islem_tarihi) where sabit_gider_id is not null do nothing;

  -- 2) Otomatik maaş: members with odeme_gunu = today, once per month
  for r in
    select bm.profile_id, bm.business_id, bm.maas, p.full_name
    from business_members bm
    join profiles p on p.id = bm.profile_id
    where bm.odeme_gunu = gun and bm.maas > 0 and p.status = 'ACTIVE'
  loop
    if not exists (
      select 1 from personel_odemeler po
      where po.profile_id = r.profile_id
        and po.business_id = r.business_id
        and po.tur = 'MAAS'
        and date_trunc('month', po.tarih) = date_trunc('month', d)
    ) then
      select id into v_kategori
      from kategoriler
      where business_id = r.business_id and tur = 'GIDER'
        and label = 'Personel Maaşı' and is_active
      limit 1;

      insert into islemler
        (business_id, tur, tutar, baslik, kategori_id, kaynak, durum,
         islem_tarihi, onaylanma_tarihi)
      values
        (r.business_id, 'GIDER', r.maas, r.full_name || ' — Maaş', v_kategori,
         'PERSONEL', 'ONAYLANDI', d, now())
      returning id into v_islem;

      insert into personel_odemeler (profile_id, business_id, tur, tutar, note, islem_id)
      values (r.profile_id, r.business_id, 'MAAS', r.maas, 'Otomatik ödeme', v_islem);
    end if;
  end loop;

  -- 3) Tekrar kuralları due -> pending işlem per period, advance next_run
  for r in select * from tekrar_kurallari where is_active and next_run <= d loop
    safety := 0;
    while r.next_run <= d and safety < 24 loop
      insert into islemler
        (business_id, tur, tutar, baslik, kategori_id, kaynak, durum,
         islem_tarihi, tekrar_kural_id)
      values
        (r.business_id, r.tur, r.tutar, r.baslik, r.kategori_id,
         'MANUEL', 'BEKLIYOR', r.next_run, r.id)
      on conflict (tekrar_kural_id, islem_tarihi) where tekrar_kural_id is not null do nothing;

      r.next_run := case r.siklik
        when 'HAFTALIK' then (r.next_run + interval '7 days')::date
        when 'AYLIK'    then (r.next_run + interval '1 month')::date
        when 'YILLIK'   then (r.next_run + interval '1 year')::date
      end;
      safety := safety + 1;
    end loop;
    update tekrar_kurallari set next_run = r.next_run where id = r.id;
  end loop;

  perform log_audit('DAILY_CRON', 'system', d::text, '{}'::jsonb);
end;
$$;
