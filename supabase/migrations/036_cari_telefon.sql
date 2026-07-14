-- ============================================================
-- PilotGarage — 036: Cari işletme telefonu (owner request 2026-07-13)
--
-- Cari işletmelere isteğe bağlı telefon. Kayıt müşteri telefonundan (035)
-- farkı: sabit hatlar da girilebilsin diye "5 ile başlar" kuralı yok —
-- +90'dan sonra 0 ile başlamayan 10 hane. İşletme Detay başlığında
-- biçimli numara + tel:+90… arama butonu.
-- (cari_isletmeler grant'leri tablo-bazlı — ek grant gerekmez.)
-- ============================================================

alter table public.cari_isletmeler
  add column telefon text not null default ''
  check (telefon = '' or telefon ~ '^[1-9][0-9]{9}$');
