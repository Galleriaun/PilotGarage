import type { AccountStatus, Role } from '../../lib/types'
import type { IslemTur } from '../finans/types'

export interface Member {
  profile_id: string
  business_id: string
  maas: number | string
  odeme_gunu: number
  profile: {
    id: string
    full_name: string
    role: Role | null
    status: AccountStatus
  }
}

/** Prim paketi (050): ad + tutar şablonu; Prim Ver ekranındaki seçicide kullanılır. */
export interface PrimPaket {
  id: string
  business_id: string
  name: string
  tutar: number | string
}

export interface PersonelOdeme {
  id: string
  profile_id: string
  business_id: string
  tur: 'MAAS' | 'AVANS' | 'PRIM'
  tutar: number | string
  note: string
  tarih: string
  created_at: string
  /** 045: avans/prim Onay'dan geçer — gerçek durum bağlı işlemden okunur.
   *  MAAŞ born-ONAYLANDI olduğu için orada hep 'ONAYLANDI' gelir.
   *  null = bağlı işlem yok: eski/kasa-dışı avans (045 öncesi kayıtlar ya da
   *  işlemi kaldırılmış satır) — GERÇEK, verilmiş bir avanstır. */
  islem: { durum: 'BEKLIYOR' | 'ONAYLANDI' | 'REDDEDILDI' } | null
}

/**
 * "Verilmiş" sayılır mı? (rozet ve toplamlar için)
 *
 * YALNIZCA gerçekten ONAY BEKLEYEN — yani bağlı işlemi hâlâ `BEKLIYOR` olan
 * (045 sonrası, henüz onaylanmamış) avans/prim — hariç tutulur. Diğer her şey
 * verilmiştir:
 *   • `islem === null` → eski/kasa-dışı avans (işlem linki yok). Deploy'daki
 *     eski kod bunları personel defterinden toplayıp "verilmiş" gösteriyordu;
 *     biz de öyle sayarız — aksi hâlde gerçek avanslar "Onay bekliyor" diye
 *     yanlış işaretlenip toplamdan düşerdi (saha hatası, 2026-07-21).
 *   • `ONAYLANDI` → onaylı, kasada.
 * `REDDEDILDI` reddedilmiş demektir (045 sonrası bu satır zaten silinir);
 * verilmiş sayılmaz.
 */
export function odemeOnayli(o: PersonelOdeme): boolean {
  return o.islem === null || o.islem.durum === 'ONAYLANDI'
}

export interface CariHareket {
  id: string
  cari_isletme_id: string
  tur: IslemTur
  tutar: number | string
  note: string
  tarih: string
  kasa_durumu: 'YOK' | 'BEKLIYOR' | 'YANSIDI'
  /** set when the hareket was materialized from a tekrar rule (011) */
  tekrar_kural_id: string | null
  created_at: string
}

export interface CariIsletme {
  id: string
  business_id: string
  name: string
  note: string
  /** Telefon, ulusal 10 hane (036); '' = girilmedi. +90 UI'da sabittir. */
  telefon: string
  hareketler: CariHareket[]
}

// ── İstekler (037) ──

export type IstekTur = 'AVANS' | 'SIKAYET' | 'ONERI'
export type IstekDurum = 'BEKLIYOR' | 'ONAYLANDI' | 'REDDEDILDI' | 'ALINDI'

export interface Istek {
  id: string
  business_id: string
  profile_id: string
  tur: IstekTur
  /** AVANS only — NUMERIC string from PostgREST. */
  tutar: number | string | null
  metin: string
  durum: IstekDurum
  created_at: string
  karar_tarihi: string | null
  /** NULL = deleted account. */
  profile: { full_name: string; role: Role | null } | null
}

/** Yıllık izin aralığı (048). Tarihler date (YYYY-MM-DD), uçlar dâhil. */
export interface Izin {
  id: string
  business_id: string
  profile_id: string
  baslangic: string
  bitis: string
  created_at: string
}

export const ROLE_LABELS: Record<Role, string> = {
  YONETICI: 'Yönetici',
  MUHASEBE: 'Muhasebe',
  PERSONEL: 'Personel',
}

/** Rol Seç modal cards — labels/descriptions from the design. */
export const ROLE_OPTIONS: { role: Role; label: string; desc: string }[] = [
  { role: 'YONETICI', label: 'Yönetici', desc: 'Tüm yetkilere sahip' },
  { role: 'MUHASEBE', label: 'Muhasebe', desc: 'Finans ve raporlar' },
  { role: 'PERSONEL', label: 'Personel', desc: 'Sınırlı erişim' },
]

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .slice(0, 2)
    .join('')
    .toLocaleUpperCase('tr-TR')
}
