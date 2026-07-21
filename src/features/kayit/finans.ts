import { kurusToNumericString, numericStringToKurus, parseTLToKurus } from '../../lib/money'
import type { OdemeYontemi } from '../../lib/types'
import type { KayitFinansAlanlari } from './types'

export const YONTEM_LABELS: Record<OdemeYontemi, string> = {
  NAKIT: 'Nakit',
  KREDI_KARTI: 'Kredi Kartı',
  HAVALE: 'Havale',
}

/**
 * Komisyonun hesaplanacağı taban (banka oranı bununla çarpılır): elle girilen
 * tutar, yoksa paket fiyatı — gelirin hangi tutardan doğduğuyla birebir aynı
 * kural (`coalesce(tutar, paket fiyatı)`, 034). Hiçbiri yoksa null.
 */
export function gelirBaseKurus(
  tutar: string,
  paketFiyati: string | number | null,
): number | null {
  if (tutar.trim() !== '') {
    const k = parseTLToKurus(tutar)
    return k !== null && k > 0 ? k : null
  }
  return paketFiyati != null ? numericStringToKurus(paketFiyati) : null
}

export interface FinansForm {
  paketId: string | null
  tutar: string
  odemeYontemi: OdemeYontemi | null
  komisyon: string
}

/**
 * Validates the finance kayıt fields (034) into a DB-ready payload, or returns
 * an error string. Shared by Yeni Kayıt + Detay so both validate identically.
 *
 * `requireYontem` (create only): ödeme yöntemi is mandatory when a gelir will be
 * created (paket selected or amount entered). On edit it stays optional — a
 * finance user fixing an unrelated field on a yöntemsiz (personel) kayıt
 * shouldn't be forced to pick one; a blank yöntem still gets asked at Onay.
 */
export function buildFinansAlanlari(
  f: FinansForm,
  requireYontem = true,
): { finans: KayitFinansAlanlari } | { error: string } {
  const gelirDogar = Boolean(f.paketId) || f.tutar.trim() !== ''
  if (requireYontem && gelirDogar && !f.odemeYontemi) {
    return { error: 'Ödeme yöntemi seçin.' }
  }

  let tutarNum: string | null = null
  let tutarKurus: number | null = null
  if (f.tutar.trim()) {
    tutarKurus = parseTLToKurus(f.tutar)
    if (tutarKurus === null || tutarKurus <= 0) return { error: 'Geçerli bir tutar girin.' }
    tutarNum = kurusToNumericString(tutarKurus)
  }

  let komisyonNum: string | null = null
  if (f.odemeYontemi === 'KREDI_KARTI' && f.komisyon.trim()) {
    const k = parseTLToKurus(f.komisyon)
    if (k === null || k < 0) return { error: 'Geçerli bir komisyon girin.' }
    if (tutarKurus !== null && k >= tutarKurus) {
      return { error: 'Komisyon, tutardan küçük olmalıdır.' }
    }
    komisyonNum = kurusToNumericString(k)
  }

  return { finans: { tutar: tutarNum, odeme_yontemi: f.odemeYontemi, komisyon: komisyonNum } }
}
