-- ============================================================
-- PilotGarage — 060: Mesai otomatik kapatma + kapanış hatırlatması
-- (owner request 2026-08-09)
--
-- MEVCUT AÇIK: personel çıkış yapmayı unutunca oturum SONSUZA DEK açık kalır.
--   1) Ertesi gün giriş yapamaz — 029'un alternation guard'ı "Zaten giriş
--      yaptınız" der. Günlük asıl semptom bu.
--   2) Rapor bozulur — personSessions oturumu "devam ediyor" gösterir ve
--      süresi saat toplamına HİÇ girmez (bir günlük emek 0 sayılır).
--   3) "Şu an mesaide" sessizce yanlışa döner — useMesaiAcikOturumlar yalnızca
--      3 gün geriye bakar, 4+ gün önce unutulan oturum listeden düşer ama
--      raporda hâlâ açıktır. api.ts'teki "nightly auto-close" yorumu bu işi
--      anlatıyordu; 030'da ERTELENMİŞTİ ve hiç yazılmadı. Bu migration onu
--      tamamlar.
--
-- KRİTİK KISIT (tasarımı bu belirledi): işyerinden ayrılmış personel ÇIKIŞ
-- YAPAMAZ — mesai_giris_cikis geofence dışını reddeder. Bu yüzden hatırlatma
-- eve gittikten sonra değil, KAPANIŞ SAATİNDE (kişi hâlâ oradayken) atılır.
--
-- Arka planda konum yoklaması yapılmıyor ve YAPILAMAZ: navigator.geolocation
-- Window context'inde tanımlıdır, ServiceWorkerGlobalScope'ta yoktur — uygulama
-- kapalıyken çalışabilen tek yerde konum okunamaz. Ayrıca yarıçap 300 m iken
-- sahada gözlenen kaba sabitlemeler 212 m sapıyordu; hata payı geofence ile
-- aynı mertebede olduğu için masasındaki personelin çıkışı yanlışlıkla yapılırdı.
--
-- OWNER KARARLARI:
--   • Otomatik çıkışın SAATİ    = işletmenin kapanış saati (işletme başına ayar)
--   • Otomatik kapatmanın ANI   = kapanış + 5 dakika (gece değil)
--   • Hatırlatma                = kapanış saatinde, yalnızca personele push
--   • Otomatik kapanan oturum   = saat toplamına GİRER, ama işaretlidir
--   • Gece vardiyası (haftalık) = ayrı ayar YOK; personel yeni bir giriş açar,
--                                 unutulan bitişi MAKSİMUM SÜRE kapatır
-- ============================================================

-- ── A. Enum + işletme ayarı ──
-- 030'un 'MANUEL' eklemesiyle aynı desen. Yeni enum değeri aynı transaction'da
-- KULLANILAMAZ (041/052 dersi) — literal yalnızca fonksiyon GÖVDELERİNDE geçer,
-- gövdeler burada çalıştırılmadığı için güvenli.

alter type public.mesai_kaynak add value if not exists 'OTOMATIK';

alter table public.businesses add column mesai_bitis_saati time;

comment on column public.businesses.mesai_bitis_saati is
  'İşletmenin kapanış saati. NULL = otomatik kapatma/hatırlatma o işletmede KAPALI.';

-- 029 konum kolonlarını böyle vermişti; bu ek satır additive.
-- Yetki kendiliğinden Yönetici-only: 047'nin businesses_update politikası
-- zaten is_yonetici() istiyor, kolon grant'ı tek başına yazma hakkı vermez.
grant update (mesai_bitis_saati) on public.businesses to authenticated;

-- ── B. Otomatik kapatma ──
--
-- İKİ KURAL, ikisi de her tikte değerlendirilir:
--
--   Kural 1 (kapanış):   BUGÜN başlamış ve girişi BUGÜNKÜ KAPANIŞTAN ÖNCE olan
--                        oturumlar, kapanış+5'ten sonraki ilk tikte →
--                        çıkış = bugünkü kapanış saati.
--
--   Kural 2 (maks süre): 14 saatten uzun süredir açık olan HER oturum →
--                        çıkış = giriş + 14 saat.
--
-- Kural 2 iki işi birden yapar: gece vardiyasının unutulan bitişini yakalar
-- (21:00 giriş → ertesi gün 11:00'de kapanır; gerçek 06:00'ya göre fazla ama
-- İŞARETLİ ve SIFIR DEĞİL) ve hiçbir oturumun 14 saatten uzun açık kalmamasını
-- garanti eder — ayrı bir "devreden oturum" backstop'una gerek bırakmaz.
--
-- 0 DAKİKALIK KAPATMA KURALI YOK ve gerekmiyor: Kural 1 yalnızca girişi
-- kapanıştan önce olanlarda çalışır (çıkış > giriş garanti), Kural 2'de zaten
-- giriş + 14s > giriş. İlk taslakta 0'a çökme vardı; gece vardiyası haftalık
-- olduğu için bu, düzenli olarak bir gecelik emeğin SİLİNMESİ demekti.
--
-- KURAL 1'İN ÜÇ KOŞULU DA GEREKLİ:
--   • v_now >= kapanış + 5dk  → eşik; kapalı pencere ((now-5dk, now]) DEĞİL.
--     Pencere kullanılsaydı bir tik gecikince o gün Kural 1 hiç çalışmaz,
--     oturum akşam 23:00'e (Kural 2) kalırdı. Eşik kendi kendini onarır:
--     kapattıktan sonra açık oturum kalmadığı için tekrar tetiklenmez.
--   • giriş >= bugünün başı   → eşik yüzünden ZORUNLU. Olmasaydı ilk kurulumda
--     duran ESKİ bir açık oturum BUGÜNKÜ kapanışla kapatılır, günlere yayılan
--     sahte bir oturum üretilirdi. Eskiyi Kural 2 kapatır.
--   • giriş <  bugünkü kapanış → hem çıkış > giriş garantisi, hem de:
--     kapanışta kapatılan kişi hâlâ çalışıyorsa TEKRAR GİRİŞ yapar (tasarlanan
--     kurtarma yolu) ve o yeni oturumun girişi kapanıştan sonradır — bu koşul
--     sayesinde Kural 1 onu anında tekrar kapatmaz. Gece vardiyasının
--     başlangıcı da aynı sebeple korunur.

create or replace function public.mesai_otomatik_kapat()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  -- Tek yerde tanımlı SABİT (işletme ayarı değil): gerekirse burada değişir.
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
begin
  -- Üst üste binen koşuları ELE. İki koşu aynı anda çalışırsa READ COMMITTED
  -- yüzünden ikisi de aynı AÇIK oturumu görür (karşı tarafın commit etmemiş
  -- INSERT'i görünmez) ve İKİ ÇIKIŞ satırı yazılır. try_ kullanılıyor: bekleyip
  -- kuyruk biriktirmek yerine bu tik atlanır — 5 dk sonra zaten tekrar koşacak.
  if not pg_try_advisory_xact_lock(hashtext('mesai_otomatik_kapat')) then
    return;
  end if;

  for b in
    select id, mesai_bitis_saati
    from businesses
    where mesai_bitis_saati is not null
  loop
    -- bugünün kapanış anı (Istanbul yerel saatini timestamptz'ye çevir)
    v_kapanis := (v_bugun + b.mesai_bitis_saati) at time zone 'Europe/Istanbul';

    -- açık oturum = kişi başına EN SON satır GİRİŞ olanlar
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

      if v_now >= v_kapanis + v_gecikme
         and s.created_at >= v_gun_basi
         and s.created_at <  v_kapanis then
        v_cikis := v_kapanis;
        v_kural := 'KAPANIS';
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

-- ── C. Kapanış hatırlatması ──
-- Kapanış saatinden sonraki ilk tikte, BUGÜN ve KAPANIŞTAN ÖNCE başlamış açık
-- oturumu olan herkese bildirim. "Kapanıştan önce başlamış" koşulu şart:
-- olmasaydı 20:00'de işe gelen gece vardiyası personeline 20:05'te "çıkış
-- yapmayı unuttunuz mu?" gönderilirdi.
--
-- Eşik + günlük dedupe birlikte kullanılır: tik kaçarsa bildirim yine gider,
-- ama günde bir kereden fazla gitmez.
--
-- Push kendiliğinden gider: 021'in database webhook'u notifications INSERT'inde
-- send-push'u tetikler ve oradaki `if (prefKey && prefs[prefKey] === false)`
-- eşlenmemiş tip için false döner. Görünürlük de hazır: 031/044'ün
-- notifications_select_own politikasının `else` dalı (can_access_business)
-- 'MESAI'yi kapsıyor — politika DEĞİŞMİYOR.

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
  -- Aşağıdaki "bugün bildirim gitti mi" kontrolü de yarışa açık: iki koşu
  -- birlikte bakarsa ikisi de "yok" görür ve kişi AYNI push'u iki kez alır.
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

    for s in
      select distinct on (m.profile_id)
             m.profile_id, m.tip, m.created_at
      from mesai_kayitlari m
      where m.business_id = b.id
      order by m.profile_id, m.created_at desc
    loop
      continue when s.tip <> 'GIRIS';
      -- bugün VE kapanıştan önce başlamış olsun (gece vardiyası hariç kalır)
      continue when s.created_at < v_gun_basi;
      continue when s.created_at >= v_kapanis;
      -- devre dışı hesaba bildirim üretme (auth_is_active zaten görmesini engeller)
      continue when not exists (
        select 1 from profiles p
        where p.id = s.profile_id and p.status = 'ACTIVE'
      );
      -- aynı gün ikinci kez gönderme
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

-- ── D. Yetki: iki fonksiyon da yalnızca cron'a ait ──
-- İkisinde de is_finance guard'ı YOK ve OLAMAZ (cron'da auth.uid() null'dır,
-- guard her tikte patlardı — 057'nin avans_borcu ile aynı durumu). Guard yoksa
-- TEK KORUMA GRANT'tır. 058 dersi: PostgreSQL yeni fonksiyonlara EXECUTE'u
-- PUBLIC'e verir ve `authenticated` PUBLIC üyesidir → `from anon, authenticated`
-- TEK BAŞINA hiçbir şey kapatmaz, `from public` ŞART. Aksi hâlde herhangi bir
-- personel kapatmayı elle tetikleyip mesaisini istediği saatte bitirebilirdi.
--
-- `create or replace` mevcut ACL'i korur (drop+create sıfırlar), bu yüzden
-- revoke'lar tanımlardan SONRA gelir ve gövde ileride değişse de yerinde kalır.

revoke all on function public.mesai_otomatik_kapat() from public;
revoke all on function public.mesai_otomatik_kapat() from anon, authenticated;
revoke all on function public.mesai_hatirlatma() from public;
revoke all on function public.mesai_hatirlatma() from anon, authenticated;

do $$
begin
  if has_function_privilege('authenticated', 'public.mesai_otomatik_kapat()', 'execute') then
    raise exception '060: mesai_otomatik_kapat hâlâ authenticated tarafından çağrılabiliyor.';
  end if;
  if has_function_privilege('authenticated', 'public.mesai_hatirlatma()', 'execute') then
    raise exception '060: mesai_hatirlatma hâlâ authenticated tarafından çağrılabiliyor.';
  end if;
end;
$$;

-- ── E. Cron: iki iş, ikisi de 5 dakikada bir ──
-- NEDEN */5 ve NEDEN */15 YETMEZ: kapanış seçici 30 dakikalık dilimler üretir
-- (:00 / :30), dolayısıyla kapanış+5 hep :05 veya :35'e düşer. Mevcut */15 işi
-- (:00/:15/:30/:45) 19:05'i ıskalar. Mevcut pilotgarage-daily / -saat işlerine
-- EKLENMEZ: biri para üretiyor (059 onu yeni kilitledi), diğeri kayıt durumu
-- ilerletiyor.

select cron.unschedule('pilotgarage-mesai-hatirlatma')
where exists (select 1 from cron.job where jobname = 'pilotgarage-mesai-hatirlatma');

select cron.schedule(
  'pilotgarage-mesai-hatirlatma',
  '*/5 * * * *',
  $$select public.mesai_hatirlatma()$$
);

select cron.unschedule('pilotgarage-mesai-kapat')
where exists (select 1 from cron.job where jobname = 'pilotgarage-mesai-kapat');

select cron.schedule(
  'pilotgarage-mesai-kapat',
  '*/5 * * * *',
  $$select public.mesai_otomatik_kapat()$$
);

-- Güvenlik ağı: revoke bu işleri KIRMASIN. Fonksiyon sahibi (SECURITY DEFINER)
-- yetkisini grant'lardan bağımsız korur, ama job başka bir rolle kurulduysa
-- bunu BURADA görmek gerekir — yoksa hata ilk kez sahada, sessizce ortaya
-- çıkardı. Bu blok yalnızca bir ağ: pg_cron katalog şekli sürüme göre
-- değişirse migration'ı düşürmez, uyarı verir.
do $$
declare
  j record;
begin
  if to_regclass('cron.job') is null then
    raise notice '060: pg_cron kurulu değil — cron rol kontrolü atlandı.';
  else
    for j in
      select jobname, username from cron.job
      where jobname in ('pilotgarage-mesai-kapat', 'pilotgarage-mesai-hatirlatma')
    loop
      if j.jobname = 'pilotgarage-mesai-kapat'
         and not has_function_privilege(j.username, 'public.mesai_otomatik_kapat()', 'execute') then
        raise exception '060: cron rolü (%) mesai_otomatik_kapat''ı çalıştıramıyor.', j.username;
      end if;
      if j.jobname = 'pilotgarage-mesai-hatirlatma'
         and not has_function_privilege(j.username, 'public.mesai_hatirlatma()', 'execute') then
        raise exception '060: cron rolü (%) mesai_hatirlatma''yı çalıştıramıyor.', j.username;
      end if;
    end loop;
  end if;
exception
  when others then
    -- Kendi raise'lerimiz YUTULMAZ: aşağıdaki satır onları yeniden fırlatır.
    if sqlerrm like '060:%' then raise; end if;
    raise notice '060: cron rol kontrolü yapılamadı (%) — işleri elle doğrulayın.', sqlerrm;
end;
$$;
