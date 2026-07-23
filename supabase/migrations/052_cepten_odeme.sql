-- ============================================================
-- PilotGarage — 052: Cepten Ödeme (owner request 2026-07-21)
--
-- Bir yönetici, işletmenin bir giderini KENDİ cebinden (nakit) öder. Gider
-- normal yoluyla zaten kasaya GİDER olarak işlenmiştir ve nakit kovasını
-- düşürmüştür — ama o para kasadan ÇIKMAMIŞTIR. "Cepten Ödeme" bu farkı
-- kapatır: aynı tutarda **NAKİT GELİR** yazar (kova geri yükselir) ve
-- işletmenin o yöneticiye olan borcunu ("verilecek") kaydeder.
--
--   gider 1.150 (NAKİT)        → bakiye −1.150, nakit −1.150
--   cepten ödeme 1.150 (NAKİT) → bakiye +1.150, nakit +1.150   (net: kasa aynı)
--   sonuç: gider gerçekleşti, kasa nakiti hiç azalmadı, yöneticiye 1.150 borç.
--
-- ÖNEMLİ (bilerek): satır ciro/gider toplamlarından DIŞLANMAZ (TRANSFER gibi
-- davranmaz). Dışlansaydı `bakiye = gelir − gider` hesabı giderin düşüşünü
-- telafi edemez, kasa kalıcı olarak eksik görünürdü. `v_kasa_ozet` yalnızca
-- TRANSFER'i dışlar; CEPTEN kendiliğinden dâhildir. Yan etki: Gelir kartı bu
-- telafi satırlarını da sayar (karşılığındaki gider de sayıldığı için NET
-- doğrudur). Ciro'dan ayrıştırmak istenirse `kaynak = 'CEPTEN'` ile süzülür.
--
-- Onay: born-ONAYLANDI, Onay'a DÜŞMEZ — ve bu yüzden RPC **yalnızca
-- Yönetici**'dir (Onay 044'ten beri Yöneticinin; oluşturan = onaylayan olduğu
-- için ayrı bir onay adımı anlamsız). Muhasebe'ye açılsaydı Onay gate'i
-- Muhasebe için delinmiş olurdu. Onay istisnaları artık: maaş, sabit gider
-- (016), tekrar (019), transfer (041), cepten ödeme (052).
--
-- `islem_onaya_geri_gonder` CEPTEN'i reddeder (049 dersi): Onay'dan hiç
-- geçmemiş satır, hiç girmediği kuyruğa düşmemeli.
--
-- NOT (enum): 'CEPTEN' eklendikten sonra AYNI transaction içinde
-- karşılaştırmada kullanılamaz ("unsafe use of new value") — bu yüzden
-- karşılaştırmalar `kaynak::text` üzerinden; enum literali yalnızca çalışma
-- zamanında (RPC gövdesinde) geçer. 041'deki desenin aynısı.
-- ============================================================

alter type public.islem_kaynak add value if not exists 'CEPTEN';

-- Parayı cebinden ödeyen yönetici (borç bu kişiye). Profil silinirse bağ
-- kopar ama kasa satırı tarihçe olarak durur.
alter table public.islemler
  add column if not exists cepten_yonetici_id uuid references public.profiles (id) on delete set null;
create index if not exists islemler_cepten_yonetici_idx
  on public.islemler (cepten_yonetici_id) where cepten_yonetici_id is not null;

-- ── RPC: cepten ödemeyi yaz (born-ONAYLANDI nakit geliri) ──

create or replace function public.cepten_odeme(
  p_business uuid,
  p_yonetici uuid,
  p_tutar numeric,
  p_aciklama text default ''
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
  v_role public.role_type;
  v_status public.account_status;
  v_islem uuid;
begin
  if not (is_yonetici() and can_access_business(p_business)) then
    raise exception 'Cepten ödeme yetkisi yalnızca Yöneticidedir.';
  end if;
  if p_tutar is null or p_tutar <= 0 then
    raise exception 'Tutar 0''dan büyük olmalı.';
  end if;
  if p_tutar <> round(p_tutar, 2) then
    raise exception 'Tutar en fazla 2 ondalık basamak içerebilir.';
  end if;

  select p.full_name, p.role, p.status into v_name, v_role, v_status
  from profiles p where p.id = p_yonetici;
  if not found then
    raise exception 'Yönetici bulunamadı.';
  end if;
  if v_role <> 'YONETICI' then
    raise exception 'Cepten ödeme yalnızca bir yönetici adına kaydedilebilir.';
  end if;
  if v_status <> 'ACTIVE' then
    raise exception 'Bu hesap aktif değil.';
  end if;
  if not exists (select 1 from business_members
                 where profile_id = p_yonetici and business_id = p_business) then
    raise exception 'Yönetici bu işletmede kayıtlı değil.';
  end if;

  -- Nakit kovasına GELİR: cebinden ödenen tutar kasadan çıkmadı
  insert into islemler
    (business_id, tur, tutar, baslik, kaynak, durum, islem_tarihi,
     created_by, onaylayan, onaylanma_tarihi, odeme_yontemi, cepten_yonetici_id)
  values
    (p_business, 'GELIR', p_tutar,
     v_name || ' — ' || coalesce(nullif(trim(p_aciklama), ''), 'Cepten Ödeme'),
     'CEPTEN', 'ONAYLANDI', istanbul_today(),
     auth.uid(), auth.uid(), now(), 'NAKIT', p_yonetici)
  returning id into v_islem;

  perform log_audit('CEPTEN_ODEME', 'islemler', v_islem::text,
    jsonb_build_object('tutar', p_tutar, 'yonetici', p_yonetici,
                       'aciklama', coalesce(p_aciklama, '')));
  return v_islem;
end;
$$;

-- ── Onaya geri gönder: CEPTEN de reddedilir (049 gövdesi + 052) ──
-- Born-ONAYLANDI doğar, Onay kuyruğuna hiç girmez; geri gönderilirse hiç
-- girmediği kuyruğa düşerdi.

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
  if v.kaynak::text = 'TRANSFER' then
    raise exception 'Para transferi onaya geri gönderilemez — silip yeniden yapın.';
  end if;
  if v.kaynak::text = 'CEPTEN' then
    raise exception 'Cepten ödeme onaya geri gönderilemez — Onay''dan geçmez.';
  end if;
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
