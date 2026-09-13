-- ============================================================
-- PilotGarage — 062: Gece bitiş saati ayarı kaldırıldı → gece mesaisi sabit 6 saat
-- ============================================================

create or replace function public.mesai_otomatik_kapat()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_gece     interval := interval '6 hours';
  v_max      interval := interval '14 hours';
  v_gecikme  interval := interval '5 minutes';
  v_gunduz_bas constant time := time '06:00';  -- mesai_hatirlatma'daki ile AYNI olmalı
  v_now      timestamptz := now();
  v_bugun    date := (now() at time zone 'Europe/Istanbul')::date;
  v_gun_basi timestamptz := (v_bugun::timestamp) at time zone 'Europe/Istanbul';
  b          record;
  s          record;
  v_kapanis  timestamptz;
  v_cikis    timestamptz;
  v_kural    text;
  v_giris_saat time;
  v_gece_bitis time;
  v_gunduz     boolean;
begin
  -- try_: üst üste binen iki tik aynı açık oturuma iki çıkış yazmasın
  if not pg_try_advisory_xact_lock(hashtext('mesai_otomatik_kapat')) then
    return;
  end if;

  for b in
    select id, mesai_bitis_saati
    from businesses
    where mesai_bitis_saati is not null
  loop
    v_kapanis := (v_bugun + b.mesai_bitis_saati) at time zone 'Europe/Istanbul';

    -- kapanış <= 06:00 ise gündüz penceresi boşalmasın
    v_gece_bitis := case when b.mesai_bitis_saati > v_gunduz_bas
                         then v_gunduz_bas else time '00:00' end;

    for s in
      select distinct on (m.profile_id)
             m.profile_id, m.tip, m.created_at
      from mesai_kayitlari m
      where m.business_id = b.id
      order by m.profile_id, m.created_at desc
    loop
      continue when s.tip <> 'GIRIS';

      v_cikis := null;
      v_kural := null;
      v_giris_saat := (s.created_at at time zone 'Europe/Istanbul')::time;
      v_gunduz := v_giris_saat >= v_gece_bitis
                  and v_giris_saat < b.mesai_bitis_saati;

      if v_gunduz and s.created_at >= v_gun_basi and s.created_at < v_kapanis then
        -- tavan YOK (elsif): vakti gelmemiş gündüz oturumu 14 saatte kesilmesin
        if v_now >= v_kapanis + v_gecikme then
          v_cikis := v_kapanis;
          v_kural := 'KAPANIS';
        end if;

      elsif not v_gunduz and s.created_at + v_gece <= v_now then
        v_cikis := s.created_at + v_gece;
        v_kural := 'GECE';

      -- SİLİNMEZ: önceki günden kalmış gündüz oturumunun tek kapatıcısı
      elsif s.created_at + v_max <= v_now then
        v_cikis := s.created_at + v_max;
        v_kural := 'MAKS_SURE';
      end if;

      continue when v_cikis is null;

      insert into mesai_kayitlari
        (profile_id, business_id, tip, kaynak, mesafe_m, lat, lng, ip, created_at)
      values (s.profile_id, b.id, 'CIKIS', 'OTOMATIK', null, null, null, '', v_cikis);

      perform log_audit('MESAI_OTOMATIK_KAPAT', 'mesai_kayitlari',
        s.profile_id::text,
        jsonb_build_object('business', b.id, 'giris', s.created_at,
                           'cikis', v_cikis, 'kural', v_kural));
    end loop;
  end loop;
end;
$$;

create or replace function public.mesai_hatirlatma()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_gunduz_bas constant time := time '06:00';  -- mesai_otomatik_kapat'taki ile AYNI olmalı
  v_now      timestamptz := now();
  v_bugun    date := (now() at time zone 'Europe/Istanbul')::date;
  v_gun_basi timestamptz := (v_bugun::timestamp) at time zone 'Europe/Istanbul';
  b          record;
  s          record;
  v_kapanis  timestamptz;
  v_gece_bitis time;
begin
  if not pg_try_advisory_xact_lock(hashtext('mesai_hatirlatma')) then
    return;
  end if;

  for b in
    select id, mesai_bitis_saati
    from businesses
    where mesai_bitis_saati is not null
  loop
    v_kapanis := (v_bugun + b.mesai_bitis_saati) at time zone 'Europe/Istanbul';
    continue when v_now < v_kapanis;
    v_gece_bitis := case when b.mesai_bitis_saati > v_gunduz_bas
                         then v_gunduz_bas else time '00:00' end;

    for s in
      select distinct on (m.profile_id)
             m.profile_id, m.tip, m.created_at
      from mesai_kayitlari m
      where m.business_id = b.id
      order by m.profile_id, m.created_at desc
    loop
      continue when s.tip <> 'GIRIS';
      continue when s.created_at < v_gun_basi;
      continue when s.created_at >= v_kapanis;
      continue when (s.created_at at time zone 'Europe/Istanbul')::time < v_gece_bitis;
      continue when not exists (
        select 1 from profiles p
        where p.id = s.profile_id and p.status = 'ACTIVE'
      );
      continue when exists (
        select 1 from notifications n
        where n.profile_id = s.profile_id
          and n.business_id = b.id
          and n.type = 'MESAI'
          and n.created_at >= v_gun_basi
      );

      insert into notifications (profile_id, business_id, type, baslik, body, link)
      values (s.profile_id, b.id, 'MESAI', 'Çıkış yapmayı unuttunuz mu?',
              'Mesainiz hâlâ açık görünüyor. İşten ayrıldıysanız çıkış yapın.',
              '/mesai');
    end loop;
  end loop;
end;
$$;

-- kolon ancak fonksiyonlar onsuz yeniden yaratıldıktan SONRA düşer
alter table public.businesses drop constraint if exists businesses_gece_bitis_check;
alter table public.businesses drop column if exists mesai_gece_bitis_saati;

-- `from public` ŞART (058): yalnızca anon/authenticated'dan almak hiçbir şey kapatmaz
revoke all on function public.mesai_otomatik_kapat() from public;
revoke all on function public.mesai_otomatik_kapat() from anon, authenticated;
revoke all on function public.mesai_hatirlatma() from public;
revoke all on function public.mesai_hatirlatma() from anon, authenticated;

do $$
begin
  if has_function_privilege('authenticated', 'public.mesai_otomatik_kapat()', 'execute') then
    raise exception '062: mesai_otomatik_kapat hâlâ authenticated tarafından çağrılabiliyor.';
  end if;
  if has_function_privilege('authenticated', 'public.mesai_hatirlatma()', 'execute') then
    raise exception '062: mesai_hatirlatma hâlâ authenticated tarafından çağrılabiliyor.';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'businesses'
               and column_name = 'mesai_gece_bitis_saati') then
    raise exception '062: mesai_gece_bitis_saati kolonu hâlâ duruyor.';
  end if;
end;
$$;
