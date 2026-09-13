-- ============================================================
-- PilotGarage — 061: Mesai gece vardiyası bitiş saati
-- ============================================================

alter table public.businesses add column mesai_gece_bitis_saati time;

comment on column public.businesses.mesai_gece_bitis_saati is
  'Gece vardiyasının bittiği saat (sabaha karşı). NULL = gece kavramı kapalı; unutulan oturumlar 060''ın 14 saatlik tavanıyla kapanır.';

-- gece_bitis < kapanis ŞART: tersi iki pencereyi bindirir ve Kural 1 sessizce ölür
alter table public.businesses add constraint businesses_gece_bitis_check
  check (mesai_gece_bitis_saati is null
         or mesai_bitis_saati is null
         or mesai_gece_bitis_saati < mesai_bitis_saati);

-- kolon grant'ı tek başına yazma hakkı vermez; asıl sınır 047'nin businesses_update politikası
grant update (mesai_gece_bitis_saati) on public.businesses to authenticated;

create or replace function public.mesai_otomatik_kapat()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_max      interval := interval '14 hours';
  v_gecikme  interval := interval '5 minutes';
  v_now      timestamptz := now();
  v_bugun    date := (now() at time zone 'Europe/Istanbul')::date;
  v_gun_basi timestamptz := (v_bugun::timestamp) at time zone 'Europe/Istanbul';
  b          record;
  s          record;
  v_kapanis  timestamptz;
  v_cikis    timestamptz;
  v_kural    text;
  v_giris_gun  date;
  v_giris_saat time;
  v_gece       timestamptz;
begin
  -- try_: üst üste binen iki tik aynı açık oturuma iki çıkış yazmasın
  if not pg_try_advisory_xact_lock(hashtext('mesai_otomatik_kapat')) then
    return;
  end if;

  for b in
    select id, mesai_bitis_saati, mesai_gece_bitis_saati
    from businesses
    where mesai_bitis_saati is not null
  loop
    v_kapanis := (v_bugun + b.mesai_bitis_saati) at time zone 'Europe/Istanbul';

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
      v_giris_gun  := (s.created_at at time zone 'Europe/Istanbul')::date;
      v_giris_saat := (s.created_at at time zone 'Europe/Istanbul')::time;

      if v_now >= v_kapanis + v_gecikme
         and s.created_at >= v_gun_basi
         and s.created_at <  v_kapanis
         and (b.mesai_gece_bitis_saati is null
              or v_giris_saat >= b.mesai_gece_bitis_saati) then
        v_cikis := v_kapanis;
        v_kural := 'KAPANIS';

      elsif b.mesai_gece_bitis_saati is not null
            and (v_giris_saat >= b.mesai_bitis_saati
                 or v_giris_saat <  b.mesai_gece_bitis_saati) then
        v_gece := (v_giris_gun + b.mesai_gece_bitis_saati) at time zone 'Europe/Istanbul';
        if v_gece <= s.created_at then
          v_gece := ((v_giris_gun + 1) + b.mesai_gece_bitis_saati) at time zone 'Europe/Istanbul';
        end if;
        -- vakti gelmediyse açık kalır; tavana düşmemesini elsif sağlar
        if v_now >= v_gece then
          v_cikis := v_gece;
          v_kural := 'GECE_BITIS';
        end if;

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
  v_now      timestamptz := now();
  v_bugun    date := (now() at time zone 'Europe/Istanbul')::date;
  v_gun_basi timestamptz := (v_bugun::timestamp) at time zone 'Europe/Istanbul';
  b          record;
  s          record;
  v_kapanis  timestamptz;
begin
  if not pg_try_advisory_xact_lock(hashtext('mesai_hatirlatma')) then
    return;
  end if;

  for b in
    select id, mesai_bitis_saati, mesai_gece_bitis_saati
    from businesses
    where mesai_bitis_saati is not null
  loop
    v_kapanis := (v_bugun + b.mesai_bitis_saati) at time zone 'Europe/Istanbul';
    continue when v_now < v_kapanis;

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
      continue when b.mesai_gece_bitis_saati is not null
                and (s.created_at at time zone 'Europe/Istanbul')::time
                    < b.mesai_gece_bitis_saati;
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

-- `from public` ŞART (058): yalnızca anon/authenticated'dan almak hiçbir şey kapatmaz
revoke all on function public.mesai_otomatik_kapat() from public;
revoke all on function public.mesai_otomatik_kapat() from anon, authenticated;
revoke all on function public.mesai_hatirlatma() from public;
revoke all on function public.mesai_hatirlatma() from anon, authenticated;

do $$
begin
  if has_function_privilege('authenticated', 'public.mesai_otomatik_kapat()', 'execute') then
    raise exception '061: mesai_otomatik_kapat hâlâ authenticated tarafından çağrılabiliyor.';
  end if;
  if has_function_privilege('authenticated', 'public.mesai_hatirlatma()', 'execute') then
    raise exception '061: mesai_hatirlatma hâlâ authenticated tarafından çağrılabiliyor.';
  end if;
end;
$$;
