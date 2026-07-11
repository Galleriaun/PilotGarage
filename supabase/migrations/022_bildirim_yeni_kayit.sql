-- ============================================================
-- PilotGarage — 022: Yeni kayıt bildirimi (owner request 2026-07-11)
-- A newly created kayıt notifies the business's finance staff (minus the
-- creator); the body carries who created it. Rides the notifications
-- pipeline (018) — the push webhook picks it up automatically.
-- (Safe to re-run: trigger is dropped first.)
-- ============================================================

create or replace function public.notif_yeni_kayit()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_creator text;
begin
  select full_name into v_creator from profiles where id = new.created_by;
  perform notify_finance(new.business_id, 'KAYIT', 'Yeni kayıt oluşturuldu',
    new.plaka
      || case when new.musteri_adi <> '' then ' — ' || new.musteri_adi else '' end
      || ' • ' || coalesce(nullif(v_creator, ''), 'Bilinmiyor'),
    '/kayit/' || new.id, new.created_by);
  return new;
end;
$$;

drop trigger if exists notif_yeni_kayit on public.kayitlar;
create trigger notif_yeni_kayit after insert on public.kayitlar
for each row execute function public.notif_yeni_kayit();
