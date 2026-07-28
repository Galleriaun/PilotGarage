-- ============================================================
-- PilotGarage — 056: Avans/prim ödeme yöntemi ZORUNLU (owner request 2026-07-29)
--
-- 054'te avans/prim yöntemi opsiyoneldi (boşsa Yönetici Onay'da seçerdi).
-- Owner kararı: yöntem OLUŞTURURKEN seçilsin. Onay'da Yönetici ya olduğu
-- gibi onaylar ya da değiştirir — Onay'daki seçici PERSONEL kaynağında
-- zaten hep açık (054), yani "değiştirebilme" tarafı için değişiklik yok.
--
-- Sınır sunucuda: istemci doğrulaması tek başına güvenlik değil (044 dersi).
--
-- give_avans/give_prim İMZASI DEĞİŞMEZ (p_yontem 054'te eklendi, default
-- null kalır) → drop gerekmez, yalnızca gövdeye null kontrolü girer.
-- Default'u kaldırmıyoruz: kaldırılsaydı imza değişir, aşırı yükleme riski
-- doğar ve hata mesajı "function does not exist" gibi anlamsız olurdu;
-- açık Türkçe RAISE çok daha iyi.
--
-- approve_avans_istek İMZASI DEĞİŞİR: personelin avans isteğini onaylamak
-- da bir avans OLUŞTURMAKTIR, dolayısıyla orada da yöntem sorulur. Eski
-- 1 argümanlı imza düşürülür (033/054/055 ile aynı aşırı-yükleme gerekçesi).
-- ============================================================

-- ── A. give_avans: yöntem zorunlu ──
-- Gövde 054'ten birebir; tek fark baştaki kontrol.

create or replace function public.give_avans(
  p_profile uuid, p_business uuid, p_tutar numeric, p_note text default '',
  p_yontem public.odeme_yontemi default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
  v_kategori uuid;
  v_islem uuid;
begin
  if not is_finance(p_business) then
    raise exception 'Avans verme yetkiniz yok.';
  end if;
  -- 056: yöntem oluştururken zorunlu (Onay'da yalnızca değiştirilir)
  if p_yontem is null then
    raise exception 'Avans için ödeme yöntemi (Nakit / Kredi Kartı / Havale) seçilmelidir.';
  end if;
  if p_tutar is null or p_tutar <= 0 then
    raise exception 'Tutar 0''dan büyük olmalı.';
  end if;
  if p_tutar <> round(p_tutar, 2) then
    raise exception 'Tutar en fazla 2 ondalık basamak içerebilir.';
  end if;
  if not exists (select 1 from business_members
                 where profile_id = p_profile and business_id = p_business) then
    raise exception 'Personel bu işletmede kayıtlı değil.';
  end if;

  select full_name into v_name from profiles where id = p_profile;
  select id into v_kategori
  from kategoriler
  where business_id = p_business and tur = 'GIDER'
    and label = 'Personel Maaşı' and is_active
  limit 1;

  -- 045: Onay'a düşer (onaylayan/onaylanma_tarihi boş)
  insert into islemler
    (business_id, tur, tutar, baslik, kategori_id, kaynak, durum,
     islem_tarihi, created_by, odeme_yontemi)
  values
    (p_business, 'GIDER', p_tutar, v_name || ' — Avans', v_kategori, 'PERSONEL',
     'BEKLIYOR', istanbul_today(), auth.uid(), p_yontem)
  returning id into v_islem;

  insert into personel_odemeler (profile_id, business_id, tur, tutar, note, islem_id, created_by)
  values (p_profile, p_business, 'AVANS', p_tutar, coalesce(p_note, ''), v_islem, auth.uid());

  perform log_audit('AVANS', 'personel_odemeler', p_profile::text,
    jsonb_build_object('tutar', p_tutar, 'islem_id', v_islem, 'durum', 'BEKLIYOR'));
  return v_islem;
end;
$$;

-- ── B. give_prim: yöntem zorunlu ──

create or replace function public.give_prim(
  p_profile uuid, p_business uuid, p_tutar numeric, p_note text default '',
  p_yontem public.odeme_yontemi default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
  v_kategori uuid;
  v_islem uuid;
begin
  if not is_finance(p_business) then
    raise exception 'Prim verme yetkiniz yok.';
  end if;
  -- 056: yöntem oluştururken zorunlu
  if p_yontem is null then
    raise exception 'Prim için ödeme yöntemi (Nakit / Kredi Kartı / Havale) seçilmelidir.';
  end if;
  if p_tutar is null or p_tutar <= 0 then
    raise exception 'Tutar 0''dan büyük olmalı.';
  end if;
  if p_tutar <> round(p_tutar, 2) then
    raise exception 'Tutar en fazla 2 ondalık basamak içerebilir.';
  end if;
  if not exists (select 1 from business_members
                 where profile_id = p_profile and business_id = p_business) then
    raise exception 'Personel bu işletmede kayıtlı değil.';
  end if;

  select full_name into v_name from profiles where id = p_profile;
  select id into v_kategori
  from kategoriler
  where business_id = p_business and tur = 'GIDER'
    and label = 'Personel Maaşı' and is_active
  limit 1;

  insert into islemler
    (business_id, tur, tutar, baslik, kategori_id, kaynak, durum,
     islem_tarihi, created_by, odeme_yontemi)
  values
    (p_business, 'GIDER', p_tutar,
     v_name || ' — ' || coalesce(nullif(trim(p_note), ''), 'Prim'),
     v_kategori, 'PERSONEL', 'BEKLIYOR', istanbul_today(), auth.uid(), p_yontem)
  returning id into v_islem;

  insert into personel_odemeler (profile_id, business_id, tur, tutar, note, islem_id, created_by)
  values (p_profile, p_business, 'PRIM', p_tutar, coalesce(p_note, ''), v_islem, auth.uid());

  perform log_audit('PRIM', 'personel_odemeler', p_profile::text,
    jsonb_build_object('tutar', p_tutar, 'islem_id', v_islem, 'durum', 'BEKLIYOR'));
  return v_islem;
end;
$$;

-- ── C. approve_avans_istek: yöntemi geçir ──
-- Personelin isteğini onaylamak da avans OLUŞTURUR → yöntem burada da sorulur.
-- Gövde 046'dan birebir; tek fark yöntemin give_avans'a geçirilmesi.
-- (give_avans null gelirse zaten kendi Türkçe hatasını verir.)

drop function if exists public.approve_avans_istek(uuid);

create or replace function public.approve_avans_istek(
  p_id uuid,
  p_yontem public.odeme_yontemi default null
)
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

  -- Avans Ver ile birebir aynı yol (kendi yetki/tutar/yöntem kontrolleri dahil)
  v_islem := give_avans(r.profile_id, r.business_id, r.tutar,
                        coalesce(nullif(trim(r.metin), ''), 'Avans isteği'),
                        p_yontem);

  update istekler
  set durum = 'ONAYLANDI', islem_id = v_islem,
      karar_veren = auth.uid(), karar_tarihi = now()
  where id = p_id;

  perform log_audit('ISTEK_ONAY', 'istekler', p_id::text,
    jsonb_build_object('tutar', r.tutar, 'islem_id', v_islem,
                       'odeme_yontemi', p_yontem));
  return v_islem;
end;
$$;
