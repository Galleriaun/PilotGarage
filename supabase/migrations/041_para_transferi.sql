-- ============================================================
-- PilotGarage — 041: Hesaba Para Aktarımı (owner request 2026-07-20)
--
-- Nakit kovasındaki parayı Kredi Kartı kovasına taşır. Bir işlem satırı tek
-- bir ödeme yöntemi taşıdığı için transfer İKİ satırdır:
--   ana bacak  : GIDER  / NAKIT        (paranın çıktığı kova)
--   eş bacak   : GELIR  / KREDI_KARTI  (transfer_of = ana bacak)
-- Toplam bakiye DEĞİŞMEZ (iki bacak birbirini götürür); yalnızca kovalar kayar.
--
-- Owner kararları (2026-07-20):
--   • Onay'a girmez, anında işlenir (born ONAYLANDI) — kasa toplamı değişmediği
--     için onaylayacak yeni bir para girişi yok. Güvence: istemcideki onay
--     pop-up'ı.
--   • Ciro/gider toplamlarına GİRMEZ (iç aktarım) — v_kasa_ozet ve istemci
--     toplamları TRANSFER satırlarını dışlar; kova matematiği ise dâhil eder.
--   • Listede TEK satır görünür (ana bacak, üstünde Nakit → Kredi Kartı çipi);
--     eş bacak istemcide gizlenir ama DB'de durur (kova matematiği için).
--
-- Silme/çöp: iki bacak AYRILMAZ. delete_islem hangisi verilirse verilsin
-- ikisini birden siler (tek bacak silinse kasa dengesi bozulurdu) ve transfer
-- satırları ÇÖPE DÜŞMEZ — çöpten tek bacak geri alınsaydı kasa şişerdi.
-- Silme audit_log'da kayıtlı; transfer üç dokunuşla yeniden yapılabilir.
--
-- NOT (enum): 'TRANSFER' değeri eklendikten sonra AYNI transaction içinde
-- kullanılamaz ("unsafe use of new value"). Bu yüzden aşağıdaki karşılaştırmalar
-- `kaynak::text` üzerinden yapılır; enum değeri yalnızca çalışma zamanında
-- (RPC gövdesinde) kullanılır. Böylece dosya tek seferde çalışır.
-- ============================================================

alter type public.islem_kaynak add value if not exists 'TRANSFER';

alter table public.islemler
  add column if not exists transfer_of uuid references public.islemler (id) on delete set null;
create index if not exists islemler_transfer_of_idx on public.islemler (transfer_of)
  where transfer_of is not null;

-- ── Kasa özeti: transfer bacakları ciro/gidere girmez ──
-- Bakiye etkilenmez: iki bacak eşit ve zıt olduğu için ikisini birden dışlamak
-- gelir − gider farkını değiştirmez.

create or replace view public.v_kasa_ozet with (security_invoker = true) as
select
  b.id as business_id,
  coalesce(sum(i.tutar) filter (where i.tur = 'GELIR'), 0)::numeric(14,2) as toplam_gelir,
  coalesce(sum(i.tutar) filter (where i.tur = 'GIDER'), 0)::numeric(14,2) as toplam_gider,
  (coalesce(sum(i.tutar) filter (where i.tur = 'GELIR'), 0)
   - coalesce(sum(i.tutar) filter (where i.tur = 'GIDER'), 0))::numeric(14,2) as bakiye
from public.businesses b
left join public.islemler i
  on i.business_id = b.id
 and i.durum = 'ONAYLANDI'
 and i.kaynak::text <> 'TRANSFER'
group by b.id;

-- ── RPC: transferi tek atomik adımda yaz (iki bacak birlikte doğar) ──

create or replace function public.para_transferi(p_business uuid, p_tutar numeric)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_ana uuid;
begin
  if not is_finance(p_business) then
    raise exception 'Para transferi yetkiniz yok.';
  end if;
  if p_tutar is null or p_tutar <= 0 then
    raise exception 'Geçerli bir tutar girin.';
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
    jsonb_build_object('tutar', p_tutar, 'kaynak', 'NAKIT', 'hedef', 'KREDI_KARTI'));
  return v_ana;
end;
$$;

-- ── delete_islem: transferin İKİ bacağı birlikte silinir (039 gövdesi + 041) ──

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

  -- 041: transfer — hangi bacak verilirse verilsin ikisi birden gider.
  -- Sıra ÖNEMLİ: önce eş bacak(lar), sonra ana bacak. Ters sırada FK'nin
  -- ON DELETE SET NULL'ı eş bacakta UPDATE tetikler ve immutability guard'ı
  -- tökezletir (013 dersi).
  if v.kaynak::text = 'TRANSFER' then
    v_ana := coalesce(v.transfer_of, v.id);
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

  perform set_config('app.islem_sil', p_id::text, true);
  delete from islemler where id = p_id;
  perform set_config('app.islem_sil', '', true);

  perform log_audit('DELETE_ISLEM', 'islemler', p_id::text,
    jsonb_build_object('baslik', v.baslik, 'tutar', v.tutar, 'tur', v.tur,
                       'kaynak', v.kaynak, 'durum', v.durum));
end;
$$;

-- ── trash_capture: transfer bacakları çöpe düşmez (040 gövdesi + 041) ──

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
    -- 041: transferin tek bacağı çöpten geri alınırsa kasa dengesi bozulurdu;
    -- transfer satırları çöpe hiç düşmez (silme audit_log'da kayıtlı)
    if old.kaynak::text = 'TRANSFER' then
      return old;
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

-- ── islem_onaya_geri_gonder: transfer geri gönderilemez (040 gövdesi + 041) ──

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
