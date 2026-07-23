-- ============================================================
-- PilotGarage — 053: Cepten ödeme borcunu geri öde (owner request 2026-07-21)
--
-- 052 yöneticinin cebinden ödediği gideri telafi edip borcu ("Verilecek")
-- kaydediyordu ama borcu KAPATMANIN yolu yoktu. Bu migration geri ödemeyi
-- ekler: işletme yöneticiye parasını verir → kasadan **GİDER** çıkar (seçilen
-- ödeme yöntemiyle) ve borç o kadar azalır.
--
-- Model: geri ödeme de `kaynak = 'CEPTEN'` satırıdır, sadece YÖNÜ terstir.
--   borç = Σ(CEPTEN GELİR) − Σ(CEPTEN GİDER)   [ONAYLANDI, kişi+işletme bazında]
-- Yeni kolon/tablo gerekmez; `cepten_yonetici_id` bağı 052'den geliyor.
--
-- Tam döngü (net doğru):
--   gider 1.150 (Nakit)      → bakiye −1.150            (gerçek masraf)
--   cepten ödeme 1.150       → bakiye +1.150, borç 1.150 (para kasadan çıkmadı)
--   geri ödeme 1.150         → bakiye −1.150, borç 0     (yöneticiye ödendi)
--   toplam: −1.150 = masrafın kendisi ✓
--
-- BORÇTAN FAZLASI ÖDENEMEZ: sunucu mevcut borcu okur ve aşan tutarı reddeder
-- (aksi hâlde borç eksiye düşer ve "Verilecek" anlamsızlaşırdı). Eşzamanlı iki
-- ödeme bayat borç okuyup birlikte aşabilirdi — kişi+işletme başına advisory
-- lock ile serileştirilir (043'teki nakit sınırının aynısı).
--
-- Yetki + Onay: 052 ile aynı — **yalnızca Yönetici**, born-ONAYLANDI (oluşturan
-- = onaylayan). `islem_onaya_geri_gonder` CEPTEN'i zaten reddediyor (052), bu
-- satır da CEPTEN olduğu için kapsam dışı kalır.
--
-- NOT: 'CEPTEN' enum değeri 052'de eklendi; yine de karşılaştırmalar
-- `kaynak::text` üzerinden yapılır ki dosyalar tek transaction'da arka arkaya
-- çalıştırılsa bile "unsafe use of new value" hatası çıkmasın.
-- ============================================================

create or replace function public.cepten_geri_ode(
  p_business uuid,
  p_yonetici uuid,
  p_tutar numeric,
  p_yontem public.odeme_yontemi,
  p_aciklama text default ''
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
  v_borc numeric(14,2);
  v_islem uuid;
begin
  if not (is_yonetici() and can_access_business(p_business)) then
    raise exception 'Cepten ödeme geri ödemesi yalnızca Yöneticidedir.';
  end if;
  if p_tutar is null or p_tutar <= 0 then
    raise exception 'Tutar 0''dan büyük olmalı.';
  end if;
  if p_tutar <> round(p_tutar, 2) then
    raise exception 'Tutar en fazla 2 ondalık basamak içerebilir.';
  end if;
  if p_yontem is null then
    raise exception 'Ödeme yöntemi (Nakit / Kredi Kartı / Havale) seçilmelidir.';
  end if;

  select full_name into v_name from profiles where id = p_yonetici;
  if not found then
    raise exception 'Yönetici bulunamadı.';
  end if;

  -- aynı kişiye eşzamanlı iki geri ödeme bayat borç okuyup borcu aşmasın
  perform pg_advisory_xact_lock(
    hashtext('cepten:' || p_business::text || ':' || p_yonetici::text));

  select coalesce(sum(case when tur = 'GELIR' then tutar else -tutar end), 0)
    into v_borc
  from islemler
  where business_id = p_business
    and cepten_yonetici_id = p_yonetici
    and durum = 'ONAYLANDI'
    and kaynak::text = 'CEPTEN';

  if v_borc <= 0 then
    raise exception 'Bu yöneticiye ödenecek cepten ödeme borcu yok.';
  end if;
  if p_tutar > v_borc then
    raise exception 'Borçtan fazlası ödenemez (kalan borç: % ₺).',
      to_char(v_borc, 'FM999999999990.00');
  end if;

  -- kasadan çıkış: yöneticiye borcun ödenmesi
  insert into islemler
    (business_id, tur, tutar, baslik, kaynak, durum, islem_tarihi,
     created_by, onaylayan, onaylanma_tarihi, odeme_yontemi, cepten_yonetici_id)
  values
    (p_business, 'GIDER', p_tutar,
     v_name || ' — ' || coalesce(nullif(trim(p_aciklama), ''), 'Cepten Ödeme İadesi'),
     'CEPTEN', 'ONAYLANDI', istanbul_today(),
     auth.uid(), auth.uid(), now(), p_yontem, p_yonetici)
  returning id into v_islem;

  perform log_audit('CEPTEN_GERI_ODEME', 'islemler', v_islem::text,
    jsonb_build_object('tutar', p_tutar, 'yonetici', p_yonetici,
                       'odeme_yontemi', p_yontem, 'kalan_borc', v_borc - p_tutar));
  return v_islem;
end;
$$;
