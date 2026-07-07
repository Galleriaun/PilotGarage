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

/** Integer-kuruş sum of approved işlemler of one type within a range. */
export function sumKurus(islemler: Islem[], tur: IslemTur, range: DateRange | null): number {
  let total = 0
  for (const i of islemler) {
    if (i.tur === tur && inRange(i.islem_tarihi, range)) total += i.kurus
  }
  return total
}
