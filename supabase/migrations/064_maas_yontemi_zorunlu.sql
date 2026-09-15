-- ============================================================
-- PilotGarage — 064: Maaş ödeme yöntemi zorunlu (seçilmemiş = Kredi Kartı)
-- ============================================================

alter table public.business_members
  alter column odeme_yontemi set default 'KREDI_KARTI';

do $$
declare
  n int;
begin
  update public.business_members
  set odeme_yontemi = 'KREDI_KARTI'
  where odeme_yontemi is null;
  get diagnostics n = row_count;

  perform public.log_audit('MAAS_YONTEMI_VARSAYILAN', 'business_members', 'toplu',
    jsonb_build_object('guncellenen', n, 'odeme_yontemi', 'KREDI_KARTI'));
  raise notice '064: % üyeliğin maaş ödeme yöntemi Kredi Kartı yapıldı', n;
end $$;

alter table public.business_members
  alter column odeme_yontemi set not null;

comment on column public.business_members.odeme_yontemi is
  'Maaşın kasa kovası; pay_maas ve cron otomatik maaşı buradan okur. Zorunlu (064), varsayılan KREDI_KARTI.';

create or replace function public.update_member_pay(
  p_profile uuid, p_business uuid, p_maas numeric, p_odeme_gunu int,
  p_yontem public.odeme_yontemi default null
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not (is_yonetici() and can_access_business(p_business)) then
    raise exception 'Maaş bilgisini güncelleme yetkisi yalnızca Yöneticidedir.';
  end if;
  if p_maas is null or p_maas < 0 or p_maas <> round(p_maas, 2) then
    raise exception 'Geçersiz maaş.';
  end if;
  if p_odeme_gunu is null or p_odeme_gunu not between 0 and 28 then
    raise exception 'Geçersiz ödeme günü (0–28).';
  end if;
  if p_yontem is null then
    raise exception 'Maaş ödeme yöntemi seçilmeli.';
  end if;

  update business_members
  set maas = p_maas, odeme_gunu = p_odeme_gunu, odeme_yontemi = p_yontem
  where profile_id = p_profile and business_id = p_business;
  if not found then
    raise exception 'Üyelik bulunamadı.';
  end if;

  perform log_audit('UPDATE_PAY', 'business_members', p_profile::text,
    jsonb_build_object('business_id', p_business, 'maas', p_maas,
                       'odeme_gunu', p_odeme_gunu, 'odeme_yontemi', p_yontem));
end;
$$;
