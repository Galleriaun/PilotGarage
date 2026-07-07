-- ============================================================
-- PilotGarage — 005: Seed (idempotent)
-- The two businesses + default gelir/gider categories for each.
-- No user seed: sign up in the app, then promote the first Yönetici
-- with the bootstrap snippet in SETUP.md.
-- ============================================================

insert into public.businesses (code, name) values
  ('SERVIS', 'PilotGarage'),
  ('GALERI', 'Arabam.com')
on conflict (code) do nothing;

insert into public.kategoriler (business_id, tur, label)
select b.id, x.tur::public.islem_tur, x.label
from public.businesses b
cross join (
  values
    ('GELIR', 'Servis Ücreti'),
    ('GELIR', 'Parça Satışı'),
    ('GELIR', 'Diğer'),
    ('GIDER', 'Personel Maaşı'),
    ('GIDER', 'Kira'),
    ('GIDER', 'Parça Tedariki'),
    ('GIDER', 'Diğer')
) as x(tur, label)
where not exists (
  select 1 from public.kategoriler k
  where k.business_id = b.id
    and k.tur = x.tur::public.islem_tur
    and k.label = x.label
);
