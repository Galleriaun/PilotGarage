-- ============================================================
-- PilotGarage — RLS & invariant smoke test (Sprint 4, §15 pre-launch)
--
-- HOW TO RUN: paste the whole file into the Supabase SQL editor and run.
-- Everything happens inside one transaction that is ROLLED BACK at the
-- end — no test data survives, safe to run on the live project.
--
-- Prerequisite: migrations 001–051 applied. (Checks were written against
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
--   • Bildirim visibility re-checks the current role per type (031)
--   • Onaya Geri Gönder: Yönetici-only, komisyon çocuğu çöpe düşmeden
--     silinip yeniden onayda tekrar doğar, cari hareket BEKLIYOR'a döner (040)
--   • Para transferi: iki bacak birlikte doğar/silinir, ciro ve bakiye
--     değişmez, çöpe düşmez, onaya geri gönderilemez (041)
--   • Transferi geri al: ters aktarım yazılır, kova eski hâline döner,
--     ikinci kez geri alınamaz, geri alınmış aktarım silinemez (042)
--   • Transfer nakit bakiyesini aşamaz; tam bakiye serbest, boş kovadan
--     1 kuruş bile çıkmaz (043)
--   • Onay/red + kayıt silme kararı yalnızca Yönetici; Muhasebe RPC'den de
--     geçemez ve ONAY bildirimi almaz (044)
--   • Avans/prim BEKLIYOR doğar (kasa kıpırdamaz), red personel defterinden
--     de siler, maaş hâlâ born-ONAYLANDI (045)
--   • İstekleri Muhasebe ne görür ne karara bağlar; yalnızca Yönetici (046)
--   • Onaya geri gönder cron born-ONAYLANDI (sabit gider / tekrar) satırları
--     reddeder; normal onaylanmış MANUEL geçer (049)
--   • Prim paketleri: yazma yalnızca Yönetici, okuma finans, Personel görmez;
--     give_prim başlığı açıklamadan/paket adından türer (050)
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
  u_yonetici uuid := gen_random_uuid(); -- 040 Onaya Geri Gönder testleri

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
  v_izin uuid;   -- 048 İzinler
  v_izin2 uuid;
  v_durum text;
  gelir_before numeric;
  gider_before numeric;
  gelir_after numeric;
  gider_after numeric;
  nakit_before numeric; -- 042: kova neti geri almadan sonra eski hâline dönmeli
  nakit_after numeric;
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
     '{"provider":"email","providers":["email"]}', '{"full_name":"Test Muhasebe"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', u_yonetici, 'authenticated', 'authenticated',
     'rls-test-yonetici@test.local', '', now(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"Test Yönetici"}', now(), now());

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
  -- yönetici: rol yeterli (erişim is_yonetici()'den; üyelik satırı gerekmez)
  update profiles set role = 'YONETICI', status = 'ACTIVE' where id = u_yonetici;

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

  -- 044: onay/red yalnızca Yönetici. Bu blok yöntem kuralını sınar, yetkiyi
  -- değil — Muhasebe ile çalıştırılırsa yanlış sebepten patlar ve test sahte
  -- geçer, o yüzden Yönetici olarak koşar. Yetki reddi PASS 27'de.
  perform pg_temp.login(u_yonetici);
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

  perform pg_temp.login(u_yonetici); -- 044: onay yalnızca Yönetici
  perform approve_islem(v_gelir2, 'NAKIT');
  perform pg_temp.login(u_muhasebe); -- geri kalan finans işleri Muhasebe ile
  select odeme_yontemi::text into v_durum from islemler where id = v_gelir2;
  if v_durum <> 'NAKIT' then raise exception 'FAIL: approved yöntem not stored (%)', v_durum; end if;
  raise notice 'PASS 10: KAYIT geliri approved with yöntem -> ONAYLANDI (+1500.00)';

  -- ═══ 7) Cari: yansıt -> reject -> re-yansıt -> approve (008) ═══

  select yansit_cari_hareket(v_hareket) into v_islem_c1;
  select kasa_durumu::text into v_durum from cari_hareketler where id = v_hareket;
  if v_durum <> 'BEKLIYOR' then raise exception 'FAIL: yansıt should set hareket BEKLIYOR, got %', v_durum; end if;

  perform pg_temp.login(u_yonetici); -- 044
  perform reject_islem(v_islem_c1);
  perform pg_temp.login(u_muhasebe);
  select kasa_durumu::text into v_durum from cari_hareketler where id = v_hareket;
  if v_durum <> 'YOK' then raise exception 'FAIL: reject should reset hareket to YOK, got %', v_durum; end if;

  begin
    select yansit_cari_hareket(v_hareket) into v_islem_c2;
  exception when unique_violation then
    raise exception 'FAIL: re-yansıt after reject hit unique violation (008 regression)';
  end;

  perform pg_temp.login(u_yonetici); -- 044
  perform approve_islem(v_islem_c2, null); -- CARI_HESAP needs no yöntem
  perform pg_temp.login(u_muhasebe);
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
  perform pg_temp.login(u_yonetici); -- 044
  perform approve_islem(v_gider, null);
  perform pg_temp.login(u_muhasebe);

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

  perform pg_temp.login(u_yonetici); -- 044: silme kararı da yalnızca Yönetici
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
  perform request_kayit_silme(v_kayit2); -- istek her personelde (Muhasebe dâhil)
  perform request_kayit_silme(v_kayit); -- has ONAYLANDI + REDDEDILDI gelir
  perform pg_temp.login(u_yonetici); -- 044: kararı Yönetici verir
  perform approve_kayit_silme(v_kayit2);
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

  -- ═══ 11) Bildirim görünürlüğü güncel rolü izler (031) ═══
  -- Rows are targeted at creation, but visibility must re-check the CURRENT
  -- role: a demoted account must not keep seeing finance/Yönetici bildirimler.

  insert into notifications (profile_id, business_id, type, baslik)
  values
    (u_personel, null,     'UYELIK',      'RLS16'), -- Yönetici-only
    (u_personel, v_servis, 'ONAY',        'RLS16'), -- Yönetici-only (044)
    (u_personel, v_servis, 'KAYIT_SILME', 'RLS16'), -- Yönetici-only (044)
    (u_personel, v_servis, 'KAYIT',       'RLS16'), -- own business -> visible
    (u_personel, v_galeri, 'KAYIT',       'RLS16'), -- no membership -> hidden
    (u_muhasebe, v_servis, 'ONAY',        'RLS16'), -- 044: artık Yönetici-only -> Muhasebe'ye gizli
    (u_muhasebe, v_servis, 'KAYIT',       'RLS16'), -- kendi işletmesi -> görünür
    (u_muhasebe, null,     'UYELIK',      'RLS16'); -- not Yönetici -> hidden

  perform pg_temp.login(u_personel);
  select count(*) into n from notifications where baslik = 'RLS16';
  if n <> 1 then
    raise exception 'FAIL: personel should see only the own-business KAYIT bildirim, got %', n;
  end if;
  perform pg_temp.logout();

  perform pg_temp.login(u_muhasebe);
  -- 044: ONAY artık Yönetici-only — Muhasebe yalnızca kendi işletmesinin KAYIT
  -- bildirimini görür (ONAY ve UYELIK gizli).
  select count(*) into n from notifications where baslik = 'RLS16';
  if n <> 1 then
    raise exception 'FAIL: muhasebe should see only the KAYIT bildirim (ONAY now Yönetici-only, 044), got %', n;
  end if;
  select type::text into v_durum from notifications where baslik = 'RLS16';
  if v_durum <> 'KAYIT' then
    raise exception 'FAIL: muhasebe should NOT see the ONAY bildirim after 044, got %', v_durum;
  end if;
  perform pg_temp.logout();
  -- fixture temizliği (owner olarak, RLS bypass): bu manuel bildirimler sonraki
  -- sayımlara sızmamalı — özellikle PASS 27 u_muhasebe'ye ONAY üretilmediğini
  -- baslik'ten bağımsız sayar, buradaki RLS16 ONAY satırı orada 1 gösterirdi.
  delete from notifications where baslik = 'RLS16';
  raise notice 'PASS 16: bildirim görünürlüğü — ONAY/KAYIT_SILME Yönetici-only (044), tip başına güncel rol (031)';

  -- ═══ 12) Cari borç/ödeme modeli (032) ═══
  -- Genel "Ödeme Topla": ödeme hareketi (GIDER, born BEKLIYOR) + pending
  -- kasa GELİR'i atomik; reject YOK'a döndürür; yeniden toplama (yansıt)
  -- her zaman kasa GELİR'i üretir.

  perform pg_temp.login(u_muhasebe);
  select topla_cari_odeme(v_cari, 99.50, 'Test ödeme') into v_islem_c1;
  select tur::text || '/' || durum::text into v_durum from islemler where id = v_islem_c1;
  if v_durum <> 'GELIR/BEKLIYOR' then
    raise exception 'FAIL: topla_cari_odeme işlemi GELIR/BEKLIYOR olmalı, got %', v_durum;
  end if;
  select cari_hareket_id into v_hareket2 from islemler where id = v_islem_c1;
  select tur::text || '/' || kasa_durumu::text into v_durum
  from cari_hareketler where id = v_hareket2;
  if v_durum <> 'GIDER/BEKLIYOR' then
    raise exception 'FAIL: ödeme hareketi GIDER/BEKLIYOR olmalı, got %', v_durum;
  end if;

  perform pg_temp.login(u_yonetici); -- 044
  perform reject_islem(v_islem_c1);
  perform pg_temp.login(u_muhasebe);
  select kasa_durumu::text into v_durum from cari_hareketler where id = v_hareket2;
  if v_durum <> 'YOK' then
    raise exception 'FAIL: reddedilen ödeme YOK''a dönmeli, got %', v_durum;
  end if;

  -- yeniden topla: tahsilat her zaman kasa GELİR'idir (hareket tur'u ne olursa)
  select yansit_cari_hareket(v_hareket2) into v_islem_c2;
  select tur::text into v_durum from islemler where id = v_islem_c2;
  if v_durum <> 'GELIR' then
    raise exception 'FAIL: tahsilat işlemi GELIR olmalı, got %', v_durum;
  end if;
  perform pg_temp.login(u_yonetici); -- 044
  perform approve_islem(v_islem_c2, null);
  select kasa_durumu::text into v_durum from cari_hareketler where id = v_hareket2;
  if v_durum <> 'YANSIDI' then
    raise exception 'FAIL: onaylanan ödeme YANSIDI olmalı, got %', v_durum;
  end if;
  perform pg_temp.logout();
  raise notice 'PASS 17: cari borç/ödeme — topla_cari_odeme + tahsilat her zaman GELİR (032)';

  -- ═══ 13) Kredi kartı komisyonu (033) ═══
  -- KK işlemin saklı komisyonu onayda ayrı bir born-ONAYLANDI gider üretir;
  -- p_komisyon = 0 saklı komisyonu iptal eder.

  perform pg_temp.login(u_muhasebe);
  insert into islemler
    (business_id, tur, tutar, baslik, kaynak, durum, created_by, odeme_yontemi, komisyon)
  values
    (v_servis, 'GELIR', 100.00, 'Komisyon testi', 'MANUEL', 'BEKLIYOR',
     u_muhasebe, 'KREDI_KARTI', 5.00)
  returning id into v_islem_c1;
  perform pg_temp.login(u_yonetici); -- 044
  perform approve_islem(v_islem_c1);
  perform pg_temp.login(u_muhasebe);
  select count(*) into n from islemler
  where business_id = v_servis and tur = 'GIDER' and durum = 'ONAYLANDI'
    and tutar = 5.00 and baslik = 'Komisyon testi — bu işlemin komisyonu'
    and odeme_yontemi = 'KREDI_KARTI';
  if n <> 1 then raise exception 'FAIL: komisyon gideri oluşmadı (%)', n; end if;

  insert into islemler
    (business_id, tur, tutar, baslik, kaynak, durum, created_by, odeme_yontemi, komisyon)
  values
    (v_servis, 'GELIR', 50.00, 'Komisyon iptal testi', 'MANUEL', 'BEKLIYOR',
     u_muhasebe, 'KREDI_KARTI', 2.00)
  returning id into v_islem_c2;
  perform pg_temp.login(u_yonetici); -- 044
  perform approve_islem(v_islem_c2, null, 0);
  select count(*) into n from islemler where baslik like 'Komisyon iptal testi — bu%';
  if n <> 0 then raise exception 'FAIL: p_komisyon = 0 saklı komisyonu iptal etmedi'; end if;
  perform pg_temp.logout();
  raise notice 'PASS 18: KK komisyonu — onayda ayrı gider, 0 ile iptal (033)';

  -- ═══ 14) Kayıt finans alanları yalnızca finans (034) ═══
  -- Strip trigger: personelin INSERT'inde tutar/yöntem/komisyon sıfırlanır;
  -- UPDATE'te eski (finans) değerlere sabitlenir. Gelir override değerlerle doğar.

  perform pg_temp.login(u_personel);
  insert into kayitlar
    (business_id, plaka, musteri_adi, paket_id, durum, created_by, tutar, odeme_yontemi, komisyon)
  values
    (v_servis, '34 RLS 034', 'Strip Testi', v_paket, 'AKTIF', u_personel, 999.99, 'KREDI_KARTI', 10.00)
  returning id into v_kayit;
  perform pg_temp.logout();
  select count(*) into n from kayitlar
  where id = v_kayit and tutar is null and odeme_yontemi is null and komisyon is null;
  if n <> 1 then
    raise exception 'FAIL: personel kaydında finans alanları sıfırlanmadı (034)';
  end if;

  perform pg_temp.login(u_muhasebe);
  update kayitlar
  set tutar = 750.00, odeme_yontemi = 'KREDI_KARTI', komisyon = 15.00
  where id = v_kayit;
  perform pg_temp.logout();

  perform pg_temp.login(u_personel);
  update kayitlar
  set tutar = null, odeme_yontemi = null, komisyon = null, musteri_adi = 'Değişti'
  where id = v_kayit;
  perform pg_temp.logout();
  select count(*) into n from kayitlar
  where id = v_kayit and tutar = 750.00 and odeme_yontemi = 'KREDI_KARTI'
    and komisyon = 15.00 and musteri_adi = 'Değişti';
  if n <> 1 then
    raise exception 'FAIL: personel finans alanlarını değiştirebildi (034)';
  end if;

  perform pg_temp.login(u_muhasebe);
  update kayitlar set durum = 'TAMAMLANDI' where id = v_kayit;
  select count(*) into n from islemler
  where kayit_id = v_kayit and durum = 'BEKLIYOR' and tutar = 750.00
    and odeme_yontemi = 'KREDI_KARTI' and komisyon = 15.00;
  if n <> 1 then
    raise exception 'FAIL: gelir override tutar/yöntem/komisyonla doğmadı (034)';
  end if;
  perform pg_temp.logout();
  raise notice 'PASS 19: kayıt finans alanları — strip trigger + override gelir (034)';

  -- ═══ 15) İstekler (037) ═══
  -- Personel kendi isteğini oluşturur; karar yalnızca finans RPC'leriyle —
  -- client UPDATE yolu yok; onaylanan avans, Avans Ver ile birebir aynı doğar.

  perform pg_temp.login(u_personel);
  insert into istekler (business_id, profile_id, tur, tutar, metin)
  values (v_servis, u_personel, 'AVANS', 500.00, 'Acil ihtiyaç')
  returning id into v_kayit;
  insert into istekler (business_id, profile_id, tur, metin)
  values (v_servis, u_personel, 'SIKAYET', 'Test şikayet')
  returning id into v_kayit2;

  begin
    update istekler set durum = 'ONAYLANDI' where id = v_kayit;
    raise exception 'FAIL: istek durumu client''tan değiştirilebildi';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if; -- expected: update revoked
  end;
  begin
    perform approve_avans_istek(v_kayit);
    raise exception 'FAIL: personel kendi avans isteğini onaylayabildi';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if; -- expected: yetkiniz yok
  end;
  perform pg_temp.logout();

  -- 046: istekler yalnızca Yönetici'nin — Muhasebe ne görebilir ne karar verir
  perform pg_temp.login(u_muhasebe);
  select count(*) into n from istekler where business_id = v_servis;
  if n <> 0 then
    raise exception 'FAIL: Muhasebe istekleri görebiliyor (046: yalnızca Yönetici), % satır', n;
  end if;
  begin
    perform approve_avans_istek(v_kayit);
    raise exception 'FAIL: Muhasebe avans isteğini onaylayabildi (046)';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if; -- expected: yalnızca Yöneticiye aittir
  end;
  begin
    perform alindi_istek(v_kayit2);
    raise exception 'FAIL: Muhasebe şikayeti alındı işaretleyebildi (046)';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  perform pg_temp.logout();

  perform pg_temp.login(u_yonetici);
  select approve_avans_istek(v_kayit) into v_islem_c1;
  select durum::text into v_durum from istekler where id = v_kayit;
  if v_durum <> 'ONAYLANDI' then
    raise exception 'FAIL: avans isteği ONAYLANDI olmadı (%)', v_durum;
  end if;
  select tur::text || '/' || durum::text || '/' || kaynak::text into v_durum
  from islemler where id = v_islem_c1;
  -- 045: avans artık Onay'dan geçer — Avans Ver ile aynı şekilde BEKLIYOR doğar
  if v_durum <> 'GIDER/BEKLIYOR/PERSONEL' then
    raise exception 'FAIL: avans gideri Avans Ver ile aynı doğmadı (%)', v_durum;
  end if;
  select count(*) into n from personel_odemeler
  where islem_id = v_islem_c1 and tur = 'AVANS' and profile_id = u_personel;
  if n <> 1 then raise exception 'FAIL: personel_odemeler AVANS satırı yok'; end if;

  begin
    perform alindi_istek(v_kayit); -- avans "alındı" ile kapatılamaz
    raise exception 'FAIL: avans isteği alindi_istek ile kapatıldı';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  perform alindi_istek(v_kayit2);
  select durum::text into v_durum from istekler where id = v_kayit2;
  if v_durum <> 'ALINDI' then
    raise exception 'FAIL: şikayet ALINDI olmadı (%)', v_durum;
  end if;
  perform pg_temp.logout();
  raise notice 'PASS 20: istekler — personel oluşturur, karar yalnızca Yönetici RPC''leriyle (037/046)';

  -- ═══ 16) Avans isteği maaş sınırı (038) ═══
  -- (PASS 20'deki 500'lük istek maaş 0 iken kabul edildi = sınırsız hal.)

  update business_members set maas = 300.00
  where profile_id = u_personel and business_id = v_servis;

  perform pg_temp.login(u_personel);
  begin
    insert into istekler (business_id, profile_id, tur, tutar)
    values (v_servis, u_personel, 'AVANS', 500.00);
    raise exception 'FAIL: maaştan büyük avans isteği kabul edildi';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if; -- expected: maaş sınırı
  end;
  insert into istekler (business_id, profile_id, tur, tutar)
  values (v_servis, u_personel, 'AVANS', 200.00);
  perform pg_temp.logout();
  raise notice 'PASS 21: avans isteği maaş sınırı — maaş doluyken tavan, boşken sınırsız (038)';

  -- ═══ 17) Komisyon ana işleme bağlı, birlikte silinir (039) ═══
  -- KK komisyonlu işlem onaylanınca komisyon gideri komisyon_of ile bağlanır;
  -- ana işlem delete_islem ile silinince komisyon da gider (öksüz kalmaz).

  perform pg_temp.login(u_muhasebe);
  insert into islemler
    (business_id, tur, tutar, baslik, kaynak, durum, created_by, odeme_yontemi, komisyon)
  values
    (v_servis, 'GELIR', 400.00, 'Komisyon bağ testi', 'MANUEL', 'BEKLIYOR',
     u_muhasebe, 'KREDI_KARTI', 20.00)
  returning id into v_islem_c1;
  perform pg_temp.login(u_yonetici); -- 044
  perform approve_islem(v_islem_c1);
  perform pg_temp.login(u_muhasebe); -- silme hâlâ Muhasebe'de

  select id into v_islem_c2 from islemler
  where komisyon_of = v_islem_c1 and tur = 'GIDER' and tutar = 20.00;
  if v_islem_c2 is null then
    raise exception 'FAIL: komisyon komisyon_of ile bağlanmadı (039)';
  end if;

  perform delete_islem(v_islem_c1);
  select count(*) into n from islemler where id in (v_islem_c1, v_islem_c2);
  if n <> 0 then
    raise exception 'FAIL: ana işlem silinince komisyon öksüz kaldı (%)', n;
  end if;
  perform pg_temp.logout();
  raise notice 'PASS 22: komisyon ana işleme bağlı, birlikte silinir (039)';

  -- ═══ 18) Onaya Geri Gönder (040) ═══
  -- Yalnızca Yönetici geri gönderebilir; komisyon çocuğu çöpe düşmeden
  -- silinir ve yeniden onayda tekrar doğar; cari hareket YANSIDI →
  -- BEKLIYOR'a döner; komisyon çocuğu ve PERSONEL işlemi geri gönderilemez.

  perform pg_temp.login(u_muhasebe);
  insert into islemler
    (business_id, tur, tutar, baslik, kaynak, durum, created_by, odeme_yontemi, komisyon)
  values
    (v_servis, 'GELIR', 300.00, 'Geri gönder testi', 'MANUEL', 'BEKLIYOR',
     u_muhasebe, 'KREDI_KARTI', 12.00)
  returning id into v_islem_c1;
  perform pg_temp.login(u_yonetici); -- 044
  perform approve_islem(v_islem_c1);
  perform pg_temp.login(u_muhasebe); -- geri-gönder reddi Muhasebe ile sınanır
  begin
    perform islem_onaya_geri_gonder(v_islem_c1);
    raise exception 'FAIL: Muhasebe onaya geri gönderebildi (Yönetici-only olmalı)';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if; -- expected: yetki yalnızca Yöneticide
  end;
  perform pg_temp.logout();

  perform pg_temp.login(u_yonetici);
  select id into v_islem_c2 from islemler where komisyon_of = v_islem_c1;
  if v_islem_c2 is null then
    raise exception 'FAIL: fixture komisyon çocuğu doğmadı (040 testi kurulamadı)';
  end if;
  begin
    perform islem_onaya_geri_gonder(v_islem_c2);
    raise exception 'FAIL: komisyon çocuğu tek başına geri gönderilebildi';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if; -- expected: ana işlemi gönderin
  end;

  perform islem_onaya_geri_gonder(v_islem_c1);
  select durum::text into v_durum from islemler where id = v_islem_c1;
  if v_durum <> 'BEKLIYOR' then
    raise exception 'FAIL: geri gönderilen işlem BEKLIYOR olmadı (%)', v_durum;
  end if;
  select count(*) into n from islemler where id = v_islem_c2;
  if n <> 0 then raise exception 'FAIL: komisyon çocuğu ana işlemle geri çekilmedi'; end if;
  select count(*) into n from trash where payload->>'id' = v_islem_c2::text;
  if n <> 0 then
    raise exception 'FAIL: komisyon çocuğu çöpe düştü (geri alınırsa çift komisyon)';
  end if;

  perform approve_islem(v_islem_c1);
  select count(*) into n from islemler
  where komisyon_of = v_islem_c1 and tur = 'GIDER' and tutar = 12.00 and durum = 'ONAYLANDI';
  if n <> 1 then raise exception 'FAIL: yeniden onayda komisyon tekrar doğmadı (%)', n; end if;

  -- cari işlem geri gönderilince hareket YANSIDI → BEKLIYOR (bakiye korunur)
  select id into v_islem_c2 from islemler
  where cari_hareket_id = v_hareket2 and durum = 'ONAYLANDI';
  perform islem_onaya_geri_gonder(v_islem_c2);
  select kasa_durumu::text into v_durum from cari_hareketler where id = v_hareket2;
  if v_durum <> 'BEKLIYOR' then
    raise exception 'FAIL: cari hareket BEKLIYOR''a dönmedi (%)', v_durum;
  end if;
  perform approve_islem(v_islem_c2, null);
  select kasa_durumu::text into v_durum from cari_hareketler where id = v_hareket2;
  if v_durum <> 'YANSIDI' then
    raise exception 'FAIL: yeniden onaylanan cari işlem hareketi YANSIDI yapmadı (%)', v_durum;
  end if;

  -- personel ödemesi (maaş/avans/prim) geri gönderilemez.
  -- 045 sonrası avans/prim BEKLIYOR doğuyor, o yüzden fixture'ı önce onayla
  -- (zaten Yönetici oturumundayız).
  select id into v_islem_c2 from islemler
  where business_id = v_servis and kaynak = 'PERSONEL' and durum = 'BEKLIYOR'
  limit 1;
  if v_islem_c2 is null then
    raise exception 'FAIL: bekleyen PERSONEL işlemi bulunamadı (040 testi kurulamadı)';
  end if;
  perform approve_islem(v_islem_c2, 'NAKIT');
  begin
    perform islem_onaya_geri_gonder(v_islem_c2);
    raise exception 'FAIL: PERSONEL işlemi onaya geri gönderilebildi';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if; -- expected: personel ödemesi korumalı
  end;
  perform pg_temp.logout();
  raise notice 'PASS 23: onaya geri gönder — Yönetici-only, komisyon çöpsüz yeniden doğar, cari BEKLIYOR''a döner (040)';

  -- ═══ 19) Hesaba Para Aktarımı (041) ═══
  -- İki bacak (nakit gideri + KK geliri) birlikte doğar; kasa bakiyesi ve
  -- ciro/gider toplamları DEĞİŞMEZ (iç aktarım); iki bacak ayrılmaz: hangisi
  -- silinirse ikisi birden gider ve çöpe düşmezler.

  perform pg_temp.login(u_personel);
  begin
    perform para_transferi(v_servis, 100.00);
    raise exception 'FAIL: personel para transferi yapabildi';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if; -- expected: yetkiniz yok
  end;
  perform pg_temp.logout();

  -- 043: transfer artık nakit bakiyesiyle sınırlı. Buradaki (250) ve 25'teki
  -- (400) tutarlar fixture'ın nakit kovasına dayanır: +1500 kayıt geliri
  -- (PASS 10) − 100 manuel gider = 1400. Fixture değişirse testin kafa
  -- karıştırıcı "yeterli bakiye yok" hatasıyla değil, burada patlaması gerekir.
  select coalesce(sum(tutar) filter (where tur = 'GELIR'), 0)
       - coalesce(sum(tutar) filter (where tur = 'GIDER'), 0)
  into nakit_before
  from islemler
  where business_id = v_servis and durum = 'ONAYLANDI' and odeme_yontemi = 'NAKIT';
  if nakit_before < 400.00 then
    raise exception 'FAIL: 24/25 en az 400 nakit bakiyesi bekliyor, got % (fixture değişmiş)',
      nakit_before;
  end if;

  select toplam_gelir, toplam_gider into gelir_before, gider_before
  from v_kasa_ozet where business_id = v_servis;

  perform pg_temp.login(u_muhasebe);
  select para_transferi(v_servis, 250.00) into v_islem_c1;
  perform pg_temp.logout();

  select tur::text || '/' || durum::text || '/' || odeme_yontemi::text into v_durum
  from islemler where id = v_islem_c1;
  if v_durum <> 'GIDER/ONAYLANDI/NAKIT' then
    raise exception 'FAIL: transfer ana bacağı GIDER/ONAYLANDI/NAKIT olmalı, got %', v_durum;
  end if;

  select id into v_islem_c2 from islemler where transfer_of = v_islem_c1;
  if v_islem_c2 is null then
    raise exception 'FAIL: transfer eş bacağı doğmadı';
  end if;
  select tur::text || '/' || durum::text || '/' || odeme_yontemi::text into v_durum
  from islemler where id = v_islem_c2;
  if v_durum <> 'GELIR/ONAYLANDI/KREDI_KARTI' then
    raise exception 'FAIL: transfer eş bacağı GELIR/ONAYLANDI/KREDI_KARTI olmalı, got %', v_durum;
  end if;

  -- EN KRİTİK: iç aktarım ciroyu/gideri şişirmemeli, bakiye sabit kalmalı
  select toplam_gelir, toplam_gider into gelir_after, gider_after
  from v_kasa_ozet where business_id = v_servis;
  if gelir_after <> gelir_before or gider_after <> gider_before then
    raise exception 'FAIL: transfer ciro/gideri değiştirdi (gelir % -> %, gider % -> %)',
      gelir_before, gelir_after, gider_before, gider_after;
  end if;

  perform pg_temp.login(u_yonetici);
  begin
    perform islem_onaya_geri_gonder(v_islem_c1);
    raise exception 'FAIL: transfer onaya geri gönderilebildi';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if; -- expected: silip yeniden yapın
  end;
  perform pg_temp.logout();

  -- EŞ bacaktan silmek de iki bacağı birden götürmeli (tek bacak kalırsa kasa bozulur)
  perform pg_temp.login(u_muhasebe);
  perform delete_islem(v_islem_c2);
  perform pg_temp.logout();

  select count(*) into n from islemler where id in (v_islem_c1, v_islem_c2);
  if n <> 0 then
    raise exception 'FAIL: transfer bacakları birlikte silinmedi (kalan %)', n;
  end if;
  select count(*) into n from trash
  where payload->>'id' in (v_islem_c1::text, v_islem_c2::text);
  if n <> 0 then
    raise exception 'FAIL: transfer bacağı çöpe düştü — tek bacak geri alınırsa kasa şişer';
  end if;
  raise notice 'PASS 24: para transferi — kovalar kayar, ciro/bakiye sabit, iki bacak ayrılmaz (041)';

  -- ═══ 20) Transferi Geri Al (042) ═══
  -- Geri alma SİLME değil, ters yönde ikinci bir aktarımdır: kovalar eski
  -- hâline döner, ciro/bakiye yine değişmez, iki kez geri alınamaz ve geri
  -- alınmış bir aktarım silinemez.

  select coalesce(sum(tutar) filter (where tur = 'GELIR'), 0)
       - coalesce(sum(tutar) filter (where tur = 'GIDER'), 0)
  into nakit_before
  from islemler
  where business_id = v_servis and durum = 'ONAYLANDI' and odeme_yontemi = 'NAKIT';

  select toplam_gelir, toplam_gider into gelir_before, gider_before
  from v_kasa_ozet where business_id = v_servis;

  perform pg_temp.login(u_muhasebe);
  select para_transferi(v_servis, 400.00) into v_islem_c1;
  begin
    perform transfer_geri_al(v_islem_c1); -- Muhasebe değil, Yönetici işi
    raise exception 'FAIL: Muhasebe transferi geri alabildi';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if; -- expected: yalnızca Yönetici
  end;
  perform pg_temp.logout();

  perform pg_temp.login(u_yonetici);
  select transfer_geri_al(v_islem_c1) into v_islem_c2;

  -- ters ana bacak: KK'dan çıkış, "Transfer Geri Alma"
  select tur::text || '/' || durum::text || '/' || odeme_yontemi::text || '/' || baslik
  into v_durum from islemler where id = v_islem_c2;
  if v_durum <> 'GIDER/ONAYLANDI/KREDI_KARTI/Transfer Geri Alma' then
    raise exception 'FAIL: geri alma ana bacağı beklenen şekilde doğmadı: %', v_durum;
  end if;
  -- ters eş bacak: nakde geri dönüş
  select tur::text || '/' || odeme_yontemi::text into v_durum
  from islemler where transfer_of = v_islem_c2;
  if v_durum <> 'GELIR/NAKIT' then
    raise exception 'FAIL: geri alma eş bacağı GELIR/NAKIT olmalı, got %', v_durum;
  end if;

  -- EN KRİTİK: nakit kovası ve ciro/bakiye transfer öncesi hâline dönmeli
  select coalesce(sum(tutar) filter (where tur = 'GELIR'), 0)
       - coalesce(sum(tutar) filter (where tur = 'GIDER'), 0)
  into nakit_after
  from islemler
  where business_id = v_servis and durum = 'ONAYLANDI' and odeme_yontemi = 'NAKIT';
  if nakit_after <> nakit_before then
    raise exception 'FAIL: geri almadan sonra nakit kovası dönmedi (% -> %)',
      nakit_before, nakit_after;
  end if;
  select toplam_gelir, toplam_gider into gelir_after, gider_after
  from v_kasa_ozet where business_id = v_servis;
  if gelir_after <> gelir_before or gider_after <> gider_before then
    raise exception 'FAIL: transfer + geri alma ciroyu değiştirdi';
  end if;

  -- ikinci kez geri alınamaz; geri alma da geri alınamaz
  begin
    perform transfer_geri_al(v_islem_c1);
    raise exception 'FAIL: aktarım iki kez geri alınabildi';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if; -- expected: zaten geri alınmış
  end;
  begin
    perform transfer_geri_al(v_islem_c2);
    raise exception 'FAIL: geri alma işlemi tekrar geri alınabildi';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  perform pg_temp.logout();

  -- geri alınmış aktarım silinemez (orijinal gidip iade kalsaydı kova ters kayardı)
  perform pg_temp.login(u_muhasebe);
  begin
    perform delete_islem(v_islem_c1);
    raise exception 'FAIL: geri alınmış aktarım silinebildi';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if; -- expected: önce geri almayı silin
  end;
  -- geri almayı silmek serbest: aktarım yeniden geri alınabilir hâle gelir
  perform delete_islem(v_islem_c2);
  perform pg_temp.logout();
  select count(*) into n from islemler where iade_of = v_islem_c1;
  if n <> 0 then raise exception 'FAIL: geri alma silinmedi'; end if;
  perform pg_temp.login(u_yonetici);
  perform transfer_geri_al(v_islem_c1); -- artık tekrar mümkün
  perform pg_temp.logout();
  raise notice 'PASS 25: transferi geri al — ters aktarım, kova geri döner, çift geri alma engelli (042)';

  -- ═══ 26) 043: transfer nakit bakiyesini aşamaz ═══
  -- İstemci tuş vuruşunu engelliyor; gerçek sınır burada — RPC doğrudan
  -- çağrılsa da geçmemeli. Nakit kovası TRANSFER bacakları DÂHİL hesaplanır,
  -- yoksa arka arkaya iki transfer aynı parayı iki kez harcayabilirdi.

  perform pg_temp.login(u_muhasebe);

  -- test bakiyeyi sıfırlayacağı için önce bilinen bir nakit girişi ekle
  insert into islemler (business_id, tur, tutar, baslik, kaynak, durum, created_by, odeme_yontemi)
  values (v_servis, 'GELIR', 750.00, 'Bakiye sınırı testi', 'MANUEL', 'BEKLIYOR', u_muhasebe, 'NAKIT')
  returning id into v_gelir2;
  perform pg_temp.login(u_yonetici); -- 044
  perform approve_islem(v_gelir2, 'NAKIT');
  perform pg_temp.login(u_muhasebe); -- transfer hâlâ finansın (Muhasebe dâhil)

  select coalesce(sum(tutar) filter (where tur = 'GELIR'), 0)
       - coalesce(sum(tutar) filter (where tur = 'GIDER'), 0)
  into nakit_before
  from islemler
  where business_id = v_servis and durum = 'ONAYLANDI' and odeme_yontemi = 'NAKIT';
  if nakit_before <= 0 then
    raise exception 'FAIL: 26 için pozitif nakit bakiyesi bekleniyordu, got %', nakit_before;
  end if;

  -- bakiyeden 1 kuruş fazlası reddedilir
  begin
    perform para_transferi(v_servis, nakit_before + 0.01);
    raise exception 'FAIL: nakit bakiyesini aşan transfer yapılabildi';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if; -- expected: yeterli bakiye yok
  end;

  -- tam bakiye kadarı serbest — kova tam sıfırlanır
  select para_transferi(v_servis, nakit_before) into v_islem_c1;
  select coalesce(sum(tutar) filter (where tur = 'GELIR'), 0)
       - coalesce(sum(tutar) filter (where tur = 'GIDER'), 0)
  into nakit_after
  from islemler
  where business_id = v_servis and durum = 'ONAYLANDI' and odeme_yontemi = 'NAKIT';
  if nakit_after <> 0 then
    raise exception 'FAIL: tam bakiye transferinden sonra nakit kovası 0 olmalı, got %', nakit_after;
  end if;

  -- kova boşaldı: en küçük transfer bile reddedilir (transfer bacağı sayılmasaydı geçerdi)
  begin
    perform para_transferi(v_servis, 0.01);
    raise exception 'FAIL: boş nakit kovasından transfer yapılabildi';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if; -- expected: yeterli bakiye yok
  end;

  perform pg_temp.logout();
  raise notice 'PASS 26: para transferi nakit bakiyesini aşamaz (043)';

  -- ═══ 27) 044: Onay yalnızca Yönetici ═══
  -- Ekranı gizlemek yetmez — Muhasebe RPC'yi doğrudan çağırırsa da geçmemeli.
  -- Muhasebe'nin diğer finans yetkileri (işlem ekleme/silme) DURUYOR.

  perform pg_temp.login(u_muhasebe);
  insert into islemler (business_id, tur, tutar, baslik, kaynak, durum, created_by, odeme_yontemi)
  values (v_servis, 'GELIR', 60.00, 'Onay yetki testi', 'MANUEL', 'BEKLIYOR', u_muhasebe, 'NAKIT')
  returning id into v_islem_c1;

  begin
    perform approve_islem(v_islem_c1, 'NAKIT');
    raise exception 'FAIL: Muhasebe işlem onaylayabildi (044: yalnızca Yönetici)';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if; -- expected: yalnızca Yöneticidedir
  end;
  begin
    perform reject_islem(v_islem_c1);
    raise exception 'FAIL: Muhasebe işlem reddedebildi (044: yalnızca Yönetici)';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  -- kayıt silme kararı da Yöneticinin
  insert into kayitlar (business_id, plaka, musteri_adi, durum, created_by)
  values (v_servis, '34 RLS 044', 'Onay Yetki', 'AKTIF', u_muhasebe)
  returning id into v_kayit;
  perform request_kayit_silme(v_kayit); -- istek Muhasebe'de serbest
  begin
    perform approve_kayit_silme(v_kayit);
    raise exception 'FAIL: Muhasebe kayıt silmeyi onaylayabildi (044)';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  begin
    perform reject_kayit_silme(v_kayit);
    raise exception 'FAIL: Muhasebe kayıt silmeyi reddedebildi (044)';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  -- işlem hâlâ BEKLIYOR: hiçbir reddedilen çağrı kasayı kıpırdatmamış olmalı
  select durum::text into v_durum from islemler where id = v_islem_c1;
  if v_durum <> 'BEKLIYOR' then
    raise exception 'FAIL: reddedilen onay çağrısı işlemin durumunu değiştirdi (%)', v_durum;
  end if;

  perform pg_temp.logout();

  -- ONAY bildirimi Muhasebe'ye HİÇ ÜRETİLMEMELİ (açamayacağı ekran için).
  -- Tablo sahibi olarak sorgulanır: oturum içinde sorsaydık politika zaten
  -- gizlerdi ve üretimi değil görünürlüğü test etmiş olurduk.
  select count(*) into n from notifications
  where profile_id = u_muhasebe and type = 'ONAY' and business_id = v_servis;
  if n <> 0 then
    raise exception 'FAIL: Muhasebe''ye ONAY bildirimi üretildi (%)', n;
  end if;

  -- Yönetici aynı işlemi sorunsuz sonuçlandırır + bildirimini görür
  perform pg_temp.login(u_yonetici);
  perform approve_islem(v_islem_c1, 'NAKIT');
  select durum::text into v_durum from islemler where id = v_islem_c1;
  if v_durum <> 'ONAYLANDI' then
    raise exception 'FAIL: Yönetici onaylayamadı (%)', v_durum;
  end if;
  perform approve_kayit_silme(v_kayit);
  perform pg_temp.logout();
  raise notice 'PASS 27: onay/red + kayıt silme kararı yalnızca Yönetici (044)';

  -- ═══ 28) 045: avans/prim Onay'dan geçer, maaş geçmez ═══
  -- EN KRİTİK: BEKLIYOR bir avans kasaya HİÇ dokunmamalı; reddedilince
  -- personel defterinden de silinmeli; maaş ise eskisi gibi anında işlemeli.

  select bakiye into gelir_before from v_kasa_ozet where business_id = v_servis;

  perform pg_temp.login(u_muhasebe); -- avans/prim vermek hâlâ finansın
  select give_avans(u_personel, v_servis, 120.00, 'Onay testi avans') into v_islem_c1;
  select tur::text || '/' || durum::text || '/' || kaynak::text into v_durum
  from islemler where id = v_islem_c1;
  if v_durum <> 'GIDER/BEKLIYOR/PERSONEL' then
    raise exception 'FAIL: avans BEKLIYOR doğmadı (%)', v_durum;
  end if;
  select give_prim(u_personel, v_servis, 80.00, 'Onay testi prim') into v_islem_c2;
  select durum::text into v_durum from islemler where id = v_islem_c2;
  if v_durum <> 'BEKLIYOR' then
    raise exception 'FAIL: prim BEKLIYOR doğmadı (%)', v_durum;
  end if;

  -- bekleyen avans/prim kasayı kıpırdatmamalı
  select bakiye into gelir_after from v_kasa_ozet where business_id = v_servis;
  if gelir_after <> gelir_before then
    raise exception 'FAIL: bekleyen avans/prim kasayı değiştirdi (% -> %)',
      gelir_before, gelir_after;
  end if;
  -- ama personel defterine yazılmış olmalı (rozetle gösterilecek)
  select count(*) into n from personel_odemeler
  where islem_id in (v_islem_c1, v_islem_c2);
  if n <> 2 then raise exception 'FAIL: avans/prim personel_odemeler satırı yok (%)', n; end if;
  perform pg_temp.logout();

  perform pg_temp.login(u_yonetici);
  -- red: personel defterinden de silinir (verilmemiş avans orada durmamalı)
  perform reject_islem(v_islem_c2);
  select count(*) into n from personel_odemeler where islem_id = v_islem_c2;
  if n <> 0 then raise exception 'FAIL: reddedilen prim personel defterinde kaldı'; end if;

  -- onay: kasaya tam olarak avans tutarı kadar gider işler
  perform approve_islem(v_islem_c1, 'NAKIT');
  select bakiye into gelir_after from v_kasa_ozet where business_id = v_servis;
  if gelir_after <> gelir_before - 120.00 then
    raise exception 'FAIL: onaylanan avans kasaya 120.00 gider olarak işlemedi (% -> %)',
      gelir_before, gelir_after;
  end if;
  perform pg_temp.logout();

  -- maaş DEĞİŞMEDİ: born-ONAYLANDI, Onay'a hiç düşmez
  update business_members set maas = 500.00
  where profile_id = u_personel and business_id = v_servis;
  perform pg_temp.login(u_muhasebe);
  select pay_maas(u_personel, v_servis) into v_islem_c2; -- maaşı üyelikten okur
  perform pg_temp.logout();
  select durum::text into v_durum from islemler where id = v_islem_c2;
  if v_durum <> 'ONAYLANDI' then
    raise exception 'FAIL: maaş born-ONAYLANDI olmalı (045 maaşı değiştirmemeli), got %', v_durum;
  end if;

  -- silme: bağlı personel_odemeler satırı öksüz kalmamalı (045 düzeltmesi)
  perform pg_temp.login(u_muhasebe);
  perform delete_islem(v_islem_c1);
  perform pg_temp.logout();
  select count(*) into n from personel_odemeler where islem_id = v_islem_c1;
  if n <> 0 then
    raise exception 'FAIL: silinen avansın personel_odemeler satırı öksüz kaldı';
  end if;
  raise notice 'PASS 28: avans/prim Onay''dan geçer, maaş anında işler (045)';

  -- ═══ 29) 047: İşletme Ayarları yazmaları yalnızca Yönetici ═══
  -- Muhasebe businesses'ı güncelleyemez (UPDATE 0 satır etkiler — using
  -- filtresi sessizce süzer) ve kategori ekleyemez/pasifleştiremez.
  -- Okumalar durur: kategori seçici Muhasebe'de çalışmaya devam etmeli.

  perform pg_temp.login(u_muhasebe);

  update businesses set name = 'RLS 047 Gasp' where id = v_servis;
  select count(*) into n from businesses where id = v_servis and name = 'RLS 047 Gasp';
  if n <> 0 then
    raise exception 'FAIL: Muhasebe işletme adını değiştirebildi (047)';
  end if;

  update businesses set konum_yaricap_m = 99999 where id = v_servis;
  select count(*) into n from businesses where id = v_servis and konum_yaricap_m = 99999;
  if n <> 0 then
    raise exception 'FAIL: Muhasebe mesai konumunu değiştirebildi (047)';
  end if;

  begin
    insert into kategoriler (business_id, tur, label)
    values (v_servis, 'GIDER', 'RLS 047 Kategori');
    raise exception 'FAIL: Muhasebe kategori ekleyebildi (047)';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if; -- expected: RLS with check
  end;

  -- pasifleştirme (soft delete) de UPDATE'tir: 0 satır etkilemeli
  update kategoriler set is_active = false
  where business_id = v_servis and label = 'Servis Ücreti';
  select count(*) into n from kategoriler
  where business_id = v_servis and label = 'Servis Ücreti' and not is_active;
  if n <> 0 then
    raise exception 'FAIL: Muhasebe kategori pasifleştirebildi (047)';
  end if;

  -- okuma durur: Muhasebe kategori seçicisi boş kalmamalı
  select count(*) into n from kategoriler where business_id = v_servis and is_active;
  if n = 0 then
    raise exception 'FAIL: Muhasebe kategorileri okuyamıyor (047 select''e dokunmamalıydı)';
  end if;

  perform pg_temp.logout();

  -- Yönetici aynı yazmaları sorunsuz yapar (ve geri alır)
  perform pg_temp.login(u_yonetici);
  update businesses set name = 'RLS 047 Yönetici' where id = v_servis;
  select count(*) into n from businesses where id = v_servis and name = 'RLS 047 Yönetici';
  if n <> 1 then
    raise exception 'FAIL: Yönetici işletme adını değiştiremedi (047)';
  end if;
  insert into kategoriler (business_id, tur, label)
  values (v_servis, 'GIDER', 'RLS 047 Yönetici Kategori');
  perform pg_temp.logout();
  raise notice 'PASS 29: İşletme Ayarları yazmaları yalnızca Yönetici (047)';

  -- ═══ 30) 048: İzinler — kademeli yetki + çakışma ═══
  -- Muhasebe yalnızca PERSONEL hedefin iznini yönetir; Yönetici herkesinkini.
  -- Personel izinleri hiç okuyamaz/yazamaz; çakışan aralık reddedilir.

  perform pg_temp.login(u_muhasebe);

  -- Muhasebe → Personel: serbest
  insert into izinler (business_id, profile_id, baslangic, bitis)
  values (v_servis, u_personel, istanbul_today(), istanbul_today() + 2)
  returning id into v_izin;

  -- Muhasebe → Muhasebe hedef (kendisi; üyelik var, rol katmanı reddetmeli)
  begin
    insert into izinler (business_id, profile_id, baslangic, bitis)
    values (v_servis, u_muhasebe, istanbul_today(), istanbul_today() + 1);
    raise exception 'FAIL: Muhasebe kendi rolündeki hedefe izin ekleyebildi (048)';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if; -- expected: RLS with check
  end;

  -- çakışan aralık (uçlar dâhil) trigger'dan döner
  begin
    insert into izinler (business_id, profile_id, baslangic, bitis)
    values (v_servis, u_personel, istanbul_today() + 1, istanbul_today() + 5);
    raise exception 'FAIL: çakışan izin eklendi (048)';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if; -- expected: çakışıyor
  end;

  perform pg_temp.logout();

  -- Personel: izinleri hiç görmez, kendine de ekleyemez
  perform pg_temp.login(u_personel);
  select count(*) into n from izinler;
  if n <> 0 then
    raise exception 'FAIL: Personel izin satırı görüyor (%) (048)', n;
  end if;
  begin
    insert into izinler (business_id, profile_id, baslangic, bitis)
    values (v_servis, u_personel, istanbul_today() + 10, istanbul_today() + 12);
    raise exception 'FAIL: Personel kendine izin ekleyebildi (048)';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  perform pg_temp.logout();

  -- Yönetici → Muhasebe hedef: serbest
  perform pg_temp.login(u_yonetici);
  insert into izinler (business_id, profile_id, baslangic, bitis)
  values (v_servis, u_muhasebe, istanbul_today(), istanbul_today() + 1)
  returning id into v_izin2;
  perform pg_temp.logout();

  -- Muhasebe, Muhasebe-hedefli izni SİLEMEZ (using süzer, 0 satır)…
  perform pg_temp.login(u_muhasebe);
  delete from izinler where id = v_izin2;
  select count(*) into n from izinler where id = v_izin2;
  if n <> 1 then
    raise exception 'FAIL: Muhasebe kendi rolündeki hedefin iznini silebildi (048)';
  end if;
  -- …Personel-hedefli izni silebilir
  delete from izinler where id = v_izin;
  select count(*) into n from izinler where id = v_izin;
  if n <> 0 then
    raise exception 'FAIL: Muhasebe personel iznini silemedi (048)';
  end if;
  perform pg_temp.logout();
  raise notice 'PASS 30: İzinler kademeli yetki + çakışma koruması (048)';

  -- ═══ 31) 049: onaya geri gönder yalnızca Onay'dan geçmiş işlemlere ═══
  -- Cron'un born-ONAYLANDI ürettiği sabit gider (SABIT_GIDER) ve tekrar
  -- (MANUEL + tekrar_kural_id) satırları Onay'a HİÇ düşmez → geri gönderilemez.
  -- Normal onaylanmış MANUEL ise geri gönderilebilir. Born-ONAYLANDI satırları
  -- owner olarak yazıyoruz (RLS WITH CHECK client'a yalnızca BEKLIYOR verir).

  perform pg_temp.logout();
  insert into sabit_giderler (business_id, name, tutar, odeme_gunu)
  values (v_servis, 'Onaya-geri sabit test', 900.00, 15) returning id into v_kayit;
  insert into islemler
    (business_id, tur, tutar, baslik, kaynak, durum, islem_tarihi, onaylanma_tarihi, sabit_gider_id)
  values
    (v_servis, 'GIDER', 900.00, 'Sabit gider onaya-geri', 'SABIT_GIDER', 'ONAYLANDI',
     istanbul_today(), now(), v_kayit)
  returning id into v_islem_c1;

  insert into tekrar_kurallari (business_id, tur, tutar, baslik, siklik, next_run)
  values (v_servis, 'GIDER', 90.00, 'Onaya-geri tekrar test', 'AYLIK', istanbul_today())
  returning id into v_kayit2;
  insert into islemler
    (business_id, tur, tutar, baslik, kaynak, durum, islem_tarihi, onaylanma_tarihi, tekrar_kural_id)
  values
    (v_servis, 'GIDER', 90.00, 'Tekrar onaya-geri', 'MANUEL', 'ONAYLANDI',
     istanbul_today(), now(), v_kayit2)
  returning id into v_islem_c2;

  perform pg_temp.login(u_yonetici);
  begin
    perform islem_onaya_geri_gonder(v_islem_c1);
    raise exception 'FAIL: sabit gider işlemi onaya geri gönderilebildi (049)';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if; -- expected: Onay'dan geçmezler
  end;
  begin
    perform islem_onaya_geri_gonder(v_islem_c2);
    raise exception 'FAIL: tekrar işlemi onaya geri gönderilebildi (049)';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if; -- expected: Onay'dan geçmezler
  end;

  -- kontrol: normal onaylanmış MANUEL hâlâ geri gönderilebilir (gerileme kontrolü)
  perform pg_temp.logout();
  insert into islemler (business_id, tur, tutar, baslik, kaynak, durum, created_by, odeme_yontemi)
  values (v_servis, 'GIDER', 30.00, 'Normal onaya-geri', 'MANUEL', 'BEKLIYOR', u_muhasebe, 'NAKIT')
  returning id into v_islem_c1;
  perform pg_temp.login(u_yonetici);
  perform approve_islem(v_islem_c1, 'NAKIT');
  perform islem_onaya_geri_gonder(v_islem_c1);
  select durum::text into v_durum from islemler where id = v_islem_c1;
  if v_durum <> 'BEKLIYOR' then
    raise exception 'FAIL: normal onaylanmış MANUEL onaya geri gönderilemedi (%)', v_durum;
  end if;
  perform pg_temp.logout();
  raise notice 'PASS 31: onaya geri gönder — sabit gider/tekrar reddedilir, normal MANUEL geçer (049)';

  -- ═══ 32) 050: prim paketleri — yazma Yönetici, okuma finans; give_prim baslik ═══
  -- Yönetici ekler/günceller/siler; Muhasebe okur ama yazamaz (insert RAISE,
  -- update/delete sessizce 0 satır); Personel hiç göremez. give_prim baslik'i
  -- p_note'tan türetir (paket adları veya açıklama; boşsa "Prim").

  perform pg_temp.login(u_yonetici);
  insert into prim_paketleri (business_id, name, tutar)
  values (v_servis, 'Bayram Primi', 500.00) returning id into v_kayit;
  perform pg_temp.logout();

  perform pg_temp.login(u_muhasebe);
  select count(*) into n from prim_paketleri where id = v_kayit;
  if n <> 1 then raise exception 'FAIL: Muhasebe prim paketini okuyamadı (050)'; end if;
  begin
    insert into prim_paketleri (business_id, name, tutar) values (v_servis, 'Yetkisiz', 1.00);
    raise exception 'FAIL: Muhasebe prim paketi ekleyebildi (050)';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if; -- expected: WITH CHECK reddi
  end;
  -- update/delete RLS'te USING false → sessizce 0 satır (hata atmaz)
  update prim_paketleri set tutar = 999.00 where id = v_kayit;
  delete from prim_paketleri where id = v_kayit;
  perform pg_temp.logout();
  select count(*) into n from prim_paketleri where id = v_kayit and tutar = 500.00;
  if n <> 1 then
    raise exception 'FAIL: Muhasebe prim paketini değiştirebildi/silebildi (050)';
  end if;

  perform pg_temp.login(u_personel);
  select count(*) into n from prim_paketleri where business_id = v_servis;
  if n <> 0 then raise exception 'FAIL: Personel prim paketlerini görebiliyor (050)'; end if;
  perform pg_temp.logout();

  perform pg_temp.login(u_yonetici);
  update prim_paketleri set name = 'Bayram Primi 2', tutar = 600.00 where id = v_kayit;
  select count(*) into n from prim_paketleri
  where id = v_kayit and tutar = 600.00 and name = 'Bayram Primi 2';
  if n <> 1 then raise exception 'FAIL: Yönetici prim paketini güncelleyemedi (050)'; end if;

  -- give_prim baslik: açıklamadan türer, boşsa "Prim"e düşer
  select give_prim(u_personel, v_servis, 600.00, 'Bayram Primi 2') into v_islem_c1;
  select baslik into v_durum from islemler where id = v_islem_c1;
  if v_durum not like '%Bayram Primi 2' then
    raise exception 'FAIL: give_prim baslik açıklamadan türemedi (050): %', v_durum;
  end if;
  select give_prim(u_personel, v_servis, 100.00, '') into v_islem_c2;
  select baslik into v_durum from islemler where id = v_islem_c2;
  if v_durum not like '%Prim' then
    raise exception 'FAIL: give_prim boş notta "Prim"e düşmedi (050): %', v_durum;
  end if;

  delete from prim_paketleri where id = v_kayit;
  select count(*) into n from prim_paketleri where id = v_kayit;
  if n <> 0 then raise exception 'FAIL: Yönetici prim paketini silemedi (050)'; end if;
  perform pg_temp.logout();
  raise notice 'PASS 32: prim paketleri — yazma Yönetici / okuma finans / Personel görmez; give_prim baslik (050)';

  -- ═══ 33) 051: Kaydı elle tekrar Onay'a gönder — çift gelir YASAK ═══
  -- Yönetici-only; BEKLIYOR gelir varken NO-OP (yeni satır açılmaz); reddedilen
  -- gelir sonrası yeni BEKLIYOR açılır; onaylanmış gelir varken RED. Doğan gelir
  -- otomatik yolla (034) birebir aynı.

  perform pg_temp.login(u_muhasebe); -- kayıt oluşturmak finansın; tutar finansta korunur
  insert into kayitlar (business_id, plaka, musteri_adi, durum, tutar, created_by)
  values (v_servis, '34 TEKRAR', 'Tekrar Onay', 'TAMAMLANDI', 300.00, u_muhasebe)
  returning id into v_kayit;
  perform pg_temp.logout();

  -- TAMAMLANDI insert otomatik BEKLIYOR gelir doğurur (034 trigger)
  select count(*) into n from islemler where kayit_id = v_kayit;
  if n <> 1 then raise exception 'FAIL: TAMAMLANDI kayıt otomatik 1 gelir doğurmalı, got %', n; end if;
  select id into v_islem_c1 from islemler where kayit_id = v_kayit;
  select durum::text into v_durum from islemler where id = v_islem_c1;
  if v_durum <> 'BEKLIYOR' then raise exception 'FAIL: otomatik gelir BEKLIYOR olmalı, got %', v_durum; end if;

  -- yetki: Muhasebe çağıramaz (Onay Yönetici-only, 044/051)
  perform pg_temp.login(u_muhasebe);
  begin
    perform kayit_tekrar_onaya_gonder(v_kayit);
    raise exception 'FAIL: Muhasebe kaydı tekrar onaya gönderebildi (051)';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if; -- expected: yalnızca Yönetici
  end;
  perform pg_temp.logout();

  perform pg_temp.login(u_yonetici);
  -- BEKLIYOR gelir varken NO-OP: yeni satır AÇILMAZ (çift gelir yok)
  perform kayit_tekrar_onaya_gonder(v_kayit);
  select count(*) into n from islemler where kayit_id = v_kayit;
  if n <> 1 then
    raise exception 'FAIL: BEKLIYOR gelir varken tekrar gönderme çift satır açtı, got %', n;
  end if;

  -- reddet → aktif gelir kalmaz → tekrar gönderme yeni BEKLIYOR açar
  perform reject_islem(v_islem_c1);
  perform kayit_tekrar_onaya_gonder(v_kayit);
  select count(*) into n from islemler where kayit_id = v_kayit and durum = 'BEKLIYOR';
  if n <> 1 then
    raise exception 'FAIL: reddedilen gelir sonrası tam 1 BEKLIYOR olmalı, got %', n;
  end if;
  select count(*) into n from islemler where kayit_id = v_kayit; -- 1 REDDEDILDI + 1 yeni
  if n <> 2 then
    raise exception 'FAIL: kayıt gelir geçmişi 2 satır olmalı (1 red + 1 yeni), got %', n;
  end if;
  select id into v_islem_c2 from islemler where kayit_id = v_kayit and durum = 'BEKLIYOR';
  select tutar::text into v_durum from islemler where id = v_islem_c2;
  if v_durum <> '300.00' then
    raise exception 'FAIL: yeni gelir tutarı 300.00 olmalı (034 ile aynı), got %', v_durum;
  end if;

  -- onayla → onaylanmış gelir varken tekrar gönderme REDDEDİLİR (çift sayım yok)
  perform approve_islem(v_islem_c2, 'NAKIT');
  begin
    perform kayit_tekrar_onaya_gonder(v_kayit);
    raise exception 'FAIL: onaylanmış gelir varken tekrar onaya gönderilebildi (051)';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if; -- expected: Onaya Geri Gönder kullanılmalı
  end;
  select count(*) into n from islemler where kayit_id = v_kayit and durum = 'BEKLIYOR';
  if n <> 0 then
    raise exception 'FAIL: onaylanmış gelir varken yeni BEKLIYOR açıldı, got %', n;
  end if;
  perform pg_temp.logout();
  raise notice 'PASS 33: kaydı tekrar onaya gönder — Yönetici-only, BEKLIYOR NO-OP, red→yeni, onaylı→red (051)';

  raise notice '';
  raise notice '=== ALL TESTS PASSED (rolling back — no test data persists) ===';
end;
$$;

rollback;
