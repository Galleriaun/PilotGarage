-- ============================================================
-- PilotGarage — 030: Mesai düzeltme (finans: manuel ekle / güncelle / sil)
-- (owner request 2026-07-13)
--
-- Personel yalnızca kendi telefonundan giriş/çıkış yapar (029). Biri çıkış
-- yapmayı unutursa oturum sonsuza dek "devam ediyor" kalır ve toplam saatleri
-- bozar. Bu migrasyon FINANS'a (Yönetici + Muhasebe) düzeltme yetkisi verir:
--   • mesai_manuel_ekle   — elle giriş/çıkış kaydı ekle
--   • mesai_kayit_guncelle — bir kaydın saatini değiştir
--   • mesai_kayit_sil     — kaydı sil (çöpe düşer, "Geri al" ile döner)
-- Personel'in doğrudan yazma yolu YOKTUR (RLS değişmedi; hepsi SECURITY DEFINER
-- RPC ve is_finance() ile korunur). Elle eklenen kayıtlar 'MANUEL' kaynaklıdır.
-- ============================================================

alter type public.mesai_kaynak add value if not exists 'MANUEL';

-- ── Manuel kayıt ekle (finans) ──
create or replace function public.mesai_manuel_ekle(
  p_business uuid,
  p_profile uuid,
  p_tip public.mesai_tip,
  p_zaman timestamptz
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_finance(p_business) then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;
  if not exists (select 1 from business_members
                 where business_id = p_business and profile_id = p_profile) then
    raise exception 'Personel bu işletmede kayıtlı değil.';
  end if;
  if p_zaman > now() + interval '5 minutes' then
    raise exception 'Gelecek bir zaman girilemez.';
  end if;

  insert into mesai_kayitlari
    (profile_id, business_id, tip, kaynak, mesafe_m, lat, lng, ip, created_at)
  values (p_profile, p_business, p_tip, 'MANUEL', null, null, null, '', p_zaman)
  returning id into v_id;

  perform log_audit('MESAI_MANUEL_EKLE', 'mesai_kayitlari', v_id::text,
    jsonb_build_object('profile', p_profile, 'tip', p_tip, 'zaman', p_zaman));
  return v_id;
end;
$$;

-- ── Kaydın saatini güncelle (finans) ──
create or replace function public.mesai_kayit_guncelle(
  p_kayit uuid,
  p_zaman timestamptz
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_business uuid;
begin
  select business_id into v_business from mesai_kayitlari where id = p_kayit;
  if v_business is null then
    raise exception 'Kayıt bulunamadı.';
  end if;
  if not public.is_finance(v_business) then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;
  if p_zaman > now() + interval '5 minutes' then
    raise exception 'Gelecek bir zaman girilemez.';
  end if;

  update mesai_kayitlari set created_at = p_zaman where id = p_kayit;
  perform log_audit('MESAI_GUNCELLE', 'mesai_kayitlari', p_kayit::text,
    jsonb_build_object('zaman', p_zaman));
end;
$$;

-- ── Kaydı sil (finans) → trash_capture çöpe alır ──
create or replace function public.mesai_kayit_sil(p_kayit uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_business uuid;
begin
  select business_id into v_business from mesai_kayitlari where id = p_kayit;
  if v_business is null then
    raise exception 'Kayıt bulunamadı.';
  end if;
  if not public.is_finance(v_business) then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;

  delete from mesai_kayitlari where id = p_kayit;
  perform log_audit('MESAI_SIL', 'mesai_kayitlari', p_kayit::text, '{}'::jsonb);
end;
$$;

grant execute on function
  public.mesai_manuel_ekle(uuid, uuid, public.mesai_tip, timestamptz) to authenticated;
grant execute on function public.mesai_kayit_guncelle(uuid, timestamptz) to authenticated;
grant execute on function public.mesai_kayit_sil(uuid) to authenticated;

-- ── Çöp entegrasyonu: mesai_kayitlari silinince snapshot (kendi trigger'ı;
--    paylaşılan trash_capture()'a dokunmadan) ──
create or replace function public.trash_capture_mesai()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_ad text;
begin
  -- İşletme/personel cascade temizliğinde çöpü doldurma
  if not exists (select 1 from businesses where id = old.business_id)
     or not exists (select 1 from profiles where id = old.profile_id) then
    return old;
  end if;
  select coalesce(full_name, '?') into v_ad from profiles where id = old.profile_id;
  insert into trash (business_id, item_type, title, payload, deleted_by)
  values (old.business_id, 'MESAI',
          v_ad || ' — ' || case when old.tip = 'GIRIS' then 'Giriş' else 'Çıkış' end,
          to_jsonb(old), auth.uid());
  return old;
end;
$$;

drop trigger if exists trash_mesai on public.mesai_kayitlari;
create trigger trash_mesai after delete on public.mesai_kayitlari
for each row execute function public.trash_capture_mesai();

-- ── restore_trash: MESAI dalını ekle (diğer dallar 026'daki gibi korunur) ──
create or replace function public.restore_trash(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  t record;
  r jsonb;
begin
  select * into t from trash where id = p_id for update;
  if not found then
    raise exception 'Öğe bulunamadı.';
  end if;
  if not is_finance(t.business_id) then
    raise exception 'Geri alma yetkiniz yok.';
  end if;
  r := t.payload;
  perform set_config('app.geri_al', '1', true);

  if t.item_type = 'KAYIT' then
    r := r || '{"silme_talebi_by": null, "silme_talebi_at": null}'::jsonb;
    if r->>'paket_id' is not null
       and not exists (select 1 from paketler where id = (r->>'paket_id')::uuid) then
      r := jsonb_set(r, '{paket_id}', 'null');
    end if;
    insert into kayitlar select * from jsonb_populate_record(null::public.kayitlar, r);

  elsif t.item_type = 'ISLETME' then
    insert into cari_isletmeler
    select * from jsonb_populate_record(null::public.cari_isletmeler, r);

  elsif t.item_type = 'HAREKET' then
    if not exists (select 1 from cari_isletmeler
                   where id = (r->>'cari_isletme_id')::uuid) then
      raise exception 'Bağlı işletme silinmiş — hareket geri alınamaz.';
    end if;
    if r->>'tekrar_kural_id' is not null
       and not exists (select 1 from tekrar_kurallari
                       where id = (r->>'tekrar_kural_id')::uuid) then
      r := jsonb_set(r, '{tekrar_kural_id}', 'null');
    end if;
    insert into cari_hareketler
    select * from jsonb_populate_record(null::public.cari_hareketler, r);

  elsif t.item_type = 'SABIT_GIDER' then
    insert into sabit_giderler
    select * from jsonb_populate_record(null::public.sabit_giderler, r);

  elsif t.item_type = 'TEKRAR' then
    if r->>'cari_isletme_id' is not null
       and not exists (select 1 from cari_isletmeler
                       where id = (r->>'cari_isletme_id')::uuid) then
      raise exception 'Bağlı işletme silinmiş — kural geri alınamaz.';
    end if;
    insert into tekrar_kurallari
    select * from jsonb_populate_record(null::public.tekrar_kurallari, r);

  elsif t.item_type = 'ISLEM' then
    if r->>'kayit_id' is not null
       and not exists (select 1 from kayitlar where id = (r->>'kayit_id')::uuid) then
      r := jsonb_set(r, '{kayit_id}', 'null');
    end if;
    if r->>'cari_hareket_id' is not null
       and not exists (select 1 from cari_hareketler
                       where id = (r->>'cari_hareket_id')::uuid) then
      r := jsonb_set(r, '{cari_hareket_id}', 'null');
    end if;
    if r->>'sabit_gider_id' is not null
       and not exists (select 1 from sabit_giderler
                       where id = (r->>'sabit_gider_id')::uuid) then
      r := jsonb_set(r, '{sabit_gider_id}', 'null');
    end if;
    if r->>'tekrar_kural_id' is not null
       and not exists (select 1 from tekrar_kurallari
                       where id = (r->>'tekrar_kural_id')::uuid) then
      r := jsonb_set(r, '{tekrar_kural_id}', 'null');
    end if;
    insert into islemler select * from jsonb_populate_record(null::public.islemler, r);
    if r->>'cari_hareket_id' is not null then
      update cari_hareketler
      set kasa_durumu = case when r->>'durum' = 'ONAYLANDI' then 'YANSIDI'
                             when r->>'durum' = 'BEKLIYOR' then 'BEKLIYOR'
                             else kasa_durumu end::public.kasa_durum
      where id = (r->>'cari_hareket_id')::uuid;
    end if;

  elsif t.item_type = 'MESAI' then
    if not exists (select 1 from businesses where id = (r->>'business_id')::uuid) then
      raise exception 'Bağlı işletme silinmiş — kayıt geri alınamaz.';
    end if;
    if not exists (select 1 from profiles where id = (r->>'profile_id')::uuid) then
      raise exception 'Bağlı personel silinmiş — kayıt geri alınamaz.';
    end if;
    insert into mesai_kayitlari
    select * from jsonb_populate_record(null::public.mesai_kayitlari, r);

  else
    raise exception 'Bilinmeyen öğe türü.';
  end if;

  perform set_config('app.geri_al', '', true);
  delete from trash where id = p_id;

  perform log_audit('RESTORE', 'trash', p_id::text,
    jsonb_build_object('type', t.item_type, 'title', t.title));
end;
$$;
