// Shared client-side validation. Forms use noValidate to suppress the
// browser's native (English, OS-styled) constraint popups and show these
// Turkish, app-styled messages inline instead.

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export const MIN_PASSWORD_LENGTH = 8
