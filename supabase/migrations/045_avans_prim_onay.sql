-- ============================================================
-- PilotGarage — 045: Avans ve prim Onay'dan geçer (owner request 2026-07-20)
--
-- Avans ve prim artık kasaya DOĞRUDAN düşmez: işlem `BEKLIYOR` doğar ve
-- Onay ekranındaki yeni "Personel" filtresinde görünür. Onaylanınca kasaya
-- işler, reddedilince hiç olmamış sayılır.
--
-- MAAŞ DEĞİŞMEDİ (owner kararı): `pay_maas` ve cron'un otomatik maaşı
-- born-ONAYLANDI kalır — tekrarlayan, önceden kararlaştırılmış ödemedir,
-- her ay yeniden onaylatmanın anlamı yok. Onay gate'inin istisnaları artık:
-- maaş (PERSONEL/MAAS), sabit giderler (016) ve tekrar kuralları (019).
--
-- personel_odemeler satırı ESKİSİ GİBİ hemen yazılır (RPC atomik kalsın),
-- ama artık "ödendi" defteri değil "kayıt" defteridir; gerçek durum bağlı
-- işlemden okunur:
--   • BEKLIYOR  → listede "Onay bekliyor" rozeti, dönem TOPLAMINA GİRMEZ
--                 (toplamlar kasayla birebir olmak zorunda)
--   • ONAYLANDI → normal
--   • REDDEDİLDİ → satır SİLİNİR (`reject_islem`) — verilmemiş bir avans
--                 personelin defterinde durmamalı; REDDEDILDI diye üçüncü
--                 bir durumu her okuma yerinde süzmek zorunda kalmayız.
--
-- Ayrıca (mevcut bir tutarsızlığın düzeltmesi): `delete_islem` bir PERSONEL
-- işlemini silerken bağlı personel_odemeler satırını da siler. Önceden FK
-- `on delete set null` yüzünden satır öksüz kalıyor ve kasadan silinmiş bir
-- avans personel defterinde görünmeye devam ediyordu. Sıra önemli: önce
-- çocuk satır, sonra işlem (013 dersi).
--
-- NOT: `islem_onaya_geri_gonder` PERSONEL işlemlerini reddetmeye DEVAM eder
-- (040). Onaylanmış bir avansı geri almak isteyen `delete_islem` kullanır;
-- geri-gönder yolunu açmak personel_odemeler durumunu da geri sarmayı
-- gerektirir ve bu sürümün kapsamında değil.
-- ============================================================

-- ── Avans: born BEKLIYOR ──

create or replace function public.give_avans(
  p_profile uuid, p_business uuid, p_tutar numeric, p_note text default ''
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
     islem_tarihi, created_by)
  values
    (p_business, 'GIDER', p_tutar, v_name || ' — Avans', v_kategori, 'PERSONEL',
     'BEKLIYOR', istanbul_today(), auth.uid())
  returning id into v_islem;

  insert into personel_odemeler (profile_id, business_id, tur, tutar, note, islem_id, created_by)
  values (p_profile, p_business, 'AVANS', p_tutar, coalesce(p_note, ''), v_islem, auth.uid());

  perform log_audit('AVANS', 'personel_odemeler', p_profile::text,
    jsonb_build_object('tutar', p_tutar, 'islem_id', v_islem, 'durum', 'BEKLIYOR'));
  return v_islem;
end;
$$;

-- ── Prim: born BEKLIYOR ──

create or replace function public.give_prim(
  p_profile uuid, p_business uuid, p_tutar numeric, p_note text default ''
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
     islem_tarihi, created_by)
  values
    (p_business, 'GIDER', p_tutar, v_name || ' — Prim', v_kategori, 'PERSONEL',
     'BEKLIYOR', istanbul_today(), auth.uid())
  returning id into v_islem;

  insert into personel_odemeler (profile_id, business_id, tur, tutar, note, islem_id, created_by)
  values (p_profile, p_business, 'PRIM', p_tutar, coalesce(p_note, ''), v_islem, auth.uid());

  perform log_audit('PRIM', 'personel_odemeler', p_profile::text,
    jsonb_build_object('tutar', p_tutar, 'islem_id', v_islem, 'durum', 'BEKLIYOR'));
  return v_islem;
end;
$$;

-- ── Red: personel ödeme satırı da silinir (044 gövdesi + 045) ──

create or replace function public.reject_islem(p_islem_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v record;
begin
  select * into v from islemler where id = p_islem_id for update;
  if not found then
    raise exception 'İşlem bulunamadı.';
  end if;
  if not (is_yonetici() and can_access_business(v.business_id)) then
    raise exception 'İşlem reddetme yetkisi yalnızca Yöneticidedir.';
  end if;
  if v.durum <> 'BEKLIYOR' then
    raise exception 'İşlem zaten sonuçlandırılmış.';
  end if;

  update islemler
  set durum = 'REDDEDILDI', onaylayan = auth.uid(), onaylanma_tarihi = now()
  where id = p_islem_id;

  if v.cari_hareket_id is not null then
    update cari_hareketler set kasa_durumu = 'YOK' where id = v.cari_hareket_id;
  end if;

  -- 045: reddedilen avans/prim personelin defterinde kalmamalı
  if v.kaynak = 'PERSONEL' then
    delete from personel_odemeler where islem_id = p_islem_id;
  end if;

  perform log_audit('REJECT', 'islemler', p_islem_id::text,
    jsonb_build_object('tutar', v.tutar, 'tur', v.tur, 'kaynak', v.kaynak));
end;
$$;

-- ── Silme: bağlı personel ödeme satırı da gider (041 gövdesi + 045) ──

create or replace function public.delete_islem(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v record;
  c record;
  v_ana uuid;
begin
  select * into v from islemler where id = p_id for update;
  if not found then
    raise exception 'İşlem bulunamadı.';
  end if;
  if not is_finance(v.business_id) then
    raise exception 'Bu işlemi silme yetkiniz yok.';
  end if;

  -- 042: geri alınmış aktarım silinemez (önce iade silinmeli)
  if v.kaynak::text = 'TRANSFER' then
    v_ana := coalesce(v.transfer_of, v.id);
    if exists (select 1 from islemler where iade_of = v_ana) then
      raise exception 'Geri alınmış bir aktarım silinemez — önce geri alma işlemini silin.';
    end if;
    -- 041: hangi bacak verilirse verilsin ikisi birden gider. Sıra ÖNEMLİ:
    -- önce eş bacak(lar), sonra ana bacak (013 dersi).
    for c in select id from islemler where transfer_of = v_ana loop
      perform set_config('app.islem_sil', c.id::text, true);
      delete from islemler where id = c.id;
    end loop;
    perform set_config('app.islem_sil', v_ana::text, true);
    delete from islemler where id = v_ana;
    perform set_config('app.islem_sil', '', true);

    perform log_audit('DELETE_ISLEM', 'islemler', v_ana::text,
      jsonb_build_object('baslik', v.baslik, 'tutar', v.tutar, 'kaynak', 'TRANSFER'));
    return;
  end if;

  -- bağlı komisyon giderleri (ONAYLANDI) — ana işlemle birlikte silinir
  for c in select id from islemler where komisyon_of = p_id loop
    perform set_config('app.islem_sil', c.id::text, true);
    delete from islemler where id = c.id;
  end loop;

  if v.cari_hareket_id is not null then
    update cari_hareketler set kasa_durumu = 'YOK' where id = v.cari_hareket_id;
  end if;

  -- 045: personel ödeme satırı işlemden ÖNCE silinir — sonra silinseydi FK'nin
  -- on-delete-set-null'ı bağı koparır ve satır öksüz kalırdı
  if v.kaynak = 'PERSONEL' then
    delete from personel_odemeler where islem_id = p_id;
  end if;

  perform set_config('app.islem_sil', p_id::text, true);
  delete from islemler where id = p_id;
  perform set_config('app.islem_sil', '', true);

  perform log_audit('DELETE_ISLEM', 'islemler', p_id::text,
    jsonb_build_object('baslik', v.baslik, 'tutar', v.tutar, 'tur', v.tur,
                       'kaynak', v.kaynak, 'durum', v.durum));
end;
$$;
