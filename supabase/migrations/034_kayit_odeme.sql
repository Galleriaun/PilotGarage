-- ============================================================
-- PilotGarage — 034: Kayıtta tutar + ödeme yöntemi + komisyon (finans)
-- (owner request 2026-07-13)
--
-- Yönetici/Muhasebe bir kayıt oluştururken artık gelir TUTARINI (paket
-- fiyatını override), ÖDEME YÖNTEMİNİ (Nakit/KK/Havale) ve KK için KOMİSYONU
-- baştan girebilir. Kayıt TAMAMLANDI olunca gelir bu değerlerle doğar; ödeme
-- yöntemi dolu olduğundan Onay'da tekrar yöntem seçilmez. Personelin oluşturduğu
-- kayıtlarda bu alanlar boştur → yöntem eskisi gibi Onay'da seçilir.
--
-- Güvenlik: alanlar finans dışı kullanıcı için server-side sıfırlanır (strip
-- trigger), personelin doğrudan API ile fiyat/yöntem set etmesi engellenir.
-- approve_islem (033) zaten saklı yöntem/komisyona düşüyor — RPC değişmedi.
-- ============================================================

alter table public.kayitlar
  add column tutar numeric(12,2) check (tutar is null or tutar > 0),
  add column odeme_yontemi public.odeme_yontemi,
  add column komisyon numeric(12,2) check (komisyon is null or komisyon >= 0);

-- Finans bu kolonları yazabilsin (rol kontrolü strip trigger'da)
grant insert (tutar, odeme_yontemi, komisyon) on public.kayitlar to authenticated;
grant update (tutar, odeme_yontemi, komisyon) on public.kayitlar to authenticated;

-- ── Finans-only enforcement ──
-- Finans dışı: INSERT'te sıfırla; UPDATE'te ESKİ değere sabitle (personelin
-- bir finans kaydını düzenlerken para alanlarını silmesini/değiştirmesini önle).
create or replace function public.kayit_finans_alanlari()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_finance(new.business_id) then
    if tg_op = 'UPDATE' then
      new.tutar := old.tutar;
      new.odeme_yontemi := old.odeme_yontemi;
      new.komisyon := old.komisyon;
    else
      new.tutar := null;
      new.odeme_yontemi := null;
      new.komisyon := null;
    end if;
  end if;
  -- komisyon yalnızca kredi kartında anlamlı
  if new.odeme_yontemi is distinct from 'KREDI_KARTI' then
    new.komisyon := null;
  end if;
  return new;
end;
$$;

drop trigger if exists kayit_finans_alanlari_bi on public.kayitlar;
create trigger kayit_finans_alanlari_bi
before insert or update on public.kayitlar
for each row execute function public.kayit_finans_alanlari();

-- ── Tamamlandı → gelir: tutar override + yöntem + komisyon ──
-- 026'daki gövde korunur; yalnızca tutar/yöntem/komisyon eklenir.
create or replace function public.kayit_tamamlandi_islem()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_paket_name text;
  v_paket_price numeric;
  v_tutar numeric;
  v_komisyon numeric;
  v_kategori uuid;
  v_was_tamamlandi boolean;
begin
  if current_setting('app.geri_al', true) = '1' then
    return new; -- restore: geliri zaten var (ya da karar verildi)
  end if;
  if tg_op = 'INSERT' then
    v_was_tamamlandi := false;
  else
    v_was_tamamlandi := (old.durum = 'TAMAMLANDI');
  end if;

  if new.durum = 'TAMAMLANDI' and not v_was_tamamlandi then
    if new.paket_id is not null then
      select name, price into v_paket_name, v_paket_price
      from paketler where id = new.paket_id;
    end if;
    -- finans özel tutar girmişse onu, yoksa paket fiyatını kullan
    v_tutar := coalesce(new.tutar, v_paket_price);
    if v_tutar is not null and v_tutar > 0
       and not exists (select 1 from islemler
                       where kayit_id = new.id and durum <> 'REDDEDILDI') then
      select id into v_kategori
      from kategoriler
      where business_id = new.business_id and tur = 'GELIR'
        and label = 'Servis Ücreti' and is_active
      limit 1;
      -- komisyon yalnızca KK + geçerli (tutardan küçük) ise taşınır
      v_komisyon := case
        when new.odeme_yontemi = 'KREDI_KARTI' and new.komisyon is not null
             and new.komisyon < v_tutar then new.komisyon
        else null end;
      insert into islemler
        (business_id, tur, tutar, baslik, kategori_id, kaynak, durum,
         islem_tarihi, created_by, kayit_id, odeme_yontemi, komisyon)
      values
        (new.business_id, 'GELIR', v_tutar,
         new.plaka || ' — ' || coalesce(v_paket_name, 'Servis'),
         v_kategori, 'KAYIT', 'BEKLIYOR', istanbul_today(), auth.uid(), new.id,
         new.odeme_yontemi, v_komisyon);
    end if;
  elsif v_was_tamamlandi and new.durum <> 'TAMAMLANDI' then
    delete from islemler where kayit_id = new.id and durum = 'BEKLIYOR';
  end if;
  return new;
end;
$$;
