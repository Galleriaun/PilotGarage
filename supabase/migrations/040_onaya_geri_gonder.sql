-- ============================================================
-- PilotGarage — 040: Onaya Geri Gönder (owner request 2026-07-20)
--
-- Saha durumu: KK işlemleri kartın parası hesaba düşmeden onaylanmıştı;
-- Yönetici geri almak için işlemleri silmek zorunda kaldı ve "tekrar onaya
-- gönderecek" bir yol bulamadı. Bu migration onaylanmış bir işlemi tekrar
-- BEKLIYOR durumuna döndüren Yönetici-özel RPC'yi ekler:
--
--   * Yalnızca YONETICI (Muhasebe değil — owner kararı).
--   * İşlem kasadan çıkar (kasa ONAYLANDI görünümü kendini yeniden hesaplar)
--     ve Onay ekranında saklı yöntem/komisyonuyla yeniden belirir.
--   * Onayda doğan bağlı KK komisyon gideri SİLİNİR (yeniden onayda tekrar
--     oluşur) ve çöpe DÜŞMEZ — çöpten tek başına geri alınabilse, ana işlem
--     yeniden onaylandığında komisyon kasada iki kez yer alırdı.
--   * Cari işlemde hareket YANSIDI → BEKLIYOR'a döner (bakiye matematiği
--     değişmez: kasa_durumu ≠ YOK olduğu sürece tahsil edilmiş sayılır).
--   * Komisyon gideri tek başına geri gönderilemez (ana işlemi gönderin);
--     PERSONEL işlemleri (maaş/avans/prim) geri gönderilemez —
--     personel_odemeler kayıtlarıyla bağı kopar, tutarsızlık doğar.
--
-- Değişmez üçüncü kez yumuşatıldı (013 detach, 024 delete'ten sonra):
-- karar görmüş satırın durum değişikliği YALNIZCA bu RPC'nin işaretlediği
-- satır için, yalnızca ONAYLANDI → BEKLIYOR yönünde serbest.
-- ============================================================

-- ── Guard: 024 gövdesi + onaya-geri-gönder UPDATE istisnası ──

create or replace function public.islemler_immutable_guard()
returns trigger
language plpgsql
as $$
declare
  detachable text[] := array['kayit_id', 'cari_hareket_id', 'sabit_gider_id', 'tekrar_kural_id'];
  revert_fields text[] := array['durum', 'onaylayan', 'onaylanma_tarihi'];
begin
  if old.durum = 'BEKLIYOR' then
    if tg_op = 'UPDATE' then
      return new;
    end if;
    return old;
  end if;
  if tg_op = 'DELETE'
     and current_setting('app.islem_sil', true) = old.id::text then
    return old;
  end if;
  -- 040: islem_onaya_geri_gonder — yalnızca işaretli satır, yalnızca
  -- ONAYLANDI → BEKLIYOR, yalnızca karar alanları değişebilir
  if tg_op = 'UPDATE'
     and current_setting('app.onaya_geri', true) = old.id::text
     and old.durum = 'ONAYLANDI'
     and new.durum = 'BEKLIYOR'
     and new.onaylayan is null
     and new.onaylanma_tarihi is null
     and to_jsonb(new) - revert_fields = to_jsonb(old) - revert_fields
  then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and to_jsonb(new) - detachable = to_jsonb(old) - detachable
     and (new.kayit_id is not distinct from old.kayit_id or new.kayit_id is null)
     and (new.cari_hareket_id is not distinct from old.cari_hareket_id or new.cari_hareket_id is null)
     and (new.sabit_gider_id is not distinct from old.sabit_gider_id or new.sabit_gider_id is null)
     and (new.tekrar_kural_id is not distinct from old.tekrar_kural_id or new.tekrar_kural_id is null)
  then
    return new;
  end if;
  raise exception 'Onaylanmış veya reddedilmiş işlem değiştirilemez/silinemez — düzeltme için karşı kayıt girin.';
end;
$$;

-- ── trash_capture: 024 gövdesi + komisyon çocuğunun sessiz silinmesi ──
-- app.onaya_geri o an geri gönderilen ANA işlemin id'sini taşır; silinen
-- satır onun komisyon çocuğuysa çöpe düşürme (yukarıdaki gerekçe).

create or replace function public.trash_capture()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_business uuid;
  v_title text;
  v_type text;
begin
  if tg_table_name = 'kayitlar' then
    v_business := old.business_id; v_type := 'KAYIT';
    v_title := old.plaka
      || case when old.musteri_adi <> '' then ' — ' || old.musteri_adi else '' end;
  elsif tg_table_name = 'cari_isletmeler' then
    v_business := old.business_id; v_type := 'ISLETME'; v_title := old.name;
  elsif tg_table_name = 'sabit_giderler' then
    v_business := old.business_id; v_type := 'SABIT_GIDER'; v_title := old.name;
  elsif tg_table_name = 'tekrar_kurallari' then
    v_business := old.business_id; v_type := 'TEKRAR'; v_title := old.baslik;
  elsif tg_table_name = 'islemler' then
    if old.komisyon_of is not null
       and current_setting('app.onaya_geri', true) = old.komisyon_of::text then
      return old; -- onaya-geri: komisyon yeniden onayda tekrar doğar
    end if;
    v_business := old.business_id; v_type := 'ISLEM';
    v_title := old.baslik
      || ' (' || case when old.tur = 'GELIR' then '+' else '-' end || old.tutar || ' ₺)';
  elsif tg_table_name = 'cari_hareketler' then
    select ci.business_id, ci.name into v_business, v_title
    from cari_isletmeler ci where ci.id = old.cari_isletme_id;
    if v_business is null then return old; end if;
    v_type := 'HAREKET';
    v_title := v_title || ' — ' || coalesce(nullif(old.note, ''),
      case when old.tur = 'GELIR' then 'Tahsilat' else 'Ödeme' end);
  else
    return old;
  end if;

  insert into trash (business_id, item_type, title, payload, deleted_by)
  values (v_business, v_type, v_title, to_jsonb(old), auth.uid());
  return old;
end;
$$;

-- ── RPC: onaylanmış işlemi tekrar Onay kuyruğuna döndür ──

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

  perform set_config('app.onaya_geri', p_islem_id::text, true);

  -- onayda doğan komisyon gideri: kaldır, yeniden onayda tekrar oluşur
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
