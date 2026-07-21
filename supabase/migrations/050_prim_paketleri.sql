-- ============================================================
-- PilotGarage — 050: Prim paketleri (owner request 2026-07-21)
--
-- Yönetici, İşletme Ayarları'nda ad + tutar taşıyan "prim paketleri" tanımlar
-- (ekle/düzenle/sil). Prim Ver ekranında finans, tutar alanının üstünde bu
-- paketlerden istediğini seçer: seçilenlerin tutarı otomatik toplanır (canlı),
-- işlem açıklaması seçilen paket adları olur. Hiç paket seçilmezse eski gibi
-- elle tutar + açıklama girilir ve açıklama işleme yazılır.
--
-- Paketler yalnızca bir ŞABLONDUR: prim işlemi oluşturulurken tutar ve ad
-- işleme KOPYALANIR (baslik + personel_odemeler.note). Hiçbir FK paketi
-- referanslamaz — bu yüzden silme HARD delete'tir, geçmişi etkilemez.
--
-- Yetki: yönetim (ekle/düzenle/sil) yalnızca Yönetici (İşletme Ayarları 047
-- ile zaten Yönetici-only). Okuma finans-geneli, çünkü Prim Ver ekranını
-- (dolayısıyla seçiciyi) Muhasebe de kullanır (give_prim hâlâ is_finance).
-- Sınır RLS'te; ekranı gizlemek tek başına güvenlik değil (044 dersi).
-- ============================================================

create table public.prim_paketleri (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  tutar numeric(12,2) not null check (tutar > 0),
  created_at timestamptz not null default now()
);
create index prim_paketleri_business_idx on public.prim_paketleri (business_id);

alter table public.prim_paketleri enable row level security;

-- Okuma: finans (Prim Ver seçicisi + İşletme Ayarları listesi)
create policy prim_paketleri_select on public.prim_paketleri
  for select using (public.is_finance(business_id));

-- Yazma: yalnızca Yönetici (İşletme Ayarları Yönetici-only, 047)
create policy prim_paketleri_insert on public.prim_paketleri
  for insert with check (public.is_yonetici() and public.can_access_business(business_id));

create policy prim_paketleri_update on public.prim_paketleri
  for update using (public.is_yonetici() and public.can_access_business(business_id))
  with check (public.is_yonetici() and public.can_access_business(business_id));

create policy prim_paketleri_delete on public.prim_paketleri
  for delete using (public.is_yonetici() and public.can_access_business(business_id));

-- ── give_prim: işlem başlığı p_note'tan türetilir (045 gövdesi + 050) ──
-- p_note = seçilen paket adları (varsa) YA DA serbest açıklama. baslik ona
-- göre kurulur; boşsa "Prim"e düşer. İmza DEĞİŞMEDİ.

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
    (p_business, 'GIDER', p_tutar,
     v_name || ' — ' || coalesce(nullif(trim(p_note), ''), 'Prim'),
     v_kategori, 'PERSONEL', 'BEKLIYOR', istanbul_today(), auth.uid())
  returning id into v_islem;

  insert into personel_odemeler (profile_id, business_id, tur, tutar, note, islem_id, created_by)
  values (p_profile, p_business, 'PRIM', p_tutar, coalesce(p_note, ''), v_islem, auth.uid());

  perform log_audit('PRIM', 'personel_odemeler', p_profile::text,
    jsonb_build_object('tutar', p_tutar, 'islem_id', v_islem, 'durum', 'BEKLIYOR'));
  return v_islem;
end;
$$;
