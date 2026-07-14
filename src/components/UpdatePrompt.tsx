import { useRegisterSW } from 'virtual:pwa-register/react'
import { safeStorage } from '../lib/storage'

const UPDATED_AT_KEY = 'pg-updated-at'
// GitHub Pages' CDN serves a mix of old and new sw.js for up to ~10 minutes
// after a deploy (max-age=600); each mismatch queues an "update" again, so
// the prompt kept reappearing right after Güncelle. Snooze it while the CDN
// settles — a genuinely new deploy is only delayed by that window.
const SNOOZE_MS = 10 * 60 * 1000

function recentlyUpdated(): boolean {
  const ts = Number(safeStorage.getItem(UPDATED_AT_KEY) ?? 0)
  return ts > 0 && Date.now() - ts < SNOOZE_MS
}

/**
 * PWA update flow: registerType 'prompt' — never auto-reload mid-form
 * (finance data entry must not be interrupted). The user chooses when.
 */
export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh || recentlyUpdated()) return null

  return (
    <div className="pointer-events-auto fixed bottom-24 left-1/2 z-[100] flex w-[calc(100%-48px)] max-w-[400px] -translate-x-1/2 items-center justify-between gap-3 rounded-[16px] bg-ink px-5 py-4 shadow-[0_20px_50px_rgba(0,0,0,0.25)] md:bottom-auto md:top-[72px]">
      <span className="text-sm font-medium text-white">Yeni sürüm hazır</span>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          className="cursor-pointer text-sm text-white/60"
        >
          Sonra
        </button>
        <button
          type="button"
          onClick={() => {
            safeStorage.setItem(UPDATED_AT_KEY, String(Date.now()))
            // reload the moment the new SW takes control; the timer is the
            // fallback if the handoff stalls (e.g. another tab holds it)
            navigator.serviceWorker?.addEventListener(
              'controllerchange',
              () => window.location.reload(),
              { once: true },
            )
            setTimeout(() => window.location.reload(), 1500)
            void updateServiceWorker(true)
          }}
          className="cursor-pointer rounded-[10px] bg-white px-3 py-[6px] text-sm font-semibold text-ink"
        >
          Güncelle
        </button>
      </div>
    </div>
  )
}
