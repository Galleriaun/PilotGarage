-- ============================================================
-- PilotGarage — 046: İstekler yalnızca Yönetici (owner request 2026-07-21)
--
-- Avans / şikayet / öneri isteklerini artık yalnızca YONETICI görür ve
-- karara bağlar. Muhasebe onları hiç GÖRMEZ (görünürlük de yetki gibi
-- daraltılır — şikayetler personelin Muhasebe hakkında olabilir, listenin
-- Muhasebe'ye açık kalması özelliğin amacını bozar).
--
-- Personelin kendi tarafı DEĞİŞMEZ: istek oluşturma (`istekler_insert`) ve
-- "İsteklerim" ekranı (kendi satırları) aynen çalışır.
--
-- 044'teki dersin aynısı: ekranı gizlemek yetmez. Burada iki katman var —
-- SELECT politikası (Muhasebe satırları hiç çekemez) ve RPC yetkileri
-- (doğrudan çağırsa da karar veremez).
--
-- NOT: `approve_avans_istek` `give_avans`'ı çağırmaya devam eder; 045'ten
-- beri o da `BEKLIYOR` işlem doğurur, yani avans isteği onayı + Onay ekranı
-- olmak üzere iki adım — ikisi de artık aynı kişide (Yönetici) olduğu için
-- akış tutarlı.
-- ============================================================

-- ── Görünürlük: finans değil, Yönetici ──

drop policy istekler_select on public.istekler;

create policy istekler_select on public.istekler
  for select using (
    (profile_id = auth.uid() and public.auth_is_active())
    or (public.is_yonetici() and public.can_access_business(business_id))
  );

-- ── Kararlar: is_finance → is_yonetici (gövdeler 037'deki gibi) ──

-- DİKKAT: parametre adı `p_id` KALMALI — istemci `{ p_id: ... }` ile çağırıyor
-- ve `create or replace` zaten girdi parametresinin adını değiştirmeye izin
-- vermez. Gövdeler 037'deki gibi; yalnızca yetki satırları değişti.

create or replace function public.approve_avans_istek(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  r record;
  v_islem uuid;
begin
  select * into r from istekler where id = p_id for update;
  if not found then
    raise exception 'İstek bulunamadı.';
  end if;
  if not (is_yonetici() and can_access_business(r.business_id)) then
    raise exception 'İstek kararı yalnızca Yöneticiye aittir.';
  end if;
  if r.tur <> 'AVANS' then
    raise exception 'Bu bir avans isteği değil.';
  end if;
  if r.durum <> 'BEKLIYOR' then
    raise exception 'İstek zaten sonuçlandırılmış.';
  end if;

  -- Avans Ver ile birebir aynı yol (kendi yetki/tutar kontrolleri dahil)
  v_islem := give_avans(r.profile_id, r.business_id, r.tutar,
                        coalesce(nullif(trim(r.metin), ''), 'Avans isteği'));

  update istekler
  set durum = 'ONAYLANDI', islem_id = v_islem,
      karar_veren = auth.uid(), karar_tarihi = now()
  where id = p_id;

  perform log_audit('ISTEK_ONAY', 'istekler', p_id::text,
    jsonb_build_object('tutar', r.tutar, 'islem_id', v_islem));
  return v_islem;
end;
$$;

create or replace function public.reject_avans_istek(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  r record;
begin
  select * into r from istekler where id = p_id for update;
  if not found then
    raise exception 'İstek bulunamadı.';
  end if;
  if not (is_yonetici() and can_access_business(r.business_id)) then
    raise exception 'İstek kararı yalnızca Yöneticiye aittir.';
  end if;
  if r.tur <> 'AVANS' or r.durum <> 'BEKLIYOR' then
    raise exception 'İstek reddedilemez.';
  end if;

  update istekler
  set durum = 'REDDEDILDI', karar_veren = auth.uid(), karar_tarihi = now()
  where id = p_id;

  perform log_audit('ISTEK_RED', 'istekler', p_id::text,
    jsonb_build_object('tutar', r.tutar));
end;
$$;

create or replace function public.alindi_istek(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  r record;
begin
  select * into r from istekler where id = p_id for update;
  if not found then
    raise exception 'İstek bulunamadı.';
  end if;
  if not (is_yonetici() and can_access_business(r.business_id)) then
    raise exception 'İstek kararı yalnızca Yöneticiye aittir.';
  end if;
  if r.tur = 'AVANS' or r.durum <> 'BEKLIYOR' then
    raise exception 'İstek alındı olarak işaretlenemez.';
  end if;

  update istekler
  set durum = 'ALINDI', karar_veren = auth.uid(), karar_tarihi = now()
  where id = p_id;

  perform log_audit('ISTEK_ALINDI', 'istekler', p_id::text, '{}'::jsonb);
end;
$$;
