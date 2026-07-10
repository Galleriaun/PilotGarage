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

export interface PersonelOdeme {
  id: string
  profile_id: string
  business_id: string
  tur: 'MAAS' | 'AVANS' | 'PRIM'
  tutar: number | string
  note: string
  tarih: string
  created_at: string
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
  hareketler: CariHareket[]
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
