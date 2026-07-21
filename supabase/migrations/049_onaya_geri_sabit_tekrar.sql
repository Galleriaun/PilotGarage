-- ============================================================
-- PilotGarage — 049: Onaya geri gönder yalnızca Onay'dan geçmiş işlemlere
-- (owner request 2026-07-21)
--
-- `islem_onaya_geri_gonder` şimdiye dek komisyon çocuğu / PERSONEL / TRANSFER
-- satırlarını reddediyordu ama CRON'un doğurduğu born-ONAYLANDI satırları
-- kaçırıyordu:
--   • sabit gider işlemi (016) — kaynak SABIT_GIDER, sabit_gider_id dolu
--   • tekrar kuralı işlemi (019) — kaynak MANUEL, tekrar_kural_id dolu
-- Bunlar Onay'a HİÇ düşmez (kurulumda bir kez onaylanmış sayılırlar). Geri
-- gönderilirlerse hiç girmedikleri Onay kuyruğuna düşer, orada yeniden
-- onaylanmayı bekler — anlamsız ve kafa karıştırıcı.
--
-- İstemci butonu zaten gizliyor (`onayaGeriGonderilebilir`), ama 044/045'in
-- dersi: asıl sınır RPC'de olmalı. Gövde 041'deki gibi; yalnızca iki yeni
-- ret eklendi.
--
-- NOT: tekrar işlemini kaynak'la ayırt EDİLEMEZ (MANUEL, gerçek manuel
-- girişle aynı) — tek işaret `tekrar_kural_id`.
-- ============================================================

create or replace function public.islem_onaya_geri_gonder(p_islem_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v record;
  c record;
begin
  select * into v from islemler where id = p_islem_id for update;
  if not found then
    raise exception 'İşlem bulunamadı.';
  end if;
  if not (is_yonetici() and can_access_business(v.business_id)) then
    raise exception 'İşlemi onaya geri gönderme yetkisi yalnızca Yöneticidedir.';
  end if;
  if v.durum <> 'ONAYLANDI' then
    raise exception 'Yalnızca onaylanmış işlemler onaya geri gönderilebilir.';
  end if;
  if v.komisyon_of is not null then
    raise exception 'Komisyon gideri tek başına geri gönderilemez — ana işlemi geri gönderin.';
  end if;
  if v.kaynak = 'PERSONEL' then
    raise exception 'Personel ödemeleri (maaş/avans/prim) onaya geri gönderilemez.';
  end if;
  -- 041: transfer hiç Onay'dan geçmedi; tek bacağı BEKLIYOR'a düşerse kasa
  -- dengesi bozulur. Düzeltme yolu: transferi silip yeniden yapmak.
  if v.kaynak::text = 'TRANSFER' then
    raise exception 'Para transferi onaya geri gönderilemez — silip yeniden yapın.';
  end if;
  -- 049: cron'un born-ONAYLANDI ürettiği sabit gider / tekrar işlemleri de
  -- Onay'dan geçmez; geri gönderilirse hiç girmedikleri kuyruğa düşerler.
  if v.sabit_gider_id is not null then
    raise exception 'Sabit gider işlemleri onaya geri gönderilemez — Onay''dan geçmezler.';
  end if;
  if v.tekrar_kural_id is not null then
    raise exception 'Tekrarlanan (otomatik) işlemler onaya geri gönderilemez — Onay''dan geçmezler.';
  end if;

  perform set_config('app.onaya_geri', p_islem_id::text, true);

  for c in select id from islemler where komisyon_of = p_islem_id loop
    perform set_config('app.islem_sil', c.id::text, true);
    delete from islemler where id = c.id;
  end loop;
  perform set_config('app.islem_sil', '', true);

  update islemler
  set durum = 'BEKLIYOR', onaylayan = null, onaylanma_tarihi = null
  where id = p_islem_id;

  if v.cari_hareket_id is not null then
    update cari_hareketler set kasa_durumu = 'BEKLIYOR' where id = v.cari_hareket_id;
  end if;

  perform set_config('app.onaya_geri', '', true);

  perform log_audit('ONAYA_GERI_GONDER', 'islemler', p_islem_id::text,
    jsonb_build_object('baslik', v.baslik, 'tutar', v.tutar, 'tur', v.tur,
                       'kaynak', v.kaynak, 'odeme_yontemi', v.odeme_yontemi));
end;
$$;
