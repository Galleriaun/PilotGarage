-- ============================================================
-- PilotGarage — RLS & invariant smoke test (Sprint 4, §15 pre-launch)
--
-- HOW TO RUN: paste the whole file into the Supabase SQL editor and run.
-- Everything happens inside one transaction that is ROLLED BACK at the
-- end — no test data survives, safe to run on the live project.
--
-- Prerequisite: migrations 001–028 applied. (Checks were written against
-- 001–013; the later migrations keep every asserted behavior — decided-row
-- immutability now has RPC-only escape hatches that this file does not
-- exercise, so all checks still pass unchanged.)
--
-- On success the messages end with:  ALL TESTS PASSED (rolled back)
-- On the first failed check it stops with:  FAIL: <what broke>
--
-- Covers (ARCHITECTURE.md §15):
--   • Pending/NULL-role user gets zero rows on every table
--   • DISABLED cuts access at the next request
--   • Business-scoped user sees zero rows from the other business
--   • Muhasebe cannot change role/status/business access (RPC-level)
--   • No client path writes an ONAYLANDI işlem; decided rows immutable
--   • KAYIT-sourced işlem cannot be approved without ödeme yöntemi
--   • Cari yansıt → reject → re-yansıt → approve round trip (bug fix 008)
--   • Rejected kayıt geliri re-queues on re-complete (bug fix 008)
--   • v_kasa_ozet matches hand-computed totals (checked as a delta,
--     so it works regardless of existing data)
--   • Kayıt silme goes through Onay (013): staff request, finance-only
--     approve, flags RPC-only; deletion removes the pending gelir but
--     decided gelirler survive detached (immutable kasa history)
--
-- NOT covered here (needs the deployed app / dashboard):
--   • Storage policies, PWA, cron firing, UI walkthrough per role.
-- ============================================================

begin;

-- ── Impersonation helpers (temp schema — vanish on rollback) ──

create function pg_temp.login(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create function pg_temp.logout() returns void
language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;

do $$
declare
  v_servis uuid;
  v_galeri uuid;

  u_pending  uuid := gen_random_uuid();
  u_personel uuid := gen_random_uuid();
  u_muhasebe uuid := gen_random_uuid();

  v_paket    uuid;
  v_kayit    uuid;
  v_kayit2   uuid; -- second kayıt for the silme-with-pending-gelir case
  v_kayit_g  uuid; -- a GALERI kayıt the SERVIS staff must not see
  v_cari     uuid;
  v_hareket  uuid;
  v_hareket2 uuid;
  v_gelir1   uuid;
  v_gelir2   uuid;
  v_islem_c1 uuid;
  v_islem_c2 uuid;
  v_gider    uuid;
  v_islem_g  uuid; -- a GALERI işlem the SERVIS Muhasebe must not see

  n bigint;
  v_durum text;
  gelir_before numeric;
  gider_before numeric;
  gelir_after numeric;
  gider_after numeric;
begin
  -- ═══ Fixtures (as table owner — bypasses RLS by design) ═══

  select id into v_servis from businesses where code = 'SERVIS';
  select id into v_galeri from businesses where code = 'GALERI';
  if v_servis is null or v_galeri is null then
    raise exception 'FAIL: seed businesses missing — run 005_seed.sql first';
  end if;

  -- three auth users; handle_new_user makes each a PENDING/NULL-role profile
  insert into auth.users
    (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
     raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', u_pending,  'authenticated', 'authenticated',
     'rls-test-pending@test.local',  '', now(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"Test Pending"}',  now(), now()),
    ('00000000-0000-0000-0000-000000000000', u_personel, 'authenticated', 'authenticated',
     'rls-test-personel@test.local', '', now(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"Test Personel"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', u_muhasebe, 'authenticated', 'authenticated',
     'rls-test-muhasebe@test.local', '', now(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"Test Muhasebe"}', now(), now());

  select count(*) into n from profiles
  where id in (u_pending, u_personel, u_muhasebe) and status = 'PENDING' and role is null;
  if n <> 3 then
    raise exception 'FAIL: handle_new_user should create 3 PENDING/NULL-role profiles, got %', n;
  end if;
  raise notice 'PASS 01: signup trigger -> PENDING profile with NULL role';

  -- personel + muhasebe become ACTIVE members of SERVIS only
  update profiles set role = 'PERSONEL', status = 'ACTIVE' where id = u_personel;
  update profiles set role = 'MUHASEBE', status = 'ACTIVE' where id = u_muhasebe;
  insert into business_members (profile_id, business_id) values
    (u_personel, v_servis), (u_muhasebe, v_servis);

  -- SERVIS: paket + kayıt (positive controls), cari işletme + hareket
  insert into paketler (business_id, name, price)
  values (v_servis, 'RLS Test Paketi', 1500.00) returning id into v_paket;

  insert into kayitlar (business_id, plaka, musteri_adi, paket_id, created_by)
  values (v_servis, '34 RLS 001', 'Test Müşteri', v_paket, u_personel)
  returning id into v_kayit;

  insert into cari_isletmeler (business_id, name)
  values (v_servis, 'RLS Test Cari') returning id into v_cari;

  insert into cari_hareketler (cari_isletme_id, tur, tutar, note, created_by)
  values (v_cari, 'GELIR', 250.50, 'Test tahsilat', u_muhasebe)
  returning id into v_hareket;

  insert into sabit_giderler (business_id, name, tutar, odeme_gunu)
  values (v_servis, 'RLS Test Kira', 900.00, 15);

  insert into tekrar_kurallari (business_id, tur, tutar, baslik, siklik, next_run)
  values (v_servis, 'GIDER', 90.00, 'RLS Test Abonelik', 'AYLIK', istanbul_today());

  -- a SERVIS işlem so Muhasebe's visibility check is not vacuous
  insert into islemler (business_id, tur, tutar, baslik, kaynak, durum, created_by)
  values (v_servis, 'GIDER', 10.00, 'Servis test pending', 'MANUEL', 'BEKLIYOR', u_muhasebe);

  -- GALERI rows that SERVIS-scoped staff must never see
  insert into kayitlar (business_id, plaka, musteri_adi)
  values (v_galeri, '34 RLS 002', 'Galeri Müşteri') returning id into v_kayit_g;

  insert into islemler (business_id, tur, tutar, baslik, kaynak, durum)
  values (v_galeri, 'GIDER', 42.00, 'Galeri test gider', 'MANUEL', 'BEKLIYOR')
  returning id into v_islem_g;

  -- ═══ 1) PENDING / NULL-role: zero rows everywhere, own profile only ═══

  perform pg_temp.login(u_pending);

  select count(*) into n from profiles;
  if n <> 1 then raise exception 'FAIL: pending user should see exactly own profile row, got %', n; end if;

  select count(*) into n from businesses;        if n <> 0 then raise exception 'FAIL: pending sees businesses (%)', n; end if;
  select count(*) into n from business_members;  if n <> 0 then raise exception 'FAIL: pending sees business_members (%)', n; end if;
  select count(*) into n from paketler;          if n <> 0 then raise exception 'FAIL: pending sees paketler (%)', n; end if;
  select count(*) into n from kayitlar;          if n <> 0 then raise exception 'FAIL: pending sees kayitlar (%)', n; end if;
  select count(*) into n from kayit_fotograflar; if n <> 0 then raise exception 'FAIL: pending sees kayit_fotograflar (%)', n; end if;
  select count(*) into n from kategoriler;       if n <> 0 then raise exception 'FAIL: pending sees kategoriler (%)', n; end if;
  select count(*) into n from cari_isletmeler;   if n <> 0 then raise exception 'FAIL: pending sees cari_isletmeler (%)', n; end if;
  select count(*) into n from cari_hareketler;   if n <> 0 then raise exception 'FAIL: pending sees cari_hareketler (%)', n; end if;
  select count(*) into n from sabit_giderler;    if n <> 0 then raise exception 'FAIL: pending sees sabit_giderler (%)', n; end if;
  select count(*) into n from tekrar_kurallari;  if n <> 0 then raise exception 'FAIL: pending sees tekrar_kurallari (%)', n; end if;
  select count(*) into n from islemler;          if n <> 0 then raise exception 'FAIL: pending sees islemler (%)', n; end if;
  select count(*) into n from personel_odemeler; if n <> 0 then raise exception 'FAIL: pending sees personel_odemeler (%)', n; end if;
  select count(*) into n from audit_log;         if n <> 0 then raise exception 'FAIL: pending sees audit_log (%)', n; end if;

  begin
    insert into kayitlar (business_id, plaka, created_by)
    values (v_servis, '34 HACK 01', u_pending);
    raise exception 'FAIL: pending user could INSERT a kayıt';
  exception
    when insufficient_privilege or check_violation then null; -- expected: RLS refuses
  end;
  raise notice 'PASS 02: PENDING/NULL-role -> zero rows on all tables, writes refused';

  -- ═══ 2) PERSONEL: own business only, no finance ═══

  perform pg_temp.login(u_personel);

  select count(*) into n from kayitlar where business_id = v_servis;
  if n < 1 then raise exception 'FAIL: personel cannot see own-business kayıt (positive control)'; end if;
  select count(*) into n from kayitlar where business_id = v_galeri;
  if n <> 0 then raise exception 'FAIL: personel sees other-business kayitlar (%)', n; end if;
  select count(*) into n from paketler where business_id = v_galeri;
  if n <> 0 then raise exception 'FAIL: personel sees other-business paketler (%)', n; end if;

  -- finance tables: zero, regardless of business
  select count(*) into n from islemler;          if n <> 0 then raise exception 'FAIL: personel sees islemler (%)', n; end if;
  select count(*) into n from kategoriler;       if n <> 0 then raise exception 'FAIL: personel sees kategoriler (%)', n; end if;
  select count(*) into n from cari_isletmeler;   if n <> 0 then raise exception 'FAIL: personel sees cari_isletmeler (%)', n; end if;
  select count(*) into n from cari_hareketler;   if n <> 0 then raise exception 'FAIL: personel sees cari_hareketler (%)', n; end if;
  select count(*) into n from sabit_giderler;    if n <> 0 then raise exception 'FAIL: personel sees sabit_giderler (%)', n; end if;
  select count(*) into n from tekrar_kurallari;  if n <> 0 then raise exception 'FAIL: personel sees tekrar_kurallari (%)', n; end if;
  select count(*) into n from audit_log;         if n <> 0 then raise exception 'FAIL: personel sees audit_log (%)', n; end if;

  begin
    perform approve_islem(v_islem_g, null);
    raise exception 'FAIL: personel could call approve_islem';
  exception
    when others then
      if sqlerrm like 'FAIL:%' then raise; end if; -- expected: yetkiniz yok / bulunamadı
  end;

  -- 009: colleague names resolve for same-business staff, but a PENDING
  -- user (no membership) stays invisible to non-Yönetici staff
  select count(*) into n from profiles where id in (u_personel, u_muhasebe);
  if n <> 2 then raise exception 'FAIL: personel should see own + same-business colleague profile, got %', n; end if;
  select count(*) into n from profiles where id = u_pending;
  if n <> 0 then raise exception 'FAIL: personel sees a PENDING (membership-less) profile'; end if;
  raise notice 'PASS 03: PERSONEL -> kayıt only, own business only, colleague names only (009), no finance/RPC access';

  -- ═══ 3) DISABLED cuts access at the next request ═══

  perform pg_temp.logout();
  update profiles set status = 'DISABLED' where id = u_personel;
  perform pg_temp.login(u_personel);

  select count(*) into n from kayitlar;
  if n <> 0 then raise exception 'FAIL: DISABLED user still sees kayitlar (%)', n; end if;
  perform pg_temp.logout();
  update profiles set status = 'ACTIVE' where id = u_personel;
  raise notice 'PASS 04: DISABLED -> zero rows immediately';

  -- ═══ 4) MUHASEBE: finance yes, role control no, other business no ═══

  perform pg_temp.login(u_muhasebe);

  select count(*) into n from islemler where business_id = v_servis;
  if n < 1 then raise exception 'FAIL: muhasebe cannot see own-business islemler (positive control)'; end if;
  select count(*) into n from islemler where business_id = v_galeri;
  if n <> 0 then raise exception 'FAIL: muhasebe sees other-business islemler (%)', n; end if;
  select count(*) into n from audit_log;
  if n <> 0 then raise exception 'FAIL: muhasebe sees audit_log — Yönetici-only (%)', n; end if;

  begin
    perform set_role(u_personel, 'MUHASEBE');
    raise exception 'FAIL: muhasebe could call set_role';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  begin
    perform set_status(u_personel, 'DISABLED');
    raise exception 'FAIL: muhasebe could call set_status';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  begin
    perform set_business_access(u_personel, array[v_galeri]);
    raise exception 'FAIL: muhasebe could call set_business_access';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  begin
    perform approve_signup(u_pending, 'PERSONEL', array[v_servis]);
    raise exception 'FAIL: muhasebe could call approve_signup';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  raise notice 'PASS 05: MUHASEBE -> all four role-control RPCs refused';

  -- direct writes to role/status columns must have no client path
  begin
    update profiles set role = 'YONETICI' where id = u_muhasebe;
    raise exception 'FAIL: muhasebe could UPDATE profiles.role';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if; -- expected: permission denied (column grant)
  end;
  raise notice 'PASS 06: profiles.role has no client write path';

  -- ═══ 5) Onay gate: no client path to ONAYLANDI ═══

  begin
    insert into islemler (business_id, tur, tutar, baslik, kaynak, durum, created_by)
    values (v_servis, 'GELIR', 9999.00, 'Hack gelir', 'MANUEL', 'ONAYLANDI', u_muhasebe);
    raise exception 'FAIL: client could INSERT a born-ONAYLANDI işlem';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if; -- expected: RLS with check
  end;

  update islemler set durum = 'ONAYLANDI' where business_id = v_servis;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: client UPDATE flipped % işlem(ler) to ONAYLANDI', n; end if;
  raise notice 'PASS 07: no client insert/update path writes ONAYLANDI';

  -- ═══ 6) Kayıt gelir: yöntem gate, reject, re-queue (008) ═══

  perform pg_temp.logout();
  update kayitlar set durum = 'TAMAMLANDI' where id = v_kayit;
  select id into v_gelir1 from islemler
  where kayit_id = v_kayit and durum = 'BEKLIYOR' and kaynak = 'KAYIT';
  if v_gelir1 is null then raise exception 'FAIL: TAMAMLANDI did not queue a pending KAYIT geliri'; end if;

  perform pg_temp.login(u_muhasebe);
  begin
    perform approve_islem(v_gelir1, null);
    raise exception 'FAIL: KAYIT işlemi approved WITHOUT ödeme yöntemi';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if; -- expected: yöntem seçilmelidir
  end;
  raise notice 'PASS 08: KAYIT işlemi cannot be approved without ödeme yöntemi';

  perform reject_islem(v_gelir1);

  -- revert + re-complete: a REDDEDILDI gelir must not block re-queueing
  perform pg_temp.logout();
  update kayitlar set durum = 'AKTIF' where id = v_kayit;
  update kayitlar set durum = 'TAMAMLANDI' where id = v_kayit;
  select id into v_gelir2 from islemler
  where kayit_id = v_kayit and durum = 'BEKLIYOR' and kaynak = 'KAYIT';
  if v_gelir2 is null then
    raise exception 'FAIL: rejected kayıt geliri blocked re-queue (008 regression)';
  end if;
  raise notice 'PASS 09: rejected kayıt geliri re-queues on re-complete (008)';

  perform pg_temp.login(u_muhasebe);
  perform approve_islem(v_gelir2, 'NAKIT');
  select odeme_yontemi::text into v_durum from islemler where id = v_gelir2;
  if v_durum <> 'NAKIT' then raise exception 'FAIL: approved yöntem not stored (%)', v_durum; end if;
  raise notice 'PASS 10: KAYIT geliri approved with yöntem -> ONAYLANDI (+1500.00)';

  -- ═══ 7) Cari: yansıt -> reject -> re-yansıt -> approve (008) ═══

  select yansit_cari_hareket(v_hareket) into v_islem_c1;
  select kasa_durumu::text into v_durum from cari_hareketler where id = v_hareket;
  if v_durum <> 'BEKLIYOR' then raise exception 'FAIL: yansıt should set hareket BEKLIYOR, got %', v_durum; end if;

  perform reject_islem(v_islem_c1);
  select kasa_durumu::text into v_durum from cari_hareketler where id = v_hareket;
  if v_durum <> 'YOK' then raise exception 'FAIL: reject should reset hareket to YOK, got %', v_durum; end if;

  begin
    select yansit_cari_hareket(v_hareket) into v_islem_c2;
  exception when unique_violation then
    raise exception 'FAIL: re-yansıt after reject hit unique violation (008 regression)';
  end;

  perform approve_islem(v_islem_c2, null); -- CARI_HESAP needs no yöntem
  select kasa_durumu::text into v_durum from cari_hareketler where id = v_hareket;
  if v_durum <> 'YANSIDI' then raise exception 'FAIL: approve should set hareket YANSIDI, got %', v_durum; end if;
  raise notice 'PASS 11: cari yansıt -> reject -> re-yansıt -> approve round trip (+250.50)';

  -- 012: only YOK hareketler are deletable
  delete from cari_hareketler where id = v_hareket; -- YANSIDI -> policy filters it out
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: a YANSIDI hareket was deleted'; end if;
  insert into cari_hareketler (cari_isletme_id, tur, tutar, note, created_by)
  values (v_cari, 'GIDER', 10.00, 'Silinecek test hareket', u_muhasebe)
  returning id into v_hareket2;
  delete from cari_hareketler where id = v_hareket2;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: a YOK hareket could not be deleted'; end if;
  raise notice 'PASS 11b: hareket silme — YOK deletable, YANSIDI immutable (012)';

  -- ═══ 8) Decided rows are immutable ═══
  -- As table owner: RLS is bypassed, so what refuses the write here is
  -- the immutability trigger itself — the deepest layer of the invariant.
  -- (The client-side path is already covered by PASS 07.)

  perform pg_temp.logout();
  begin
    update islemler set tutar = 1.00 where id = v_gelir2;
    raise exception 'FAIL: approved işlem tutarı was updated';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if; -- expected: trigger raise
  end;
  begin
    delete from islemler where id = v_gelir1; -- the rejected one
    raise exception 'FAIL: rejected işlem was deleted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  raise notice 'PASS 12: decided işlemler immutable even for the table owner';
  perform pg_temp.login(u_muhasebe);

  -- ═══ 9) v_kasa_ozet delta check ═══
  -- Deltas so far for SERVIS: +1500.00 gelir (kayıt) +250.50 gelir (cari).
  -- Now add a manual gider through the normal client path and approve it.

  select toplam_gelir, toplam_gider into gelir_before, gider_before
  from v_kasa_ozet where business_id = v_servis;

  insert into islemler (business_id, tur, tutar, baslik, kaynak, durum, created_by, odeme_yontemi)
  values (v_servis, 'GIDER', 100.00, 'RLS test gider', 'MANUEL', 'BEKLIYOR', u_muhasebe, 'NAKIT')
  returning id into v_gider;
  perform approve_islem(v_gider, null);

  select toplam_gelir, toplam_gider into gelir_after, gider_after
  from v_kasa_ozet where business_id = v_servis;

  if gider_after - gider_before <> 100.00 then
    raise exception 'FAIL: v_kasa_ozet gider delta expected 100.00, got %', gider_after - gider_before;
  end if;

  perform pg_temp.logout();
  select toplam_gelir - toplam_gider into gelir_before from (
    select coalesce(sum(tutar) filter (where tur = 'GELIR'), 0) as toplam_gelir,
           coalesce(sum(tutar) filter (where tur = 'GIDER'), 0) as toplam_gider
    from islemler where business_id = v_servis and durum = 'ONAYLANDI'
  ) hand;
  select bakiye into gelir_after from v_kasa_ozet where business_id = v_servis;
  if gelir_before <> gelir_after then
    raise exception 'FAIL: v_kasa_ozet bakiye % != hand-computed %', gelir_after, gelir_before;
  end if;
  raise notice 'PASS 13: v_kasa_ozet equals hand-computed totals (bakiye %)', gelir_after;

  -- ═══ 10) Kayıt silme Onay üzerinden (013) ═══

  perform pg_temp.login(u_personel);
  perform request_kayit_silme(v_kayit);
  begin
    perform approve_kayit_silme(v_kayit);
    raise exception 'FAIL: personel could approve kayıt silme';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if; -- expected: yetkiniz yok
  end;
  begin
    update kayitlar set silme_talebi_at = null, silme_talebi_by = null
    where id = v_kayit;
    raise exception 'FAIL: silme flag columns writable from client';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if; -- expected: column grant refuses
  end;
  perform pg_temp.logout();
  select count(*) into n from kayitlar where id = v_kayit and silme_talebi_at is not null;
  if n <> 1 then raise exception 'FAIL: request_kayit_silme did not flag the kayıt'; end if;
  raise notice 'PASS 14: silme isteği — personel requests, cannot approve; flags RPC-only (013)';

  perform pg_temp.login(u_muhasebe);
  perform reject_kayit_silme(v_kayit);
  perform pg_temp.logout();
  select count(*) into n from kayitlar where id = v_kayit and silme_talebi_at is null;
  if n <> 1 then raise exception 'FAIL: reject_kayit_silme did not clear the flag'; end if;

  -- second kayıt born TAMAMLANDI: trigger queues a pending gelir that must
  -- die together with the kayıt on approved deletion
  insert into kayitlar (business_id, plaka, musteri_adi, paket_id, durum)
  values (v_servis, '34 RLS 003', 'Silinecek Müşteri', v_paket, 'TAMAMLANDI')
  returning id into v_kayit2;
  select count(*) into n from islemler where kayit_id = v_kayit2 and durum = 'BEKLIYOR';
  if n <> 1 then raise exception 'FAIL: fixture kayıt did not queue a pending gelir'; end if;

  perform pg_temp.login(u_muhasebe);
  perform request_kayit_silme(v_kayit2);
  perform approve_kayit_silme(v_kayit2);
  perform request_kayit_silme(v_kayit); -- has ONAYLANDI + REDDEDILDI gelir
  perform approve_kayit_silme(v_kayit); -- FK detach must pass the guard fix
  perform pg_temp.logout();

  select count(*) into n from kayitlar where id in (v_kayit, v_kayit2);
  if n <> 0 then raise exception 'FAIL: approved silme left kayıt rows (%)', n; end if;
  select count(*) into n from islemler where kayit_id = v_kayit2;
  if n <> 0 then raise exception 'FAIL: pending gelir survived kayıt deletion'; end if;
  select count(*) into n from islemler where id in (v_gelir1, v_gelir2) and kayit_id is null;
  if n <> 2 then
    raise exception 'FAIL: decided gelirler should survive detached, got %', n;
  end if;
  raise notice 'PASS 15: kayıt silme — kayıt + pending gelir deleted, decided gelirler stay as kasa history (013)';

  raise notice '';
  raise notice '=== ALL TESTS PASSED (rolling back — no test data persists) ===';
end;
$$;

rollback;
