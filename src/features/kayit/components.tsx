import { useState } from 'react'
import { formatTL, numericStringToKurus } from '../../lib/money'
import type { KayitDurum, Paket } from './types'
import { DURUM_META } from './durum'
import {
  ChevronDownIcon,
  EmptyDocIcon,
  PhotoPlaceholderIcon,
  PlusSmallIcon,
  SearchIcon,
} from './icons'

export function paketPriceLabel(paket: Paket): string {
  return formatTL(numericStringToKurus(String(paket.price)))
}

export function paketFullLabel(paket: Paket): string {
  return `${paket.name} (${paketPriceLabel(paket)})`
}

/** Small status pill used on list cards. */
export function StatusPill({ durum }: { durum: KayitDurum }) {
  const meta = DURUM_META[durum]
  return (
    <span
      className="rounded-[6px] px-2 py-[3px] text-[11px] font-semibold"
      style={{ background: meta.bg, color: meta.color }}
    >
      {meta.label}
    </span>
  )
}

/** 64x52 list thumbnail — first photo, or the placeholder frame. */
export function KayitThumb({ url }: { url: string | null }) {
  return (
    <div className="flex h-[52px] w-16 shrink-0 items-center justify-center overflow-hidden rounded-[12px] bg-[#E8E8E8]">
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <PhotoPlaceholderIcon size={22} />
      )}
    </div>
  )
}

/** Search field + black Ekle button. Gray variant = Personel, white = Yönetici. */
export function SearchAddBar({
  value,
  onChange,
  onAdd,
  variant,
}: {
  value: string
  onChange: (v: string) => void
  onAdd: () => void
  variant: 'gray' | 'white'
}) {
  return (
    <div className="flex items-center gap-[10px]">
      <div
        className={
          variant === 'gray'
            ? 'flex flex-1 items-center gap-2 rounded-[14px] bg-field px-4 py-3'
            : 'flex flex-1 items-center gap-2 rounded-[14px] border-[1.5px] border-[#E4E4E4] bg-white px-4 py-[11.5px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]'
        }
      >
        <SearchIcon />
        <input
          type="text"
          placeholder="Plaka veya isim ara..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink outline-none placeholder:text-faint"
        />
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="pressable flex shrink-0 cursor-pointer items-center gap-[6px] rounded-[14px] bg-ink px-4 py-3"
      >
        <PlusSmallIcon />
        <span className="text-[13px] font-semibold text-white">Ekle</span>
      </button>
    </div>
  )
}

export function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-[14px] flex h-[52px] w-[52px] items-center justify-center rounded-[16px] bg-field">
        <EmptyDocIcon />
      </div>
      <div className="mb-1 text-[15px] font-bold text-ink">{title}</div>
      <div className="text-[13px] text-muted">{subtitle}</div>
    </div>
  )
}

/**
 * Paket picker per design: opens on tap, nothing pre-selected, options show
 * name + price. `form` variant is the input-styled trigger (Yeni Kayıt);
 * `card` variant sits bare inside a gray info card (Kayıt Detay edit).
 */
export function PaketDropdown({
  paketler,
  selectedId,
  onSelect,
  variant,
}: {
  paketler: Paket[]
  selectedId: string | null
  onSelect: (id: string) => void
  variant: 'form' | 'card'
}) {
  const [open, setOpen] = useState(false)
  const selected = paketler.find((p) => p.id === selectedId) ?? null
  const label = selected ? paketFullLabel(selected) : 'Paket seç'
  const labelColor = selected ? '#111' : '#ADADAD'

  const trigger =
    variant === 'form' ? (
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between rounded-[14px] border-[1.5px] border-inputline bg-inputfill px-[18px] py-4"
      >
        <span className="text-[15px] font-semibold" style={{ color: labelColor }}>
          {label}
        </span>
        <ChevronDownIcon size={14} color="#ADADAD" rotated={open} />
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between"
      >
        <span className="text-[15px] font-semibold" style={{ color: labelColor }}>
          {label}
        </span>
        <ChevronDownIcon size={13} color="#ADADAD" rotated={open} />
      </button>
    )

  return (
    <div className="relative">
      {trigger}
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="menu-in absolute left-0 right-0 top-[calc(100%+6px)] z-20 rounded-[14px] bg-white p-[6px] shadow-[0_8px_24px_rgba(0,0,0,0.15)]">
            {paketler.length === 0 ? (
              <div className="px-[14px] py-3 text-sm text-muted">Henüz paket tanımlı değil.</div>
            ) : (
              paketler.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onSelect(p.id)
                    setOpen(false)
                  }}
                  className="flex w-full cursor-pointer items-center justify-between gap-[10px] rounded-[10px] px-[14px] py-3 text-left hover:bg-card"
                >
                  <span className="text-sm font-semibold text-ink">{p.name}</span>
                  <span className="text-[13px] font-bold text-muted">{paketPriceLabel(p)}</span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
