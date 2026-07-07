-- ============================================================
-- PilotGarage — 004: Scheduled jobs
-- Prerequisite: pg_cron enabled in Database -> Extensions.
-- pg_cron runs in UTC; Turkey is UTC+3 year-round (no DST since 2016),
-- so 21:05 UTC = 00:05 Istanbul.
-- ============================================================

select cron.unschedule('pilotgarage-daily')
where exists (select 1 from cron.job where jobname = 'pilotgarage-daily');

select cron.schedule(
  'pilotgarage-daily',
  '5 21 * * *',
  $$select public.run_daily_materializer()$$
);
