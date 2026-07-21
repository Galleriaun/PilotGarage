-- ============================================================
-- PilotGarage — 043: Para transferi nakit bakiyesini aşamaz
-- (owner request 2026-07-20)
--
-- Aktarılan tutar, o işletmenin NAKİT kovasındaki mevcut bakiyeden büyük
-- olamaz. İstemci tarafında tuş vuruşu düzeyinde engellenir (girilemez);
-- burası ise gerçek sınır — RPC doğrudan çağrılsa da geçmez.
--
-- Nakit kovası = onaylanmış NAKİT işlemlerin gelir − gider farkı; TRANSFER
-- satırları DÂHİL (istemcideki `yontemNet(..., { transferDahil: true })` ile
-- birebir aynı hesap). Aksi hâlde arka arkaya yapılan iki transfer aynı
-- bakiyeyi iki kez harcayabilirdi.
--
-- Eşzamanlılık: iki transfer aynı anda gelirse ikisi de eski bakiyeyi
-- okuyup geçebilirdi (read-modify-write yarışı). İşletme başına transaction
-- ömürlü advisory lock ile serileştirilir.
--
-- KAPSAM: yalnızca `para_transferi`. `transfer_geri_al` (042) bilerek
-- sınırlanmaz — geri alma mevcut bir aktarımı düzeltir ve KK kovası bu arada
-- harcanmışsa bile her zaman mümkün kalmalıdır, yoksa kullanıcı yanlış
-- transferle kilitli kalır.
-- ============================================================

create or replace function public.para_transferi(p_business uuid, p_tutar numeric)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_ana uuid;
  v_nakit numeric(14,2);
begin
  if not is_finance(p_business) then
    raise exception 'Para transferi yetkiniz yok.';
  end if;
  if p_tutar is null or p_tutar <= 0 then
    raise exception 'Geçerli bir tutar girin.';
  end if;

  -- aynı işletmede eşzamanlı transferleri serileştir (çift harcama yarışı)
  perform pg_advisory_xact_lock(hashtext('para_transferi:' || p_business::text));

  -- nakit kovası: onaylı NAKİT gelir − gider (transfer bacakları dâhil)
  select coalesce(sum(case when tur = 'GELIR' then tutar else -tutar end), 0)
    into v_nakit
  from islemler
  where business_id = p_business
    and durum = 'ONAYLANDI'
    and odeme_yontemi = 'NAKIT';

  if p_tutar > v_nakit then
    raise exception 'Nakit hesabında yeterli bakiye yok (mevcut: % ₺).',
      to_char(v_nakit, 'FM999999999990.00');
  end if;

  -- ana bacak: nakit kovasından çıkış
  insert into islemler
    (business_id, tur, tutar, baslik, kaynak, durum, islem_tarihi,
     created_by, onaylayan, onaylanma_tarihi, odeme_yontemi)
  values
    (p_business, 'GIDER', p_tutar, 'Hesaba Para Aktarımı', 'TRANSFER', 'ONAYLANDI',
     istanbul_today(), auth.uid(), auth.uid(), now(), 'NAKIT')
  returning id into v_ana;

  -- eş bacak: kredi kartı kovasına giriş
  insert into islemler
    (business_id, tur, tutar, baslik, kaynak, durum, islem_tarihi,
     created_by, onaylayan, onaylanma_tarihi, odeme_yontemi, transfer_of)
  values
    (p_business, 'GELIR', p_tutar, 'Hesaba Para Aktarımı', 'TRANSFER', 'ONAYLANDI',
     istanbul_today(), auth.uid(), auth.uid(), now(), 'KREDI_KARTI', v_ana);

  perform log_audit('PARA_TRANSFERI', 'islemler', v_ana::text,
    jsonb_build_object('tutar', p_tutar, 'kaynak', 'NAKIT', 'hedef', 'KREDI_KARTI',
                       'nakit_bakiye', v_nakit));
  return v_ana;
end;
$$;
