import { useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useNavigate } from 'react-router'
import { BackChevron } from '../auth/EyeIcon'
import { CheckSmallIcon, ChevronDownIcon } from '../kayit/icons'

// ── Module icons (design's Yönetim menu set, parametrized) ──

export function TagIcon({ color = '#C62828', size = 20 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41L13.42 20.58a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  )
}

export function UsersIcon({ color = '#15803D', size = 20 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  )
}

export function BuildingIcon({ color = '#2A5BD7', size = 20 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18" />
      <path d="M5 21V7l7-4 7 4v14" />
      <path d="M9 9h1" />
      <path d="M9 13h1" />
      <path d="M14 9h1" />
      <path d="M14 13h1" />
      <path d="M9 21v-4h6v4" />
    </svg>
  )
}

export function CalendarBoxIcon({ color = '#B45309', size = 20 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

export function GearSmIcon({ color = '#555', size = 20 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  )
}

export function PencilIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  )
}

export function TrashIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#C62828" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  )
}

export function PlusWhiteIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.8" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

// ── Layout pieces ────────────────────────────────────────────

export function Avatar({
  name,
  size = 44,
  rounded = 'full',
}: {
  name: string
  size?: number
  rounded?: 'full' | 'square'
}) {
  const initials = name
    .trim()
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .slice(0, 2)
    .join('')
    .toLocaleUpperCase('tr-TR')
  return (
    <div
      className={`flex shrink-0 items-center justify-center bg-avatar ${
        rounded === 'full' ? 'rounded-full' : 'rounded-[12px]'
      }`}
      style={{ width: size, height: size }}
    >
      <span
        className="font-bold text-[#555]"
        style={{ fontSize: size >= 56 ? 20 : 15 }}
      >
        {initials}
      </span>
    </div>
  )
}

/** Back link + icon square + title (+ optional black Ekle button). */
export function ScreenHeader({
  title,
  icon,
  iconBg,
  onAdd,
  backTo = -1,
}: {
  title: string
  icon: ReactNode
  iconBg: string
  onAdd?: () => void
  backTo?: string | -1
}) {
  const navigate = useNavigate()
  return (
    <>
      <div className="px-6 pt-4">
        <button
          type="button"
          onClick={() => {
            if (backTo === -1) void navigate(-1)
            else void navigate(backTo)
          }}
          className="inline-flex cursor-pointer items-center gap-1 py-[6px]"
        >
          <BackChevron />
          <span className="text-[15px] font-medium text-ink">Geri</span>
        </button>
      </div>
      <div className="flex items-center justify-between gap-3 px-6 pt-4 pb-5">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]"
            style={{ background: iconBg }}
          >
            {icon}
          </div>
          <h1 className="truncate text-[26px] font-bold tracking-[-0.4px] text-ink">{title}</h1>
        </div>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="pressable flex shrink-0 cursor-pointer items-center gap-[6px] rounded-[12px] bg-ink px-[18px] py-[10px]"
          >
            <PlusWhiteIcon />
            <span className="text-[15px] font-semibold text-white">Ekle</span>
          </button>
        )}
      </div>
    </>
  )
}

export const modalFieldLabel =
  'mb-[6px] text-[11px] font-bold uppercase tracking-[0.6px] text-faint'
export const modalInputCls =
  'w-full rounded-[12px] border-none bg-field px-[14px] py-[13px] text-[15px] text-ink outline-none placeholder:text-faint'

/** Design's standard form modal: title, fields, İptal / action buttons. */
export function FormModal({
  open,
  title,
  children,
  error,
  busy,
  confirmLabel = 'Kaydet',
  confirmColor = '#111',
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  children: ReactNode
  error: string
  busy: boolean
  confirmLabel?: string
  confirmColor?: string
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-backdrop fixed inset-0 z-50 bg-black/45" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-64px)] max-w-[320px] -translate-x-1/2 -translate-y-1/2 outline-none">
          <div className="modal-pop max-h-[90dvh] overflow-y-auto rounded-[20px] bg-white px-[22px] py-6 shadow-[0_20px_50px_rgba(0,0,0,0.25)]">
            <Dialog.Title className="mb-4 text-[17px] font-bold text-ink">{title}</Dialog.Title>
            <Dialog.Description className="sr-only">{title}</Dialog.Description>
            <div className="mb-5 flex flex-col gap-[10px]">{children}</div>
            {error && <p className="mb-3 text-center text-sm text-danger">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="flex-1 cursor-pointer rounded-[12px] bg-field py-3 text-sm font-semibold text-ink disabled:opacity-60"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={busy}
                className="flex-1 cursor-pointer rounded-[12px] py-3 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: confirmColor }}
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

/** Inline-expanding day-of-month picker (design's ödeme günü menus). */
export function GunDropdown({
  value,
  onChange,
  allowManual,
  placeholder = 'Gün seç',
  zeroLabel = 'Yok (elle ödeme)',
}: {
  value: number | null
  onChange: (day: number) => void
  /** true = includes the zero option ("yok") as day 0 */
  allowManual?: boolean
  placeholder?: string
  /** label for day 0 — e.g. "Yok (tek sefer)" on Gelir/Gider Ekle */
  zeroLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const label =
    value === null
      ? placeholder
      : value === 0
        ? zeroLabel
        : `Her ayın ${value}. günü`
  const options: number[] = allowManual
    ? [0, ...Array.from({ length: 28 }, (_, i) => i + 1)]
    : Array.from({ length: 28 }, (_, i) => i + 1)

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between rounded-[12px] bg-field px-[14px] py-[13px]"
      >
        <span
          className="text-[15px] font-medium"
          style={{ color: value === null ? '#ADADAD' : '#111' }}
        >
          {label}
        </span>
        <ChevronDownIcon size={12} color="#888" rotated={open} />
      </button>
      {open && (
        <div className="menu-in mt-[6px] max-h-[220px] overflow-y-auto rounded-[14px] bg-card p-[6px]">
          {options.map((day) => {
            const selected = value === day
            return (
              <button
                key={day}
                type="button"
                onClick={() => {
                  onChange(day)
                  setOpen(false)
                }}
                className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-[10px] px-3 py-[11px] text-left text-[15px] font-semibold text-ink"
                style={{ background: selected ? '#F2F2F2' : 'transparent' }}
              >
                <span>{day === 0 ? zeroLabel : `Her ayın ${day}. günü`}</span>
                {selected && <CheckSmallIcon />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
