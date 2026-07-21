import { istanbulTodayISO, monthRangeISO, shiftDaysISO } from '../../lib/dates'
import type { Islem, IslemTur } from './types'

export type PeriodKey = 'TUMU' | 'BUGUN' | 'HAFTA' | 'AY'

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  TUMU: 'Tümü',
  BUGUN: 'Bugün',
  HAFTA: 'Hafta',
  AY: 'Ay',
}

export const PERIOD_SUBTITLES: Record<PeriodKey, string> = {
  TUMU: 'Tüm zamanlar',
  BUGUN: 'Bugün',
  HAFTA: 'Bu hafta',
  AY: 'Bu ay',
}

export interface DateRange {
  start: string
  end: string
}

/** null = no restriction (Tümü). Week = last 7 days, as in the prototype. */
export function periodRange(key: PeriodKey): DateRange | null {
  const today = istanbulTodayISO()
  if (key === 'TUMU') return null
  if (key === 'BUGUN') return { start: today, end: today }
  if (key === 'HAFTA') return { start: shiftDaysISO(today, -6), end: today }
  const [y = 1970, m = 1] = today.split('-').map(Number)
  return monthRangeISO(y, m)
}

/** The equivalent previous period — feeds the balance card's delta chip. */
export function prevPeriodRange(key: PeriodKey): DateRange | null {
  const today = istanbulTodayISO()
  if (key === 'TUMU') return null
  if (key === 'BUGUN') {
    const dun = shiftDaysISO(today, -1)
    return { start: dun, end: dun }
  }
  if (key === 'HAFTA') return { start: shiftDaysISO(today, -13), end: shiftDaysISO(today, -7) }
  const [y = 1970, m = 1] = today.split('-').map(Number)
  return m === 1 ? monthRangeISO(y - 1, 12) : monthRangeISO(y, m - 1)
}

export function inRange(iso: string, range: DateRange | null): boolean {
  if (!range) return true
  return iso >= range.start && iso <= range.end
}

/**
 * Hesaba Para Aktarımı bacağı mı? (041)
 *
 * Transfer iç aktarımdır: para işletmeye girmez/çıkmaz, yalnızca Nakit kovasından
 * Kredi Kartı kovasına geçer. Bu yüzden ciro/gider toplamlarına ve raporlara
 * GİRMEZ, ama kova (yöntem) matematiğine GİRER.
 */
export function isTransfer(i: Islem): boolean {
  return i.kaynak === 'TRANSFER'
}

/**
 * Transferin listede gizlenen eş bacağı mı? (ana bacak tek satır gösterilir)
 *
 * DİKKAT — bu yüklem bir satırı listeden TAMAMEN gizler, o yüzden hatalı
 * tarafı ucuz olan yöne kurulmuştur:
 *   • `kaynak === 'TRANSFER'` şartı olmadan, `transfer_of` kolonu okunamadığı
 *     her durumda (migration 041 uygulanmamış bir DB'de kolon yoktur →
 *     `undefined !== null` TRUE döner) TÜM işlemler eş bacak sanılıp liste
 *     boşalıyordu.
 *   • `!= null` (gevşek) hem null hem undefined'ı eler.
 * Yanlış tarafa düşerse sonuç "transferin ikinci bacağı da görünür" olur —
 * can sıkıcı ama görünür; tersi sessizce her şeyi yok ediyordu.
 */
export function isTransferEs(i: Islem): boolean {
  return isTransfer(i) && i.transfer_of != null
}

/**
 * Onaya geri gönderilebilir mi? (040) — YALNIZCA gerçekten Onay'dan geçmiş,
 * bir insanın onayladığı işlemler. Onay'a hiç DÜŞMEYEN (born-ONAYLANDI)
 * satırlar dışlanır, yoksa Onay kuyruğunu hiç girmedikleri hâlde oraya
 * düşerler:
 *   • kaynak PERSONEL (maaş) — RPC personel_odemeler bağı yüzünden reddeder
 *   • komisyon çocuğu (komisyon_of) — ana işlemle birlikte yönetilir
 *   • sabit gider (sabit_gider_id) — cron born-ONAYLANDI (016)
 *   • tekrar kuralı (tekrar_kural_id) — cron born-ONAYLANDI (019); kaynak'ı
 *     MANUEL olduğu için gerçek manuel girişten TEK ayırt edici bu kolon
 * Transfer BURADA ele alınmaz — kendi "Transferi Geri Al" akışı var; çağıran
 * onu ayrıca yönlendirir. Sınır RPC'de de var (049), bu yalnızca UI.
 */
export function onayaGeriGonderilebilir(i: Islem): boolean {
  return (
    !isTransfer(i) &&
    i.komisyon_of == null &&
    i.kaynak !== 'PERSONEL' &&
    i.sabit_gider_id == null &&
    i.tekrar_kural_id == null
  )
}

/**
 * "İşleme tıkla → oluşturulduğu yere git" (TxCard). Bir işlemin kaynağına göre
 * gideceği rota; **belirsiz/olmayan köken için null** döner (kart tıklanamaz) —
 * böylece tıklama asla YANLIŞ bir yere götürmez:
 *   • KAYIT        → /kayit/:kayit_id            (kayıt silinmişse null)
 *   • CARI_HESAP   → /yonetim/isletmeler/:id     (işletme silinmişse null)
 *   • PERSONEL     → /yonetim/personel/:id        (avans/prim/maaş → personel)
 *   • SABIT_GIDER  → /yonetim/sabit-giderler      (tanımın yönetildiği liste)
 *   • tekrar kuralı (MANUEL + tekrar_kural_id) → /yonetim/sabit-giderler
 *   • düz MANUEL / TRANSFER / komisyon çocuğu → null (kendine ait köken ekranı yok)
 */
export function islemOrigin(i: Islem): string | null {
  switch (i.kaynak) {
    case 'KAYIT':
      return i.kayit_id ? `/kayit/${i.kayit_id}` : null
    case 'CARI_HESAP':
      return i.cari_hareket ? `/yonetim/isletmeler/${i.cari_hareket.cari_isletme_id}` : null
    case 'PERSONEL': {
      const pid = i.personel_odeme[0]?.profile_id
      return pid ? `/yonetim/personel/${pid}` : null
    }
    case 'SABIT_GIDER':
      return '/yonetim/sabit-giderler'
    default:
      // MANUEL: yalnızca tekrar kuralından doğmuşsa yönet (kural Sabit Giderler'de)
      return i.tekrar_kural_id ? '/yonetim/sabit-giderler' : null
  }
}

/**
 * Integer-kuruş sum of approved işlemler of one type within a range.
 * Transfer bacakları varsayılan olarak HARİÇ (ciro/gider toplamları); kova
 * matematiği için `{ transferDahil: true }` ile çağrılır.
 */
export function sumKurus(
  islemler: Islem[],
  tur: IslemTur,
  range: DateRange | null,
  opts?: { transferDahil?: boolean },
): number {
  let total = 0
  for (const i of islemler) {
    if (i.tur !== tur) continue
    if (!opts?.transferDahil && isTransfer(i)) continue
    if (!inRange(i.islem_tarihi, range)) continue
    total += i.kurus
  }
  return total
}
