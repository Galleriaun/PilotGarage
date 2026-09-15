/**
 * Arama metni normalleştirme — hem sorguya hem aranan alana AYNI şekilde uygulanır.
 *
 *   • tr-TR küçük harf, ardından ı → i katlama: iOS ilk harfi otomatik büyütür ve
 *     İngilizce klavyede "Ismail" tr-TR'de "ısmail" olur, "İsmail"i (→ "ismail")
 *     ıskalardı. Katlama eşleşmeyi yalnızca GENİŞLETİR, hiçbir sonucu düşürmez.
 *   • U+0307 (birleşik nokta): "İ" başka bir yerel ayarla küçültülürse "i̇" kalır.
 *   • Boşluklar tekilleştirilir: çift boşlukla kaydedilmiş ad da bulunur.
 */
export function aramaMetni(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/̇/g, '')
    .replace(/ı/g, 'i')
    .replace(/\s+/g, ' ')
    .trim()
}
