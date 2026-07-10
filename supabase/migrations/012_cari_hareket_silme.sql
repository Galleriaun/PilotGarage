-- ============================================================
-- PilotGarage — 012: Cari hareket silme (owner request 2026-07-09)
--
-- Finance staff can delete a cari hareket ONLY while it has never been
-- sent toward the kasa (kasa_durumu = 'YOK') — the same typo escape
-- hatch işlemler have for BEKLIYOR rows. A hareket that is waiting for
-- Onay or already yansıdı is finance history and stays undeletable.
--
-- A rejected işlem that once pointed at the deleted hareket keeps its
-- immutable row (islemler.cari_hareket_id is ON DELETE SET NULL).
-- ============================================================

create policy cari_hareket_delete on public.cari_hareketler
  for delete using (
    kasa_durumu = 'YOK'
    and exists (select 1 from public.cari_isletmeler ci
                where ci.id = cari_isletme_id and public.is_finance(ci.business_id))
  );
