import type { KayitDurum } from './types'

// Pixel values from design/Auth.dc.html (status pills + durum menu).

export const DURUM_META: Record<KayitDurum, { label: string; bg: string; color: string }> = {
  AKTIF: { label: 'Aktif', bg: '#FEF3F2', color: '#C62828' },
  BEKLENEN: { label: 'Beklenen', bg: '#F2F2F2', color: '#555555' },
  TAMAMLANDI: { label: 'Tamamlandı', bg: '#F0FDF4', color: '#15803D' },
}

/** Softer variants used inside the durum dropdown menu on Kayıt Detay. */
export const DURUM_MENU_META: Record<KayitDurum, { bg: string; color: string }> = {
  AKTIF: { bg: '#FEF6F5', color: '#E08585' },
  BEKLENEN: { bg: '#F6F6F6', color: '#ADADAD' },
  TAMAMLANDI: { bg: '#F3FCF6', color: '#7FC79A' },
}

/** Yeni Kayıt's DURUM segmented control — selected-state colors. */
export const DURUM_SEGMENT_META: Record<KayitDurum, { bg: string; border: string }> = {
  AKTIF: { bg: '#C62828', border: '#C62828' },
  BEKLENEN: { bg: '#3A3A3A', border: '#3A3A3A' },
  TAMAMLANDI: { bg: '#15803D', border: '#15803D' },
}

export const DURUM_ORDER: KayitDurum[] = ['AKTIF', 'BEKLENEN', 'TAMAMLANDI']
