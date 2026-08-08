-- ============================================================
-- PilotGarage — 058: `avans_borcu` gerçekten istemciye kapatılır (057 düzeltmesi)
--
-- 057 şunu yazıyordu:
--   revoke execute on function public.avans_borcu(uuid, uuid) from anon, authenticated;
-- ve YETMİYORDU. PostgreSQL yeni fonksiyonlara EXECUTE'u **PUBLIC**'e verir;
-- `authenticated` de PUBLIC üyesi olduğu için yetki o yoldan duruyordu.
-- Supabase'in default privilege'ları ayrıca anon/authenticated'a verir — 057
-- yalnızca onları geri aldı, asıl PUBLIC grant'ı yerinde kaldı.
--
-- Smoke test PASS 38 (a) bunu yakaladı:
--   FAIL: avans_borcu authenticated rolünden çağrılabildi (057)
-- Yani gerçek bir açıktı: personelin avans borcu herkese okunabiliyordu.
--
-- 057 DEĞİŞTİRİLMEZ (uygulanmış migration'a dokunulmaz) — 055'in 054'ü,
-- 056'nın 054'ü düzelttiği desenin aynısı.
--
-- pay_maas ve run_daily_materializer ETKİLENMEZ: ikisi de SECURITY DEFINER
-- ve fonksiyonun sahibi, PUBLIC grant'ından bağımsız olarak yetkisini korur.
-- İstemci borcu zaten kendi okuduğu satırlardan hesaplıyor (features/yonetim/avans.ts).
-- ============================================================

revoke all on function public.avans_borcu(uuid, uuid) from public;
revoke all on function public.avans_borcu(uuid, uuid) from anon, authenticated;

-- Güvenlik ağı: revoke tutmadıysa migration burada durur, sessizce açık kalmaz.
do $$
begin
  if has_function_privilege('authenticated', 'public.avans_borcu(uuid,uuid)', 'execute') then
    raise exception '058: avans_borcu hâlâ authenticated tarafından çağrılabiliyor — grant zinciri kontrol edilmeli.';
  end if;
end;
$$;
