-- ============================================================
-- PilotGarage — 006: Kayıt notları
-- The design's Kayıt Detay / Yeni Kayıt screens include a NOTLAR
-- field that was missing from the original schema.
-- ============================================================

alter table public.kayitlar
  add column notlar text not null default '';
