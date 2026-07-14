// Müşteri telefonu (035): only the national mobile part is stored —
// "5XXXXXXXXX" (10 digits); the +90 prefix is fixed in the UI and the DB
// check constraint rejects anything else.

/**
 * Normalizes raw input to the stored form. Strips non-digits and pasted
 * prefixes (+90… / 0…); anything not starting with 5 is rejected so a wrong
 * number can't be typed at all.
 */
export function normalizeTel(raw: string): string {
  let d = raw.replace(/\D/g, '')
  // pasted with country code / leading zero (a valid number never starts
  // with 9 or 0, so this can't eat real digits)
  if (d.startsWith('90')) d = d.slice(2)
  if (d.startsWith('0')) d = d.slice(1)
  if (d && d[0] !== '5') return ''
  return d.slice(0, 10)
}

export function isTelComplete(tel: string): boolean {
  return /^5\d{9}$/.test(tel)
}

/** "5321234567" -> "+90 532 123 45 67" (partial input formats as far as it goes). */
export function formatTelDisplay(tel: string): string {
  const parts = [tel.slice(0, 3), tel.slice(3, 6), tel.slice(6, 8), tel.slice(8, 10)]
  return `+90 ${parts.filter(Boolean).join(' ')}`.trim()
}

export function telHref(tel: string): string {
  return `tel:+90${tel}`
}

/**
 * Cari işletme telefonu (036): any 10 digits after +90 — landlines too, so
 * no leading-5 rule. Leading zeros are stripped (national prefix / invalid
 * first digit) and a pasted +90 country code is removed.
 */
export function normalizeTelGenel(raw: string): string {
  let d = raw.replace(/\D/g, '')
  // only treat "90" as a country code when there are more digits than fit —
  // 900-series numbers legitimately start with 90
  if (d.length > 10 && d.startsWith('90')) d = d.slice(2)
  while (d.startsWith('0')) d = d.slice(1)
  return d.slice(0, 10)
}

export function isTelGenelComplete(tel: string): boolean {
  return /^[1-9]\d{9}$/.test(tel)
}
