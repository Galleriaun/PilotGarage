-- ============================================================
-- PilotGarage — 020: Kayıt başlangıç/bitiş saati (owner request 2026-07-11)
-- Optional 30-minute slots (09:00–21:00) on a kayıt. A quarter-hourly cron
-- moves durum forward automatically on the kayıt's tarih:
--   BEKLENEN -> AKTIF      when başlangıç saati arrives
--   BEKLENEN/AKTIF -> TAMAMLANDI when bitiş saati passes (fires the normal
--   gelir trigger — the paket price lands in Onay as usual, creator "Otomatik")
-- Manual durum changes are respected: only the expected "previous" states
-- are advanced; the cron never moves a durum backwards.
-- ============================================================

alter table public.kayitlar
  add column baslangic_saati time,
  add column bitis_saati time,
  add constraint kayitlar_saat_chk check (
    baslangic_saati is null or bitis_saati is null
    or bitis_saati > baslangic_saati
  );

-- 013 made kayitlar column grants explicit — the new columns are client-editable
grant update (baslangic_saati, bitis_saati) on public.kayitlar to authenticated;

create or replace function public.run_saat_transitions()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  now_ist timestamp := now() at time zone 'Europe/Istanbul';
  d date := now_ist::date;
  t time := now_ist::time;
begin
  update kayitlar
  set durum = 'AKTIF'
  where durum = 'BEKLENEN'
    and tarih = d
    and baslangic_saati is not null and baslangic_saati <= t
    and (bitis_saati is null or bitis_saati > t);

  update kayitlar
  set durum = 'TAMAMLANDI'
  where durum in ('BEKLENEN', 'AKTIF')
    and bitis_saati is not null
    and (tarih < d or (tarih = d and bitis_saati <= t));
end;
$$;

select cron.schedule(
  'pilotgarage-saat',
  '*/15 * * * *',
  $$select public.run_saat_transitions()$$
);
