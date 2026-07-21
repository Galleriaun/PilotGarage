-- ============================================================
-- PilotGarage — 047: İşletme Ayarları yalnızca Yönetici (owner request 2026-07-21)
--
-- İşletme Ayarları ekranının tüm YAZMA yüzeyi Muhasebe'den alınır:
--   * businesses UPDATE — işletme adı/telefon/adres (003 grant'i) ve mesai
--     konumu + ofis IP'leri (029 kolonları) aynı politikadan geçer;
--   * kategoriler INSERT / UPDATE — kategori ekleme ve pasifleştirme
--     (soft delete `is_active = false` bir UPDATE'tir).
--
-- Ekranı gizlemek tek başına güvenlik değildir (044 dersi) — asıl sınır bu
-- politikalardır; istemci tarafında rota `RequireRole ['YONETICI']` altına
-- alınır ve FinansMenu öğesi Muhasebe'de gizlenir.
--
-- OKUMALAR DEĞİŞMEZ:
--   * kategoriler_select `is_finance` kalır — Muhasebe'nin Gelir/Gider Ekle
--     kategori seçicisi, Onay kartları ve raporlar okumaya devam eder;
--   * businesses_select `can_access_business` kalır — İşletme Seç herkese
--     lazım, mesai konum okuma da buradan geçer.
-- ============================================================

alter policy businesses_update on public.businesses
  using (public.is_yonetici() and public.can_access_business(id))
  with check (public.is_yonetici() and public.can_access_business(id));

alter policy kategoriler_insert on public.kategoriler
  with check (public.is_yonetici() and public.can_access_business(business_id));

alter policy kategoriler_update on public.kategoriler
  using (public.is_yonetici() and public.can_access_business(business_id))
  with check (public.is_yonetici() and public.can_access_business(business_id));
