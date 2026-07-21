-- ============================================================
-- PilotGarage — 048: İzinler / yıllık izin (owner request 2026-07-21)
--
-- Personel Detay'a "Yıllık İzin" ekranı: tarih aralıklı izin kayıtları.
-- Bugün (Istanbul) bir iznin içindeyse kişi "İzinde" görünür — Personel
-- listesi kartında, Personel Detay başlığında ve Mesai Kayıtları'nda.
--
-- Yetki KADEMELİ (owner kararı) ve sınır BURADA, ekranda değil:
--   * Muhasebe yalnızca PERSONEL rolündeki üyelerin iznini yönetir;
--   * Yönetici herkesinkini (Muhasebe ve Yönetici dâhil) yönetir.
-- Hedefin rolü `izin_yazabilir` SECURITY DEFINER yardımcıyla okunur —
-- politika içinde profiles'a doğrudan bakılsaydı sorgu, çağıranın
-- profiles RLS'inden geçer ve rol görünmeyebilirdi.
--
-- Okuma: işletmenin finansı (Yönetici + Muhasebe) hepsini görür — rozet
-- Muhasebe/Yönetici üyeler için de çizilir, görmek yönetmek değildir.
-- Personelin kendi iznini görmesi bu sürümde yok (ekran finans-tarafı).
--
-- Güncelleme yolu yok (sil + yeniden ekle); çakışan aralıklar trigger'la
-- reddedilir (aynı kişi + işletme, uçlar dâhil).
-- ============================================================

create table public.izinler (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  baslangic date not null,
  bitis date not null,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (bitis >= baslangic)
);
create index izinler_kisi_idx on public.izinler (business_id, profile_id, baslangic);

alter table public.izinler enable row level security;
revoke update on public.izinler from anon, authenticated;

-- ── Kademeli yazma yetkisi (hedefin rolüne göre) ──
-- Hedef o işletmenin üyesi olmalı (PENDING/başka işletme kendiliğinden düşer).

create or replace function public.izin_yazabilir(p_business uuid, p_profile uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
      select 1 from business_members m
      where m.business_id = p_business and m.profile_id = p_profile
    )
    and case (select role from profiles where id = p_profile)
      when 'PERSONEL' then public.is_finance(p_business)
      else public.is_yonetici() and public.can_access_business(p_business)
    end
$$;

create policy izinler_select on public.izinler
  for select using (public.is_finance(business_id));

create policy izinler_insert on public.izinler
  for insert with check (
    public.izin_yazabilir(business_id, profile_id)
    and created_by = auth.uid()
  );

create policy izinler_delete on public.izinler
  for delete using (public.izin_yazabilir(business_id, profile_id));

-- ── Çakışma koruması ──
-- Aynı kişinin aynı işletmedeki iki izni kesişemez (uçlar dâhil).
-- Advisory lock eşzamanlı iki eklemenin ikisinin de kontrolü geçmesini önler.

create or replace function public.izin_cakisma_kontrol()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(
    hashtext('izin:' || new.business_id::text || ':' || new.profile_id::text)
  );
  if exists (
    select 1 from izinler
    where business_id = new.business_id
      and profile_id = new.profile_id
      and id <> new.id
      and baslangic <= new.bitis
      and bitis >= new.baslangic
  ) then
    raise exception 'Bu aralık mevcut bir izinle çakışıyor.';
  end if;
  return new;
end;
$$;

create trigger izin_cakisma_bi
before insert on public.izinler
for each row execute function public.izin_cakisma_kontrol();
