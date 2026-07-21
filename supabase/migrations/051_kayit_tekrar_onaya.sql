-- ============================================================
-- PilotGarage — 051: Kaydı elle tekrar Onay'a gönder (owner request 2026-07-21)
--
-- Kayıt Detay'daki "Tekrar Onaya Gönder" butonu (yalnızca Yönetici): kaydın
-- gelirini Onay kuyruğuna (yeniden) düşürür. Otomatik yol
-- `kayit_tamamlandi_islem` (034) durum TAMAMLANDI'ya geçince gelir doğurur ve
-- reddedilen gelir yeniden tamamlanınca yeniden kuyruğa girer (008); bu RPC
-- aynı işi durum'a dokunmadan elle yapar — özellikle gelir REDDEDİLDİkten
-- sonra tekrar onaya göndermek için.
--
-- FİNANS GÜVENLİĞİ — çift gelir YASAK. Guard'lar `kayit_tamamlandi_islem`'in
-- dedup'ını birebir izler (`durum <> 'REDDEDILDI'` satır varsa yeni gelir yok):
--   • BEKLIYOR gelir zaten varsa → zaten Onay'da; NO-OP, yeni satır AÇILMAZ
--     (buton çift basılsa/iki Yönetici bassa bile).
--   • ONAYLANDI gelir varsa → kasaya işlenmiş; RED. Geri almak için işlem
--     tarafındaki "Onaya Geri Gönder" (040) kullanılır — buradan yeni gelir
--     açmak çift sayım olurdu. (ONAYLANDI gelir, durum sonradan TAMAMLANDI'dan
--     düşürülmüş olsa bile durabilir; o yüzden bu kontrol durum kontrolünden
--     ÖNCE gelir.)
--   • yalnızca REDDEDILDI ya da hiç gelir yoksa → yeni BEKLIYOR gelir doğar.
-- Gelir yalnızca TAMAMLANDI kayıttan doğar (sistemin değişmez kuralı); tutar
-- yoksa (paket de tutar da yok) reddedilir. Doğan satır otomatik yolla birebir
-- aynıdır (tutar override / paket fiyatı, yöntem, komisyon, kategori, başlık).
--
-- Eşzamanlılık: iki Yönetici aynı anda basarsa ikisi de "aktif gelir yok"
-- görüp iki satır açabilirdi — kayıt satırı `for update` ile kilitlenip
-- serileştirilir (ikinci çağrı ilkinin BEKLIYOR'unu görüp NO-OP'a düşer).
--
-- Yetki: yalnızca Yönetici (Onay 044 ile Yönetici-only; gelir bu kişinin Onay
-- kuyruğuna gider). Sınır RPC'de; buton yalnızca kolaylık.
-- ============================================================

create or replace function public.kayit_tekrar_onaya_gonder(p_kayit_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  k record;
  v_paket_name text;
  v_paket_price numeric;
  v_tutar numeric;
  v_komisyon numeric;
  v_kategori uuid;
  v_islem uuid;
begin
  select * into k from kayitlar where id = p_kayit_id for update;
  if not found then
    raise exception 'Kayıt bulunamadı.';
  end if;
  if not (is_yonetici() and can_access_business(k.business_id)) then
    raise exception 'Kaydı onaya gönderme yetkisi yalnızca Yöneticidedir.';
  end if;

  -- zaten Onay'da bekleyen gelir varsa hiçbir şey yapma (çift gelir olmasın)
  if exists (select 1 from islemler
             where kayit_id = p_kayit_id and durum = 'BEKLIYOR') then
    return null;
  end if;
  -- onaylanmış gelir varsa kasaya işlenmiş: yeni gelir çift sayım olur
  if exists (select 1 from islemler
             where kayit_id = p_kayit_id and durum = 'ONAYLANDI') then
    raise exception 'Bu kaydın geliri zaten onaylanmış ve kasaya işlenmiş. Tekrar onaya göndermek için ilgili işlemi "Onaya Geri Gönder" ile geri alın.';
  end if;
  -- gelir yalnızca tamamlanan kayıttan doğar (değişmez kural)
  if k.durum <> 'TAMAMLANDI' then
    raise exception 'Yalnızca tamamlanan kayıtların geliri onaya gönderilebilir.';
  end if;

  if k.paket_id is not null then
    select name, price into v_paket_name, v_paket_price from paketler where id = k.paket_id;
  end if;
  -- finans özel tutar girmişse onu, yoksa paket fiyatını kullan (034 ile aynı)
  v_tutar := coalesce(k.tutar, v_paket_price);
  if v_tutar is null or v_tutar <= 0 then
    raise exception 'Bu kayıt için bir gelir tutarı yok (paket veya tutar girilmemiş).';
  end if;

  select id into v_kategori
  from kategoriler
  where business_id = k.business_id and tur = 'GELIR'
    and label = 'Servis Ücreti' and is_active
  limit 1;

  -- komisyon yalnızca KK + geçerli (tutardan küçük) ise taşınır (034 ile aynı)
  v_komisyon := case
    when k.odeme_yontemi = 'KREDI_KARTI' and k.komisyon is not null
         and k.komisyon < v_tutar then k.komisyon
    else null end;

  insert into islemler
    (business_id, tur, tutar, baslik, kategori_id, kaynak, durum,
     islem_tarihi, created_by, kayit_id, odeme_yontemi, komisyon)
  values
    (k.business_id, 'GELIR', v_tutar,
     k.plaka || ' — ' || coalesce(v_paket_name, 'Servis'),
     v_kategori, 'KAYIT', 'BEKLIYOR', istanbul_today(), auth.uid(), k.id,
     k.odeme_yontemi, v_komisyon)
  returning id into v_islem;

  perform log_audit('KAYIT_TEKRAR_ONAYA', 'kayitlar', p_kayit_id::text,
    jsonb_build_object('islem_id', v_islem, 'tutar', v_tutar,
                       'odeme_yontemi', k.odeme_yontemi));
  return v_islem;
end;
$$;
