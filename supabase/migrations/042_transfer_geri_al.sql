-- ============================================================
-- PilotGarage — 042: Transferi Geri Al (owner request 2026-07-20)
--
-- Tüm İşlemler'deki geri-ok butonu, TRANSFER satırlarında "Onaya Geri Gönder"
-- yerine "Transferi Geri Al" olarak davranır. Geri alma SİLME DEĞİL, ters
-- yönde yeni bir aktarımdır (karşı kayıt) — tarih bozulmaz, kasa geçmişi
-- olduğu gibi kalır:
--
--   orijinal : GIDER/NAKIT + GELIR/KREDI_KARTI   "Hesaba Para Aktarımı"
--   geri alma: GIDER/KREDI_KARTI + GELIR/NAKIT   "Transfer Geri Alma"
--
-- Sonuç: tutar Nakit kovasına geri döner ve listede yeni bir satır belirir.
--
-- `islemler.iade_of` geri alma bacağını orijinal aktarıma bağlar; ÜZERİNDEKİ
-- KISMİ UNIQUE INDEX bir aktarımın ikinci kez geri alınmasını DB seviyesinde
-- imkânsız kılar (çift dokunuş kovaları aşırı düzeltirdi).
--
-- delete_islem: geri alınmış bir aktarım SİLİNEMEZ (önce geri alma silinmeli).
-- Aksi hâlde FK'nin ON DELETE SET NULL'ı geri alma satırında UPDATE tetikler
-- (guard'ı tökezletir) ve orijinali silip iadeyi bırakmak kovaları ters yöne
-- kaydırırdı.
-- ============================================================

alter table public.islemler
  add column if not exists iade_of uuid references public.islemler (id) on delete set null;

-- bir aktarımın yalnızca BİR geri alması olabilir
create unique index if not exists islemler_iade_of_uidx on public.islemler (iade_of)
  where iade_of is not null;

-- ── RPC: aktarımı ters yönde bir aktarımla geri al ──

create or replace function public.transfer_geri_al(p_islem_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v record;
  v_ana record;
  v_hedef public.odeme_yontemi;
  v_yeni uuid;
begin
  select * into v from islemler where id = p_islem_id for update;
  if not found then
    raise exception 'İşlem bulunamadı.';
  end if;
  -- buton 040 ile aynı görünürlükte (yalnızca Yönetici)
  if not (is_yonetici() and can_access_business(v.business_id)) then
    raise exception 'Aktarımı geri alma yetkisi yalnızca Yöneticidedir.';
  end if;
  if v.kaynak::text <> 'TRANSFER' then
    raise exception 'Yalnızca para aktarımları geri alınabilir.';
  end if;

  -- hangi bacak verilirse verilsin ana bacak üzerinden çalış
  select * into v_ana from islemler where id = coalesce(v.transfer_of, v.id) for update;
  if not found then
    raise exception 'Aktarımın ana bacağı bulunamadı.';
  end if;
  if v_ana.iade_of is not null then
    raise exception 'Geri alma işlemi tekrar geri alınamaz.';
  end if;
  if exists (select 1 from islemler where iade_of = v_ana.id) then
    raise exception 'Bu aktarım zaten geri alınmış.';
  end if;

  -- orijinalin HEDEF kovası = eş bacağın yöntemi; geri almada para oradan çıkar
  select odeme_yontemi into v_hedef from islemler where transfer_of = v_ana.id limit 1;
  if v_hedef is null then
    raise exception 'Aktarımın eş bacağı bulunamadı.';
  end if;

  -- ters ana bacak: hedef kovadan çıkış (ör. Kredi Kartı)
  insert into islemler
    (business_id, tur, tutar, baslik, kaynak, durum, islem_tarihi,
     created_by, onaylayan, onaylanma_tarihi, odeme_yontemi, iade_of)
  values
    (v_ana.business_id, 'GIDER', v_ana.tutar, 'Transfer Geri Alma', 'TRANSFER', 'ONAYLANDI',
     istanbul_today(), auth.uid(), auth.uid(), now(), v_hedef, v_ana.id)
  returning id into v_yeni;

  -- ters eş bacak: kaynak kovaya geri dönüş (ör. Nakit)
  insert into islemler
    (business_id, tur, tutar, baslik, kaynak, durum, islem_tarihi,
     created_by, onaylayan, onaylanma_tarihi, odeme_yontemi, transfer_of)
  values
    (v_ana.business_id, 'GELIR', v_ana.tutar, 'Transfer Geri Alma', 'TRANSFER', 'ONAYLANDI',
     istanbul_today(), auth.uid(), auth.uid(), now(), v_ana.odeme_yontemi, v_yeni);

  perform log_audit('TRANSFER_GERI_AL', 'islemler', v_ana.id::text,
    jsonb_build_object('tutar', v_ana.tutar, 'iade_islem', v_yeni));
  return v_yeni;
end;
$$;

-- ── delete_islem: geri alınmış aktarım silinemez (041 gövdesi + 042) ──

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

  if v.kaynak::text = 'TRANSFER' then
    v_ana := coalesce(v.transfer_of, v.id);
    -- 042: iadesi olan aktarım silinemez — orijinal gidip iade kalsaydı
    -- kovalar ters yöne kayardı
    if exists (select 1 from islemler where iade_of = v_ana) then
      raise exception 'Geri alınmış bir aktarım silinemez — önce geri alma işlemini silin.';
    end if;
    -- Sıra ÖNEMLİ: önce eş bacak(lar), sonra ana bacak (013 dersi)
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

  for c in select id from islemler where komisyon_of = p_id loop
    perform set_config('app.islem_sil', c.id::text, true);
    delete from islemler where id = c.id;
  end loop;

  if v.cari_hareket_id is not null then
    update cari_hareketler set kasa_durumu = 'YOK' where id = v.cari_hareket_id;
  end if;

  perform set_config('app.islem_sil', p_id::text, true);
  delete from islemler where id = p_id;
  perform set_config('app.islem_sil', '', true);

  perform log_audit('DELETE_ISLEM', 'islemler', p_id::text,
    jsonb_build_object('baslik', v.baslik, 'tutar', v.tutar, 'tur', v.tur,
                       'kaynak', v.kaynak, 'durum', v.durum));
end;
$$;
