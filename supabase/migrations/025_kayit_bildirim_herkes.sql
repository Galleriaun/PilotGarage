-- ============================================================
-- PilotGarage — 025: Yeni kayıt bildirimi herkese (owner, 2026-07-11)
-- The new-kayıt notification now goes to ALL active staff of the business
-- (Personel included — kayıts are their screen), still minus the creator.
-- Same function name, so the existing trigger keeps working.
-- ============================================================

create or replace function public.notif_yeni_kayit()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_creator text;
begin
  select full_name into v_creator from profiles where id = new.created_by;
  insert into notifications (profile_id, business_id, type, baslik, body, link)
  select bm.profile_id, new.business_id, 'KAYIT', 'Yeni kayıt oluşturuldu',
         new.plaka
           || case when new.musteri_adi <> '' then ' — ' || new.musteri_adi else '' end
           || ' • ' || coalesce(nullif(v_creator, ''), 'Bilinmiyor'),
         '/kayit/' || new.id
  from business_members bm
  join profiles p on p.id = bm.profile_id
  where bm.business_id = new.business_id
    and p.status = 'ACTIVE'
    and (new.created_by is null or bm.profile_id <> new.created_by);
  return new;
end;
$$;
