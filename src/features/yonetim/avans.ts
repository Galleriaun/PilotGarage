import { numericStringToKurus } from '../../lib/money'
import { odemeOnayli, type PersonelOdeme } from './types'

/**
 * 057: personelin açık avans borcu (kuruş).
 *
 * Sunucudaki `avans_borcu()` fonksiyonunun BİREBİR aynısı — ikisi ayrışırsa
 * ekran ile gerçek ödeme farklı rakam gösterir:
 *
 *   borç = Σ(onaylı + borca sayılan AVANS) − Σ(MAAS satırlarındaki avans_dusulen)
 *
 * `borca_sayilir` 057 öncesi satırlarda false'tur (temiz başlangıç), yani eski
 * avanslar borcu etkilemez. Onay bekleyen avans da sayılmaz (045) — kasadan
 * henüz çıkmamıştır. Negatife düşmez.
 */
export function avansBorcuKurus(odemeler: PersonelOdeme[]): number {
  let avans = 0
  let dusulen = 0
  for (const o of odemeler) {
    if (o.tur === 'AVANS' && o.borca_sayilir && odemeOnayli(o)) {
      avans += numericStringToKurus(String(o.tutar))
    } else if (o.tur === 'MAAS' && o.avans_dusulen != null) {
      // `!= null` 057 ÖNCESİ satırları da kapsar: kolon henüz yoksa alan
      // undefined gelir ve numericStringToKurus("undefined") HATA FIRLATIR
      // (ekranı komple düşürürdü). Yoksa düşüm 0 sayılır — doğrusu da bu.
      dusulen += numericStringToKurus(String(o.avans_dusulen))
    }
  }
  return Math.max(0, avans - dusulen)
}
