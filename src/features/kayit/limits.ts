/**
 * Kayıt form alanlarının uzunluk/aralık sınırları.
 *
 * Yeni Kayıt ve Kayıt Detay düzenleme ekranı AYNI sabitleri kullanır — biri
 * sınırlayıp diğeri sınırlamazsa kural düzenleme ekranından delinir.
 */
export const KAYIT_MAX = {
  musteriAdi: 64,
  plaka: 20,
  ruhsatNo: 40,
  marka: 40,
  model: 40,
  notlar: 500,
} as const

/** İlk otomobil 1886 (Benz Patent-Motorwagen) — öncesi geçersiz. */
export const YIL_MIN = 1886
export const YIL_MAX = 2100
export const YIL_DIGITS = 4
/** 7 hane = 9.999.999 km; gerçek bir araç için fazlasıyla geniş. */
export const KM_DIGITS = 7

/**
 * Yalnızca rakamları bırakır ve hane sayısını sınırlar.
 * `<input type="number">` maxLength'i YOK SAYAR (ve 'e', '+', '.' kabul eder),
 * bu yüzden sayı alanları type="text" + inputMode="numeric" ile bu süzgeçten
 * geçirilir.
 */
export function digitsOnly(value: string, maxDigits: number): string {
  return value.replace(/\D/g, '').slice(0, maxDigits)
}
