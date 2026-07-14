import type { OdemeYontemi } from '../../lib/types'

export type KayitDurum = 'AKTIF' | 'BEKLENEN' | 'TAMAMLANDI'

export interface Paket {
  id: string
  name: string
  price: number | string // NUMERIC arrives as JSON number via PostgREST
}

export interface KayitFoto {
  id: string
  kayit_id: string
  storage_path: string
  created_at: string
}

export interface Kayit {
  id: string
  business_id: string
  musteri_adi: string
  plaka: string
  marka: string
  model: string
  yil: number | null
  km: number | null
  ruhsat_no: string
  paket_id: string | null
  tarih: string // YYYY-MM-DD
  /** "HH:MM:SS" (time column) or null — 30-min slots 09:00–21:00. */
  baslangic_saati: string | null
  bitis_saati: string | null
  durum: KayitDurum
  notlar: string
  /** Müşteri cep no, ulusal kısım "5XXXXXXXXX" (035); '' = girilmedi. */
  musteri_tel: string
  /** Finans kaydında baştan girilen tutar/yöntem/komisyon (034); yoksa null. */
  tutar: number | string | null
  odeme_yontemi: OdemeYontemi | null
  komisyon: number | string | null
  /** Set = a silme isteği is waiting in the Onay queue (013). RPC-only. */
  silme_talebi_by: string | null
  silme_talebi_at: string | null
  created_at: string
  paket: Paket | null
  fotograflar: KayitFoto[]
  /** The kayıt's queued gelir(ler) — empty for Personel (islemler RLS). */
  gelirler: { durum: 'BEKLIYOR' | 'ONAYLANDI' | 'REDDEDILDI' }[]
  /** NULL = deleted account. */
  creator: { full_name: string } | null
}

export interface KayitFields {
  musteri_adi: string
  musteri_tel: string
  plaka: string
  marka: string
  model: string
  yil: number | null
  km: number | null
  ruhsat_no: string
  paket_id: string | null
  tarih: string
  baslangic_saati: string | null
  bitis_saati: string | null
  notlar: string
}

/** Finance-only kayıt fields, set at creation (034). NUMERIC values as strings. */
export interface KayitFinansAlanlari {
  tutar: string | null
  odeme_yontemi: OdemeYontemi | null
  komisyon: string | null
}
