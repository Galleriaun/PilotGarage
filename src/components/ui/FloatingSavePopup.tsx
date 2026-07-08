import { createPortal } from 'react-dom'

/**
 * The design's "Kaydedilmemiş değişiklik" floating bar — the established
 * draft + explicit save pattern. Render it only while there are unsaved
 * changes AND no modal is open (it must never block a modal's buttons).
 *
 * Portaled to <body>: the screen-forward entrance animation applies a
 * transform to the screen wrapper, which would hijack position:fixed and
 * anchor the bar to the scroll content instead of the viewport.
 */
export default function FloatingSavePopup({
  onSave,
  onDiscard,
  busy,
}: {
  onSave: () => void
  onDiscard: () => void
  busy: boolean
}) {
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-[104px] z-40 mx-auto w-full max-w-[480px] px-[14px]">
      <div className="rise-in pointer-events-auto flex items-center gap-[10px] rounded-[18px] bg-white py-3 pl-4 pr-3 shadow-[0_14px_38px_rgba(0,0,0,0.2)]">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-ink">Kaydedilmemiş değişiklik</div>
        </div>
        <button
          type="button"
          onClick={onDiscard}
          disabled={busy}
          className="shrink-0 cursor-pointer rounded-[12px] bg-field px-4 py-[11px] text-sm font-semibold text-ink disabled:opacity-60"
        >
          Vazgeç
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          className="shrink-0 cursor-pointer rounded-[12px] bg-ink px-5 py-[11px] text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>
    </div>,
    document.body,
  )
}
