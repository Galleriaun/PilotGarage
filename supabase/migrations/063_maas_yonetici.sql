-- ============================================================
-- PilotGarage — 063: Maaş yalnızca Yönetici (öde / düzenle / sil / geri al) + çöpte Mesai geri alma
-- ============================================================

create or replace function public.pay_maas(
  p_profile uuid, p_business uuid,
  p_yontem public.odeme_yontemi default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  m record;
  v_name text;
  v_kategori uuid;
  v_islem uuid;
  v_borc numeric;
  v_dusulen numeric;
  v_net numeric;
begin
  if not (is_yonetici() and can_access_business(p_business)) then
    raise exception 'Maaş ödeme yetkisi yalnızca Yöneticidedir.';
  end if;
  select * into m from business_members
  where profile_id = p_profile and business_id = p_business;
  if not found then
    raise exception 'Personel bu işletmede kayıtlı değil.';
  end if;
  if m.maas <= 0 then
    raise exception 'Bu personel için maaş tanımlı değil.';
  end if;

  -- 059: aynı kişiye eşzamanlı iki maaş ödemesi aynı borcu iki kez düşmesin.
  -- Yetki/üyelik kontrollerinden SONRA alınır (reddedilecek çağrı kilit tutmaz),
  -- avans_borcu() okumasından ÖNCE alınır (asıl korunan aralık burası).
  perform pg_advisory_xact_lock(
    hashtext('maas:' || p_business::text || ':' || p_profile::text));

  select full_name into v_name from profiles where id = p_profile;
  select id into v_kategori
  from kategoriler
  where business_id = p_business and tur = 'GIDER'
    and label = 'Personel Maaşı' and is_active
  limit 1;

  -- 057: borç (bu dönemin avansı dahil) maaştan düşülür; aşan kısım defterde
  -- kalır ve kendiliğinden sonraki döneme devreder (ayrı devir kaydı yok).
  v_borc := avans_borcu(p_profile, p_business);
  v_dusulen := least(m.maas, v_borc);
  v_net := m.maas - v_dusulen;

  insert into islemler
    (business_id, tur, tutar, baslik, kategori_id, kaynak, durum,
     islem_tarihi, created_by, onaylayan, onaylanma_tarihi, odeme_yontemi)
  values
    (p_business, 'GIDER', v_net, v_name || ' — Maaş', v_kategori, 'PERSONEL',
     'ONAYLANDI', istanbul_today(), auth.uid(), auth.uid(), now(),
     coalesce(p_yontem, m.odeme_yontemi))
  returning id into v_islem;

  -- Deftere TAM maaş yazılır (tutar > 0 kısıtı korunur); ne kadarının borca
  -- sayıldığı avans_dusulen'de durur.
  insert into personel_odemeler
    (profile_id, business_id, tur, tutar, islem_id, created_by, avans_dusulen)
  values (p_profile, p_business, 'MAAS', m.maas, v_islem, auth.uid(), v_dusulen);

  perform log_audit('MAAS', 'personel_odemeler', p_profile::text,
    jsonb_build_object('tutar', m.maas, 'islem_id', v_islem,
                       'avans_dusulen', v_dusulen, 'net', v_net));
  return v_islem;
end;
$$;

create or replace function public.update_member_pay(
  p_profile uuid, p_business uuid, p_maas numeric, p_odeme_gunu int,
  p_yontem public.odeme_yontemi default null
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not (is_yonetici() and can_access_business(p_business)) then
    raise exception 'Maaş bilgisini güncelleme yetkisi yalnızca Yöneticidedir.';
  end if;
  if p_maas is null or p_maas < 0 or p_maas <> round(p_maas, 2) then
    raise exception 'Geçersiz maaş.';
  end if;
  if p_odeme_gunu is null or p_odeme_gunu not between 0 and 28 then
    raise exception 'Geçersiz ödeme günü (0–28).';
  end if;

  update business_members
  set maas = p_maas, odeme_gunu = p_odeme_gunu, odeme_yontemi = p_yontem
  where profile_id = p_profile and business_id = p_business;
  if not found then
    raise exception 'Üyelik bulunamadı.';
  end if;

  perform log_audit('UPDATE_PAY', 'business_members', p_profile::text,
    jsonb_build_object('business_id', p_business, 'maas', p_maas,
                       'odeme_gunu', p_odeme_gunu, 'odeme_yontemi', p_yontem));
end;
$$;

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
  -- fail-closed: defter satırının AVANS/PRIM olduğu kesin değilse maaş sayılır
  if v.kaynak = 'PERSONEL' and not is_yonetici()
     and not exists (select 1 from personel_odemeler
                     where islem_id = p_id and tur in ('AVANS', 'PRIM')) then
    raise exception 'Maaş ödemesini silme yetkisi yalnızca Yöneticidedir.';
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
    -- silinmiş maaş avans/primden ayırt edilemez (defter satırı işlemle gitti)
    if r->>'kaynak' = 'PERSONEL' and not is_yonetici() then
      raise exception 'Personel ödemesini geri alma yetkisi yalnızca Yöneticidedir.';
    end if;
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
    -- ana işlem gitmişse komisyon bağını kopar (öksüz komisyon geri alınabilir)
    if r->>'komisyon_of' is not null
       and not exists (select 1 from islemler where id = (r->>'komisyon_of')::uuid) then
      r := jsonb_set(r, '{komisyon_of}', 'null');
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
