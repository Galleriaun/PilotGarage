import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { CheckSmallIcon, ChevronDownIcon } from '../kayit/icons'

/** Tüm İşlemler filtre satırı: pill + açılır menü + menü satırı. */

export function FilterPill({
  label,
  icon,
  open,
  onClick,
}: {
  label: string
  icon?: ReactNode
  open: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex cursor-pointer items-center gap-[5px] rounded-[20px] border border-[#E5E5E5] bg-white px-[14px] py-[9px]"
    >
      {icon}
      <span className="text-[13px] font-semibold text-ink">{label}</span>
      <ChevronDownIcon size={11} color="#888" rotated={open} />
    </button>
  )
}

export function MenuItem({
  label,
  selected,
  onSelect,
}: {
  label: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full cursor-pointer items-center justify-between gap-4 whitespace-nowrap rounded-[10px] px-3 py-[10px] text-left text-[13px] font-semibold text-ink"
      style={{ background: selected ? 'var(--seg)' : 'transparent' }}
    >
      <span>{label}</span>
      {selected && <CheckSmallIcon />}
    </button>
  )
}

/**
 * Açılır menü kutusu — filtre satırının içinde tutulur. Pill'ler dar ekranda
 * satır sarar ve bir pill'in yatay yeri etiketlere göre değişir ("Tüm
 * Kategoriler" → "Kira", seçilen yöntem…); sabit left-0/right-0 menüyü ekranın
 * dışına taşıyabilir. Açılışta (ve ekran dönünce) doğal yeri ölçülür, taşıyorsa
 * satırın sınırına kaydırılır. offsetLeft/offsetWidth transform'dan bağımsızdır —
 * menu-in ve screen-forward animasyonları transform kullanır.
 * Sarmalayıcı (pill + menü) ve filtre satırı `relative` olmalı.
 */
export function FilterMenu({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const menu = ref.current
    if (!menu) return
    const yerlestir = () => {
      const sarmalayici = menu.parentElement
      const satir = sarmalayici?.parentElement
      if (!sarmalayici || !satir) return
      menu.style.left = ''
      menu.style.right = ''
      const dogalSol = sarmalayici.offsetLeft + menu.offsetLeft
      const tasma = dogalSol + menu.offsetWidth - satir.clientWidth
      const hedefSol = Math.max(0, tasma > 0 ? dogalSol - tasma : dogalSol)
      if (hedefSol === dogalSol) return
      menu.style.left = `${hedefSol - sarmalayici.offsetLeft}px`
      menu.style.right = 'auto'
    }
    yerlestir()
    window.addEventListener('resize', yerlestir)
    return () => window.removeEventListener('resize', yerlestir)
  }, [])
  return (
    <div
      ref={ref}
      className={`menu-in absolute top-[calc(100%+6px)] z-20 rounded-[14px] bg-white p-[6px] shadow-[0_8px_24px_rgba(0,0,0,0.15)] ${className}`}
    >
      {children}
    </div>
  )
}
