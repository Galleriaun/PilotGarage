// Money convention (ARCHITECTURE.md §6): NUMERIC(12,2) on the server,
// integer kuruş on the client. All arithmetic stays in integer kuruş —
// floats are only ever produced for display formatting.

const wholeTL = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })
const centTL = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** 4825000 kuruş -> "48.250 ₺" · 4200055 kuruş -> "42.000,55 ₺" · -4825000 -> "-48.250 ₺"
 *  (owner request 2026-07-12: the ₺ symbol trails the amount). */
export function formatTL(kurus: number, opts: { decimals?: 0 | 2 } = {}): string {
  const sign = kurus < 0 ? '-' : ''
  const abs = Math.abs(kurus)
  const decimals = opts.decimals ?? (abs % 100 === 0 ? 0 : 2)
  const formatter = decimals === 0 ? wholeTL : centTL
  return `${sign}${formatter.format(abs / 100)} ₺`
}

/**
 * Parses user input ("850", "1250,50", "1250.50") to integer kuruş.
 * Thousands separators are rejected (ambiguous) — returns null on any
 * input that isn't a plain amount with at most 2 decimals.
 */
export function parseTLToKurus(input: string): number | null {
  const cleaned = input.replace(/[₺\s]/g, '')
  if (!cleaned) return null
  const match = /^(\d{1,10})(?:[.,](\d{1,2}))?$/.exec(cleaned)
  if (!match) return null
  const whole = Number(match[1])
  const frac = match[2] ? Number(match[2].padEnd(2, '0')) : 0
  return whole * 100 + frac
}

/** Integer kuruş -> "1234.56" string for NUMERIC RPC/insert params. No float math. */
export function kurusToNumericString(kurus: number): string {
  const sign = kurus < 0 ? '-' : ''
  const abs = Math.abs(kurus)
  const whole = Math.floor(abs / 100)
  const frac = abs % 100
  return `${sign}${whole}.${frac.toString().padStart(2, '0')}`
}

/** "1234.56" NUMERIC string from PostgREST -> integer kuruş. */
export function numericStringToKurus(value: string | number): number {
  const s = String(value)
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s)
  if (!match) {
    throw new Error(`Geçersiz tutar: ${s}`)
  }
  const sign = match[1] === '-' ? -1 : 1
  const whole = Number(match[2])
  const frac = match[3] ? Number(match[3].padEnd(2, '0')) : 0
  return sign * (whole * 100 + frac)
}
