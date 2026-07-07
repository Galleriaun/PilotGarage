import * as Dialog from '@radix-ui/react-dialog'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * The design's single shared confirmation modal (max-width 300, rounded 20,
 * dark backdrop) — every confirm-before-destroy and durum change goes
 * through this one component.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Onayla',
  cancelLabel = 'İptal',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-backdrop fixed inset-0 z-50 bg-black/45" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-64px)] max-w-[300px] -translate-x-1/2 -translate-y-1/2 outline-none">
          <div className="modal-pop rounded-[20px] bg-white px-[22px] py-6 shadow-[0_20px_50px_rgba(0,0,0,0.25)]">
            <Dialog.Title className="mb-2 text-[17px] font-bold text-ink">{title}</Dialog.Title>
            <Dialog.Description className="mb-5 text-sm leading-relaxed text-muted">
              {message}
            </Dialog.Description>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="flex-1 cursor-pointer rounded-[12px] bg-field py-3 text-sm font-semibold text-ink disabled:opacity-60"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={busy}
                className={`flex-1 cursor-pointer rounded-[12px] py-3 text-sm font-semibold text-white disabled:opacity-60 ${
                  danger ? 'bg-danger' : 'bg-ink'
                }`}
              >
                {busy ? '…' : confirmLabel}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
