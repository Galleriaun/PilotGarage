// All user-facing dates follow Istanbul time (UTC+3 year-round, no DST).

const TR_MONTHS = [
  'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
  'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara',
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

/** "2026-07-02" -> "02.07.2026" — Kayıt Detay's TARİH display format. */
export function formatDateDots(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}
