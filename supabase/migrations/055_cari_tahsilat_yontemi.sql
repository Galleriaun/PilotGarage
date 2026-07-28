-- ============================================================
-- PilotGarage — 055: Cari tahsilat yöntemi TOPLAMA anında seçilir
-- (owner request 2026-07-29, 054'ün açığı)
--
-- 054 yöntemi harekete YAZILDIĞI ANDA koydu. Bu "Ödeme Topla" için doğru
-- (hareketi zaten o akış üretiyor) ama BORÇ için yanlış: "Borç Ekle" para
-- hareketi değil, alacağın kaydıdır — o an nasıl tahsil edileceği bilinmez.
-- Sonuç: borç → "Tümünü Topla" yolundan gelen kasa gelirleri yöntemsiz
-- kalıyordu, yani cari akışının ASIL yolu kovalara ayrışmıyordu.
--
-- Düzeltme: yöntem tahsilat anında (yansıtırken) sorulur.
--   * `yansit_cari_hareket(p_hareket_id, p_yontem)` — p_yontem verilirse o
--     kazanır, verilmezse hareketin 054'te saklanan yöntemine düşülür
--     (topla_cari_odeme ile açılmış hareketler bozulmaz).
--   * Seçilen yöntem hareketin üstüne de YAZILIR: cari geçmişi "bu borç
--     nasıl tahsil edildi" bilgisini taşısın; reddedilip (YOK) tekrar
--     toplandığında da son seçim görünür.
--
-- Eski 1 argümanlı imza düşürülür — farklı parametre listesi `create or
-- replace` ile değişmez, yanına AŞIRI YÜKLEME olarak eklenirdi (033/054 dersi).
-- Kasa/Onay davranışı DEĞİŞMEZ: hareket yine BEKLIYOR'a geçer, işlem yine
-- born-BEKLIYOR GELİR'dir, onaylanana kadar kasa etkilenmez.
-- ============================================================

drop function if exists public.yansit_cari_hareket(uuid);

create or replace function public.yansit_cari_hareket(
  p_hareket_id uuid,
  p_yontem public.odeme_yontemi default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  h record;
  ci record;
  v_yontem public.odeme_yontemi;
  v_islem uuid;
begin
  select * into h from cari_hareketler where id = p_hareket_id for update;
  if not found then
    raise exception 'Hareket bulunamadı.';
  end if;
  select * into ci from cari_isletmeler where id = h.cari_isletme_id;
  if not is_finance(ci.business_id) then
    raise exception 'Bu hareket için yetkiniz yok.';
  end if;
  if h.kasa_durumu <> 'YOK' then
    raise exception 'Bu hareket için ödeme zaten toplanmış veya onay bekliyor.';
  end if;

  -- toplama anındaki seçim kazanır; yoksa harekette saklı olan (054)
  v_yontem := coalesce(p_yontem, h.odeme_yontemi);

  insert into islemler
    (business_id, tur, tutar, baslik, kaynak, durum, islem_tarihi, created_by,
     cari_hareket_id, odeme_yontemi)
  values
    (ci.business_id, 'GELIR', h.tutar,
     ci.name || ' — ' || coalesce(nullif(h.note, ''),
       case when h.tur = 'GELIR' then 'Tahsilat' else 'Ödeme' end),
     'CARI_HESAP', 'BEKLIYOR', istanbul_today(), auth.uid(), h.id, v_yontem)
  returning id into v_islem;

  update cari_hareketler
  set kasa_durumu = 'BEKLIYOR', odeme_yontemi = v_yontem
  where id = h.id;

  perform log_audit('YANSIT', 'cari_hareketler', h.id::text,
    jsonb_build_object('islem_id', v_islem, 'tutar', h.tutar,
                       'odeme_yontemi', v_yontem));
  return v_islem;
end;
$$;
