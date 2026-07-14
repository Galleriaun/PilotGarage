-- ============================================================
-- PilotGarage — 038: Avans isteği maaş sınırı (owner request 2026-07-14)
-- Avans isteği, personelin o işletmedeki maaşından büyük olamaz.
-- Maaş girilmemişse (0) sınır yok. Kural server-side trigger'da —
-- istemci doğrulaması yalnızca kullanıcı deneyimi içindir.
-- ============================================================

create or replace function public.istek_avans_siniri()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_maas numeric;
begin
  if new.tur = 'AVANS' then
    select maas into v_maas
    from business_members
    where profile_id = new.profile_id and business_id = new.business_id;
    if v_maas is not null and v_maas > 0 and new.tutar > v_maas then
      raise exception 'Avans isteği maaşınızdan büyük olamaz.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists istek_avans_siniri_bi on public.istekler;
create trigger istek_avans_siniri_bi
before insert on public.istekler
for each row execute function public.istek_avans_siniri();
