const KEY = 'pg-dark'

/** Apply the saved theme before first paint (called from main.tsx). */
export function initTheme(): void {
  if (localStorage.getItem(KEY) === '1') {
    document.documentElement.classList.add('dark')
  }
}

export function isDarkMode(): boolean {
  return document.documentElement.classList.contains('dark')
}

export function setDarkMode(on: boolean): void {
  document.documentElement.classList.toggle('dark', on)
  localStorage.setItem(KEY, on ? '1' : '0')
}
