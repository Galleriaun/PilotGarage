import { numericStringToKurus } from '../../lib/money'
import type { PersonelOdeme } from './types'

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
 *
 * BORCA SAYILMANIN ŞARTI: avansın BAĞLI ve ONAYLANMIŞ bir işlemi olmalı.
 * Sunucu bunu `join islemler i on i.id = po.islem_id ... i.durum = 'ONAYLANDI'`
 * ile yapar; inner join, `islem_id` boş satırı tamamen eler. Burada bilerek
 * `odemeOnayli()` KULLANILMAZ: o yardımcı bağlı işlemi olmayan satırı "verilmiş"
 * sayar (rozet ve dönem toplamları için doğru — 045 sonrası saha düzeltmesi),
 * ama borç için sunucunun tersini söyler ve ekran ile ödenen tutar ayrışırdı.
 * `!= null` gevşek: embed hiç gelmezse alan `undefined`'dır ve katı `!==` bunu
 * geçirip `.durum`'da patlardı (`isTransferEs` dersi).
 */
export function avansBorcuKurus(odemeler: PersonelOdeme[]): number {
  let avans = 0
  let dusulen = 0
  for (const o of odemeler) {
    if (o.tur === 'AVANS' && o.borca_sayilir && o.islem != null && o.islem.durum === 'ONAYLANDI') {
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
