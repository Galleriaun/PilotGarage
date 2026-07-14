-- ============================================================
-- PilotGarage — 035: Müşteri telefon numarası (owner request 2026-07-13)
--
-- Kayıtlara isteğe bağlı müşteri cep numarası. Yalnızca ulusal kısım
-- saklanır ("5XXXXXXXXX", 10 hane) — +90 istemcide sabittir; DB check'i
-- yanlış formatı her yoldan reddeder. Kayıt Detay'daki telefon butonu
-- tel:+90… ile arama uygulamasını açar.
--
-- 028 kayitlar INSERT'i kolon-bazlı kısıtladığından yeni form kolonu
-- açıkça grant edilir (UPDATE grant'i de 013'ten beri kolon-bazlı).
-- ============================================================

alter table public.kayitlar
  add column musteri_tel text not null default ''
  check (musteri_tel = '' or musteri_tel ~ '^5[0-9]{9}$');

grant insert (musteri_tel) on public.kayitlar to authenticated;
grant update (musteri_tel) on public.kayitlar to authenticated;
