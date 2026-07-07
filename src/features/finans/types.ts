import type { OdemeYontemi } from '../../lib/types'

export type IslemTur = 'GELIR' | 'GIDER'
export type IslemDurum = 'BEKLIYOR' | 'ONAYLANDI' | 'REDDEDILDI'
export type IslemKaynak = 'MANUEL' | 'KAYIT' | 'CARI_HESAP' | 'SABIT_GIDER' | 'PERSONEL'
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
  created_at: string
  kategori: { id: string; label: string; tur: IslemTur } | null
}

export interface SabitGider {
  id: string
  business_id: string
  name: string
  tutar: number | string
  odeme_gunu: number
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

export const ODEME_YONTEMI_LABELS: Record<'NAKIT' | 'KREDI_KARTI', string> = {
  NAKIT: 'Nakit',
  KREDI_KARTI: 'Kredi Kartı',
}
