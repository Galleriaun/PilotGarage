import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * PWA update flow: registerType 'prompt' — never auto-reload mid-form
 * (finance data entry must not be interrupted). The user chooses when.
 */
export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

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
            // updateServiceWorker reloads via controllerchange; if the new SW
            // can't activate (another open tab holds it), force the reload —
            // a successful handoff reloads first and this timer dies with it.
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
