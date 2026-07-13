// All user-facing dates follow Istanbul time (UTC+3 year-round, no DST).

export const TR_MONTHS = [
  'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
  'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara',
] as const

export const TR_MONTHS_FULL = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
] as const

/** Today in Istanbul as YYYY-MM-DD. */
export function istanbulTodayISO(): string {
  // en-CA locale formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())
}

/** "Bugün" | "Dün" | "28 May" | "28 May 2025" — matches the design's list dates. */
export function formatRelativeDate(iso: string): string {
  const today = istanbulTodayISO()
  if (iso === today) return 'Bugün'
  const t = new Date(`${today}T00:00:00Z`).getTime()
  const d = new Date(`${iso}T00:00:00Z`).getTime()
  if (Math.round((t - d) / 86_400_000) === 1) return 'Dün'
  const [year, month, day] = iso.split('-').map(Number)
  const label = `${day} ${TR_MONTHS[(month ?? 1) - 1]}`
  const currentYear = Number(today.slice(0, 4))
  return year === currentYear ? label : `${label} ${year}`
}

/** timestamptz -> "9.07.26 - 12:34" (Istanbul) — kayıt cards' creation stamp. */
export function formatCreatedStamp(iso: string): string {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: 'numeric',
    month: 'numeric',
    year: '2-digit',
  }).format(d)
  const time = new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
  return `${date} - ${time}`
}

/** timestamptz -> Istanbul calendar date "YYYY-MM-DD" (for day bucketing). */
export function istanbulDateISO(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date(iso))
}

/** timestamptz -> Istanbul "HH:MM". */
export function istanbulTime(iso: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

/** timestamptz -> "YYYY-MM-DDTHH:MM" Istanbul, for <input type="datetime-local">. */
export function istanbulDateTimeLocal(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`
}

/** "YYYY-MM-DDTHH:MM" (datetime-local, Istanbul wall clock) -> timestamptz ISO. */
export function istanbulLocalToISO(local: string): string {
  return `${local}:00+03:00`
}

/** "2026-07-02" -> "02.07.2026" — Kayıt Detay's TARİH display format. */
export function formatDateDots(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

/** "2026-08-01" -> "1 Ağustos" — Sabit Ödemeler due labels. */
export function formatDayMonth(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${TR_MONTHS_FULL[(m ?? 1) - 1]}`
}

/** Shift an ISO date by days (UTC math — safe for date-only strings). */
export function shiftDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days)).toISOString().slice(0, 10)
}

/** First/last day of a month as ISO strings (month is 1-based). */
export function monthRangeISO(year: number, month: number): { start: string; end: string } {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const mm = String(month).padStart(2, '0')
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` }
}

/**
 * Next occurrence of a day-of-month (1–28) strictly AFTER today. Used when
 * scheduling a tekrar rule alongside a just-created işlem — today's entry
 * already covers the current period.
 */
export function nextOccurrenceAfterISO(dayOfMonth: number): string {
  const today = istanbulTodayISO()
  const [y, m, d] = today.split('-').map(Number)
  const year = y ?? 1970
  const month = m ?? 1
  if ((d ?? 1) < dayOfMonth) {
    return `${year}-${String(month).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`
  }
  const ny = month === 12 ? year + 1 : year
  const nm = month === 12 ? 1 : month + 1
  return `${ny}-${String(nm).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`
}

/**
 * Next occurrence of a day-of-month (1–28), Istanbul-relative, including
 * today. Used for the Sabit Ödemeler widget's due labels.
 */
export function nextOccurrenceISO(dayOfMonth: number): string {
  const today = istanbulTodayISO()
  const [y, m, d] = today.split('-').map(Number)
  const year = y ?? 1970
  const month = m ?? 1
  if ((d ?? 1) <= dayOfMonth) {
    return `${year}-${String(month).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`
  }
  const ny = month === 12 ? year + 1 : year
  const nm = month === 12 ? 1 : month + 1
  return `${ny}-${String(nm).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`
}
