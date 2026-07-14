-- ============================================================
-- PilotGarage — 032: Cari borç/ödeme modeli (owner request 2026-07-13)
--
-- Cari işletmeler artık borçlu (müşteri) hesabı olarak çalışır:
--   • "Borç Ekle"  → hareket (tur GELIR = alacağımız); kasa untouched.
--   • hareket "Ödeme Topla" (eski "Kasaya Yansıt") → tahsilat: işlem
--     artık HER ZAMAN kasa GELİR'idir (yansit_cari_hareket updated) —
--     para toplamak yönü ne olursa olsun kasaya giriştir.
--   • genel "Ödeme Topla" → topla_cari_odeme RPC: ödeme hareketi
--     (tur GIDER, born BEKLIYOR) + pending kasa geliri, atomic.
--     Reject → hareket YOK (008 yolu; tekrar toplanabilir); approve →
--     YANSIDI (mevcut approve_islem).
--
-- Bakiye (client): Σ borç (GELIR) − Σ hareket (kasa_durumu ≠ YOK)
--   = toplanmamış alacak. Onay gate değişmedi: kasa yalnızca ONAYLANDI
--   işlemlerden etkilenir.
--
-- Not: eski modelin "Gider Ekle" (tedarikçi borcu) kavramı kalkıyor —
-- varsa eski GIDER-tur cari tekrar kuralları elle silinmelidir.
-- ============================================================

-- ── yansıt = tahsilat: her zaman kasa GELİR'i ──
-- (GIDER-tur satırlar yalnızca reddedilmiş ödemelerdir; yeniden toplanır.)

create or replace function public.yansit_cari_hareket(p_hareket_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  h record;
  ci record;
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

  insert into islemler
    (business_id, tur, tutar, baslik, kaynak, durum, islem_tarihi, created_by, cari_hareket_id)
  values
    (ci.business_id, 'GELIR', h.tutar,
     ci.name || ' — ' || coalesce(nullif(h.note, ''),
       case when h.tur = 'GELIR' then 'Tahsilat' else 'Ödeme' end),
     'CARI_HESAP', 'BEKLIYOR', istanbul_today(), auth.uid(), h.id)
  returning id into v_islem;

  update cari_hareketler set kasa_durumu = 'BEKLIYOR' where id = h.id;

  perform log_audit('YANSIT', 'cari_hareketler', h.id::text,
    jsonb_build_object('islem_id', v_islem, 'tutar', h.tutar));
  return v_islem;
end;
$$;

-- ── Genel "Ödeme Topla": ödeme hareketi + pending kasa geliri, atomic ──

create or replace function public.topla_cari_odeme(
  p_cari uuid, p_tutar numeric, p_note text default ''
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  ci record;
  v_hareket uuid;
  v_islem uuid;
begin
  select * into ci from cari_isletmeler where id = p_cari;
  if not found then
    raise exception 'İşletme bulunamadı.';
  end if;
  if not is_finance(ci.business_id) then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;
  if p_tutar is null or p_tutar <= 0 then
    raise exception 'Geçerli bir tutar girin.';
  end if;

  -- born BEKLIYOR: bakiyeden hemen düşer; reddedilirse YOK'a döner (008)
  insert into cari_hareketler (cari_isletme_id, tur, tutar, note, kasa_durumu, created_by)
  values (p_cari, 'GIDER', p_tutar, coalesce(nullif(p_note, ''), 'Ödeme'), 'BEKLIYOR', auth.uid())
  returning id into v_hareket;

  insert into islemler
    (business_id, tur, tutar, baslik, kaynak, durum, islem_tarihi, created_by, cari_hareket_id)
  values
    (ci.business_id, 'GELIR', p_tutar,
     ci.name || ' — ' || coalesce(nullif(p_note, ''), 'Ödeme'),
     'CARI_HESAP', 'BEKLIYOR', istanbul_today(), auth.uid(), v_hareket)
  returning id into v_islem;

  perform log_audit('ODEME_TOPLA', 'cari_hareketler', v_hareket::text,
    jsonb_build_object('islem_id', v_islem, 'tutar', p_tutar));
  return v_islem;
end;
$$;
