import type { OdemeYontemi } from '../../lib/types'

export type IslemTur = 'GELIR' | 'GIDER'
export type IslemDurum = 'BEKLIYOR' | 'ONAYLANDI' | 'REDDEDILDI'
export type IslemKaynak =
  | 'MANUEL'
  | 'KAYIT'
  | 'CARI_HESAP'
  | 'SABIT_GIDER'
  | 'PERSONEL'
  /** Hesaba Para Aktarımı bacağı (041) — iç aktarım, ciro/gidere sayılmaz. */
  | 'TRANSFER'
export type TekrarSiklik = 'HAFTALIK' | 'AYLIK' | 'YILLIK'

export interface Kategori {
  id: string
  business_id: string
  tur: IslemTur
  label: string
  is_active: boolean
}

/** İşlem row as it comes from PostgREST, plus a client-side integer kuruş. */
export interface Islem {
  id: string
  business_id: string
  tur: IslemTur
  tutar: number | string
  kurus: number // derived once at fetch — all client arithmetic uses this
  baslik: string
  kategori_id: string | null
  kaynak: IslemKaynak
  durum: IslemDurum
  islem_tarihi: string // YYYY-MM-DD
  odeme_yontemi: OdemeYontemi | null
  /** KK komisyonu (033): pending rows carry it until approval deducts it. */
  komisyon: number | string | null
  /** KAYIT kaynaklı işlemin kaydı; NULL = kayıt silinmiş (013). "Oluşturulduğu
   *  yere git" (kayıt detayı) için. */
  kayit_id: string | null
  /** CARI_HESAP işlem with NULL here = its işletme was deleted (015). */
  cari_hareket_id: string | null
  /** Non-null = this row IS a KK komisyon gideri linked to its parent (039). */
  komisyon_of: string | null
  /** Non-null = transferin EŞ bacağı (KK girişi); listede gizlenir (041). */
  transfer_of: string | null
  /** Non-null = bu satır, işaret ettiği aktarımın GERİ ALMA'sıdır (042). */
  iade_of: string | null
  /** Non-null = cron'un ürettiği sabit gider işlemi (016) — born-ONAYLANDI,
   *  Onay'dan hiç geçmez. */
  sabit_gider_id: string | null
  /** Non-null = cron'un ürettiği tekrar kuralı işlemi (019) — born-ONAYLANDI,
   *  Onay'dan hiç geçmez. kaynak MANUEL olduğu için TEK ayırt edici bu. */
  tekrar_kural_id: string | null
  created_at: string
  kategori: { id: string; label: string; tur: IslemTur } | null
  /** NULL = system entry (cron) or deleted account. */
  creator: { full_name: string } | null
  /** CARI_HESAP kaynağının işletmesi — "oluşturulduğu yere git" (işletme
   *  detayı) için. NULL = hareket/işletme silinmiş (015). */
  cari_hareket: { cari_isletme_id: string } | null
  /** PERSONEL kaynağının (avans/prim/maaş) personeli — 0 ya da 1 satır.
   *  "Oluşturulduğu yere git" (personel detayı) için. */
  personel_odeme: { profile_id: string }[]
}

export interface SabitGider {
  id: string
  business_id: string
  name: string
  tutar: number | string
  odeme_gunu: number
  kategori_id: string | null
}

export interface TekrarKural {
  id: string
  business_id: string
  tur: IslemTur
  tutar: number | string
  baslik: string
  kategori_id: string | null
  siklik: TekrarSiklik
  next_run: string
  is_active: boolean
}

/** A kayıt whose deletion is waiting in the Onay queue (013). */
export interface KayitSilmeTalebi {
  id: string
  business_id: string
  plaka: string
  musteri_adi: string
  silme_talebi_at: string
  talep_eden: { full_name: string } | null
}

export const ODEME_YONTEMI_LABELS: Record<OdemeYontemi, string> = {
  NAKIT: 'Nakit',
  KREDI_KARTI: 'Kredi Kartı',
  HAVALE: 'Havale',
}

/** Chip colors: Nakit green, Kredi Kartı blue, Havale purple. */
export const ODEME_YONTEMI_CHIP: Record<OdemeYontemi, { bg: string; color: string }> = {
  NAKIT: { bg: '#F0FDF4', color: '#15803D' },
  KREDI_KARTI: { bg: '#EEF4FF', color: '#2A5BD7' },
  HAVALE: { bg: '#F5F0FF', color: '#7C3AED' },
}
