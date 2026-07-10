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
  durum: KayitDurum
  notlar: string
  /** Set = a silme isteği is waiting in the Onay queue (013). RPC-only. */
  silme_talebi_by: string | null
  silme_talebi_at: string | null
  created_at: string
  paket: Paket | null
  fotograflar: KayitFoto[]
  /** NULL = deleted account. */
  creator: { full_name: string } | null
}

export interface KayitFields {
  musteri_adi: string
  plaka: string
  marka: string
  model: string
  yil: number | null
  km: number | null
  ruhsat_no: string
  paket_id: string | null
  tarih: string
  notlar: string
}
