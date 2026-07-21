-- ============================================================
-- PilotGarage — 044: Onay yalnızca Yönetici (owner request 2026-07-20)
--
-- Onay ekranı ve onaylama YETKİSİ artık yalnızca YONETICI'dedir. Muhasebe
-- finansın geri kalanını (işlem ekleme, silme, raporlar, cari, personel…)
-- aynen yapmaya devam eder; yapamadığı tek şey BEKLİYOR bir kaydı
-- sonuçlandırmaktır.
--
-- ÖNEMLİ — bu bir mimari değişikliktir: ARCHITECTURE.md'deki "Muhasebe =
-- Yönetici eksi rol kontrolü" tanımı artık "eksi rol kontrolü VE eksi Onay"
-- olarak okunmalıdır.
--
-- Ekranı gizlemek tek başına yetmez (istemci yalnızca kolaylıktır); asıl
-- sınır RPC'lerdedir:
--   approve_islem / reject_islem            (039 / 002 gövdesi)
--   approve_kayit_silme / reject_kayit_silme (013 gövdesi)
-- Yalnızca YETKİ SATIRI değişti; gövdeler birebir korundu.
--
-- Bildirimler de taşınır, yoksa Muhasebe açamadığı bir ekran için "onay
-- bekliyor" bildirimi almaya devam ederdi: ONAY/KAYIT_SILME bildirimleri
-- artık yalnızca Yöneticiye üretilir (`notify_yonetici`) ve 031'deki
-- görünürlük politikası da aynı şekilde daraltılır. `notify_finance`
-- DURUYOR — KAYIT bildirimleri (022) hâlâ finansın tamamına gider.
--
-- NOT: Yöneticinin `business_members` satırları 010'da eklendiği için
-- üyelik üzerinden yapılan bildirim join'i Yönetici için de çalışır.
-- ============================================================

-- ── Onay/Red: is_finance → is_yonetici ──

create or replace function public.approve_islem(
  p_islem_id uuid,
  p_odeme_yontemi public.odeme_yontemi default null,
  p_komisyon numeric default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v record;
  v_yontem public.odeme_yontemi;
  v_komisyon numeric;
begin
  select * into v from islemler where id = p_islem_id for update;
  if not found then
    raise exception 'İşlem bulunamadı.';
  end if;
  if not (is_yonetici() and can_access_business(v.business_id)) then
    raise exception 'İşlem onaylama yetkisi yalnızca Yöneticidedir.';
  end if;
  if v.durum <> 'BEKLIYOR' then
    raise exception 'İşlem zaten sonuçlandırılmış.';
  end if;
  if v.kaynak = 'KAYIT' and p_odeme_yontemi is null and v.odeme_yontemi is null then
    raise exception 'Kayıt işlemi onaylanırken ödeme yöntemi (Nakit / Kredi Kartı / Havale) seçilmelidir.';
  end if;
  if p_komisyon is not null and p_komisyon < 0 then
    raise exception 'Geçerli bir komisyon girin.';
  end if;

  v_yontem := coalesce(p_odeme_yontemi, v.odeme_yontemi);
  v_komisyon := nullif(coalesce(p_komisyon, v.komisyon, 0), 0);
  if v_komisyon is not null and v_yontem <> 'KREDI_KARTI' then
    v_komisyon := null;
  end if;
  if v_komisyon is not null and v_komisyon >= v.tutar then
    raise exception 'Komisyon işlem tutarından küçük olmalıdır.';
  end if;

  update islemler
  set durum = 'ONAYLANDI',
      onaylayan = auth.uid(),
      onaylanma_tarihi = now(),
      odeme_yontemi = coalesce(p_odeme_yontemi, odeme_yontemi)
  where id = p_islem_id;

  if v.cari_hareket_id is not null then
    update cari_hareketler set kasa_durumu = 'YANSIDI' where id = v.cari_hareket_id;
  end if;

  if v_komisyon is not null then
    insert into islemler
      (business_id, tur, tutar, baslik, kaynak, durum,
       islem_tarihi, created_by, onaylayan, onaylanma_tarihi, odeme_yontemi, komisyon_of)
    values
      (v.business_id, 'GIDER', v_komisyon,
       v.baslik || ' — bu işlemin komisyonu', 'MANUEL', 'ONAYLANDI',
       v.islem_tarihi, auth.uid(), auth.uid(), now(), 'KREDI_KARTI', p_islem_id);
  end if;

  perform log_audit('APPROVE', 'islemler', p_islem_id::text,
    jsonb_build_object(
      'tutar', v.tutar,
      'tur', v.tur,
      'kaynak', v.kaynak,
      'odeme_yontemi', coalesce(p_odeme_yontemi, v.odeme_yontemi),
      'komisyon', v_komisyon
    ));
end;
$$;

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

  perform log_audit('REJECT', 'islemler', p_islem_id::text,
    jsonb_build_object('tutar', v.tutar, 'tur', v.tur, 'kaynak', v.kaynak));
end;
$$;

-- ── Kayıt silme kararı da Onay ekranındadır: aynı daraltma ──

create or replace function public.reject_kayit_silme(p_kayit_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  k record;
begin
  select * into k from kayitlar where id = p_kayit_id for update;
  if not found then
    raise exception 'Kayıt bulunamadı.';
  end if;
  if not (is_yonetici() and can_access_business(k.business_id)) then
    raise exception 'Kayıt silme kararı yalnızca Yöneticiye aittir.';
  end if;
  if k.silme_talebi_at is null then
    raise exception 'Bu kayıt için silme isteği yok.';
  end if;

  update kayitlar
  set silme_talebi_by = null, silme_talebi_at = null
  where id = p_kayit_id;

  perform log_audit('REJECT_KAYIT_SILME', 'kayitlar', p_kayit_id::text,
    jsonb_build_object('plaka', k.plaka, 'talep_eden', k.silme_talebi_by));
end;
$$;

create or replace function public.approve_kayit_silme(p_kayit_id uuid)
returns text[]
language plpgsql security definer set search_path = public
as $$
declare
  k record;
  v_paths text[];
begin
  select * into k from kayitlar where id = p_kayit_id for update;
  if not found then
    raise exception 'Kayıt bulunamadı.';
  end if;
  if not (is_yonetici() and can_access_business(k.business_id)) then
    raise exception 'Kayıt silme kararı yalnızca Yöneticiye aittir.';
  end if;
  if k.silme_talebi_at is null then
    raise exception 'Bu kayıt için silme isteği yok.';
  end if;

  select coalesce(array_agg(storage_path), '{}')
  into v_paths
  from kayit_fotograflar
  where kayit_id = p_kayit_id;

  -- a queued-but-undecided gelir dies with the kayıt; decided işlemler are
  -- kasa history and survive with kayit_id detached (FK set null)
  delete from islemler where kayit_id = p_kayit_id and durum = 'BEKLIYOR';
  delete from kayitlar where id = p_kayit_id;

  perform log_audit('APPROVE_KAYIT_SILME', 'kayitlar', p_kayit_id::text,
    jsonb_build_object('plaka', k.plaka, 'musteri', k.musteri_adi,
                       'talep_eden', k.silme_talebi_by));
  return v_paths;
end;
$$;

-- ── Bildirimler: ONAY / KAYIT_SILME artık yalnızca Yöneticiye ──

create or replace function public.notify_yonetici(
  p_business uuid, p_type text, p_baslik text, p_body text, p_link text, p_exclude uuid
)
returns void
language sql security definer set search_path = public
as $$
  insert into notifications (profile_id, business_id, type, baslik, body, link)
  select bm.profile_id, p_business, p_type, p_baslik, p_body, p_link
  from business_members bm
  join profiles p on p.id = bm.profile_id
  where bm.business_id = p_business
    and p.status = 'ACTIVE' and p.role = 'YONETICI'
    and (p_exclude is null or bm.profile_id <> p_exclude)
$$;

-- 026 gövdesi + hedef daraltma (geri-al bayrağı korunur)
create or replace function public.notif_islem_bekliyor()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if current_setting('app.geri_al', true) = '1' then
    return new;
  end if;
  if new.durum = 'BEKLIYOR' then
    perform notify_yonetici(new.business_id, 'ONAY', 'Onay bekleyen işlem',
      new.baslik, '/yonetim/onay', new.created_by);
  end if;
  return new;
end;
$$;

create or replace function public.notif_kayit_silme()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.silme_talebi_at is not null and old.silme_talebi_at is null then
    perform notify_yonetici(new.business_id, 'KAYIT_SILME', 'Kayıt silme isteği',
      new.plaka, '/yonetim/onay', new.silme_talebi_by);
  end if;
  return new;
end;
$$;

-- 031 politikası: ONAY/KAYIT_SILME görünürlüğü de Yöneticiye daralır.
-- (Rol değişiminde eski satırlar kendiliğinden gizlenir/geri gelir.)
drop policy notifications_select_own on public.notifications;

create policy notifications_select_own on public.notifications
  for select using (
    profile_id = auth.uid()
    and public.auth_is_active()
    and case type
          when 'UYELIK'      then public.is_yonetici()
          when 'ONAY'        then public.is_yonetici() and public.can_access_business(business_id)
          when 'KAYIT_SILME' then public.is_yonetici() and public.can_access_business(business_id)
          else business_id is null or public.can_access_business(business_id)
        end
  );
