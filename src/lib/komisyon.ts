// KK komisyon oranları (owner 2026-07-20).
//
// Banka seçimi yalnızca bir HESAP MAKİNESİDİR: hiçbir yere kaydedilmez,
// hiçbir ekranda gösterilmez, tek işi KOMİSYON (₺) alanını doldurmaktır.
// Kaydedilen tek şey komisyon TUTARIdır — kullanıcı doldurulan değeri
// dilediği gibi elle değiştirebilir.
//
// Oranlar tam sayı BAZ PUAN olarak tutulur (10.000'de): %2,99 = 299.
// Float oranla çarpım kuruşta yuvarlama hatası üretirdi (money.ts kuralı:
// tüm aritmetik tam sayı kuruş).

export type BankaSecim = 'DIGER' | 'ZIRAAT' | 'YAPIKREDI_KREDI' | 'YAPIKREDI_BANKA'

/** null = oran yok (Diğer): komisyon elle girilir. */
export const KOMISYON_BP: Record<BankaSecim, number | null> = {
  DIGER: null,
  ZIRAAT: 299, // %2,99
  YAPIKREDI_KREDI: 356, // %3,56
  YAPIKREDI_BANKA: 104, // %1,04
}

/** Tutarın baz puan kadarı, tam sayı kuruş (tek yuvarlama). */
export function komisyonKurusHesapla(baseKurus: number, bp: number): number {
  return Math.round((baseKurus * bp) / 10000)
}

/** 299 -> "%2,99" (tr-TR ondalık virgül). */
export function oranLabel(bp: number): string {
  return `%${(bp / 100).toFixed(2).replace('.', ',')}`
}
