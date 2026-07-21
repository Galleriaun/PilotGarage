import { formatCreatedStamp, formatRelativeDate } from '../../lib/dates'
import { formatTL } from '../../lib/money'
import type { OdemeYontemi } from '../../lib/types'
import { ODEME_YONTEMI_CHIP, ODEME_YONTEMI_LABELS, type Islem } from './types'

function YontemChip({ y }: { y: OdemeYontemi }) {
  return (
    <span
      className="shrink-0 rounded-[6px] px-[7px] py-[2px] text-[10.5px] font-semibold"
      style={{ background: ODEME_YONTEMI_CHIP[y].bg, color: ODEME_YONTEMI_CHIP[y].color }}
    >
      {ODEME_YONTEMI_LABELS[y]}
    </span>
  )
}

type IconKind = 'car' | 'wrench' | 'building' | 'users' | 'shield' | 'transfer'

/** Prototype's icon mapping: income -> car; expense by kategori label. */
function iconKind(islem: Islem): IconKind {
  if (islem.kaynak === 'TRANSFER') return 'transfer'
  if (islem.tur === 'GELIR') return 'car'
  switch (islem.kategori?.label) {
    case 'Parça Tedariki':
      return 'wrench'
    case 'Kira':
      return 'building'
    case 'Personel Maaşı':
      return 'users'
    default:
      return 'shield'
  }
}

export function TxIcon({ kind, color = '#555' }: { kind: IconKind; color?: string }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (kind) {
    case 'car':
      return (
        <svg {...common}>
          <path d="M5 11l1.5-4.5A1 1 0 017.5 6h9a1 1 0 011 .5L19 11" />
          <path d="M4 11h16v5a1 1 0 01-1 1h-1a1 1 0 01-1-1v-1H7v1a1 1 0 01-1 1H5a1 1 0 01-1-1v-5z" />
          <circle cx="7.5" cy="17" r="1.5" />
          <circle cx="16.5" cy="17" r="1.5" />
        </svg>
      )
    case 'wrench':
      return (
        <svg {...common}>
          <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
        </svg>
      )
    case 'building':
      return (
        <svg {...common}>
          <path d="M3 11l9-8 9 8" />
          <path d="M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10" />
        </svg>
      )
    case 'users':
      return (
        <svg {...common}>
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87" />
          <path d="M16 3.13a4 4 0 010 7.75" />
        </svg>
      )
    case 'shield':
      return (
        <svg {...common}>
          <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" />
        </svg>
      )
    case 'transfer':
      return (
        <svg {...common}>
          <polyline points="17 3 21 7 17 11" />
          <path d="M21 7H8a4 4 0 00-4 4" />
          <polyline points="7 21 3 17 7 13" />
          <path d="M3 17h13a4 4 0 004-4" />
        </svg>
      )
  }
}

export function amountLabel(islem: Islem): string {
  return `${islem.tur === 'GELIR' ? '+' : '-'}${formatTL(islem.kurus)}`
}

function TrashSmallIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C62828" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  )
}

/** Geri-al tarzı köşeli geri ok — onaya geri gönder (040). */
function UndoSmallIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 14 4 9 9 4" />
      <path d="M20 20v-7a4 4 0 00-4-4H4" />
    </svg>
  )
}

/** Transaction row — white variant on Yönetim, gray on Tüm İşlemler.
 *  `onDelete` adds a trash button (finance screens); `onOnayaGonder`
 *  adds the Yönetici-only "onaya geri gönder" undo button (040).
 *  `onOpen` (varsa) kartı tıklanabilir yapar: işlemin oluşturulduğu yere gider
 *  (kayıt/işletme/personel/sabit gider). Aksiyon butonları tıklamayı yutmaz. */
export default function TxCard({
  islem,
  variant,
  onDelete,
  onOnayaGonder,
  onOpen,
}: {
  islem: Islem
  variant: 'white' | 'gray'
  onDelete?: () => void
  onOnayaGonder?: () => void
  onOpen?: () => void
}) {
  // Transfer (041): ne gelir ne gider — nötr renk, işaretsiz tutar ve
  // "kaynak → hedef" çift çipi. Yön ana bacağın yönteminden türetilir:
  // geri alma (042) ters yönde olduğu için çipler sabitlenemez.
  const transfer = islem.kaynak === 'TRANSFER'
  const kaynakYontem: OdemeYontemi = islem.odeme_yontemi ?? 'NAKIT'
  const hedefYontem: OdemeYontemi = kaynakYontem === 'NAKIT' ? 'KREDI_KARTI' : 'NAKIT'
  const base =
    variant === 'white'
      ? 'flex items-center gap-3 rounded-[16px] bg-white px-4 py-[14px] shadow-[0_1px_2px_rgba(0,0,0,0.03),0_4px_10px_rgba(0,0,0,0.04)] md:border md:border-[#E4E4E7]'
      : 'flex items-center gap-3 rounded-[16px] bg-card px-4 py-[14px]'
  return (
    <div
      className={onOpen ? `${base} cursor-pointer` : base}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={
        onOpen
          ? (e) => {
              // yalnızca kartın kendisi odaktayken: iç butonlardan (sil / onaya
              // geri) kabarcıklanan Enter/Space kartı tetikleyip navigasyon +
              // buton eylemini birden yürütmesin
              if (
                e.target === e.currentTarget &&
                (e.key === 'Enter' || e.key === ' ')
              ) {
                e.preventDefault()
                onOpen()
              }
            }
          : undefined
      }
    >
      <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-field">
        <TxIcon kind={iconKind(islem)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold text-ink">
          {islem.kaynak === 'CARI_HESAP' && !islem.cari_hareket_id && (
            <span className="font-semibold text-muted">Silinen işletme: </span>
          )}
          {islem.baslik}
        </div>
        <div className="mt-[2px] flex min-w-0 items-center gap-[6px] text-xs text-muted">
          <span className="whitespace-nowrap">{formatRelativeDate(islem.islem_tarihi)}</span>
          {islem.kategori && (
            <span className="truncate rounded-[6px] bg-[#EBEBEB] px-[7px] py-[2px] text-[10.5px] font-semibold text-[#555]">
              {islem.kategori.label}
            </span>
          )}
          {transfer ? (
            <span className="flex shrink-0 items-center gap-[4px]">
              <YontemChip y={kaynakYontem} />
              <span className="text-[11px] font-bold text-faint">→</span>
              <YontemChip y={hedefYontem} />
            </span>
          ) : (
            islem.odeme_yontemi && <YontemChip y={islem.odeme_yontemi} />
          )}
        </div>
        <div className="mt-[4px] flex min-w-0 items-center gap-[10px] text-[11px] text-faint">
          <span className="flex min-w-0 items-center gap-[5px]">
            <span className="h-[4px] w-[4px] shrink-0 rounded-full bg-[#C4C4C4]" />
            <span className="truncate">{islem.creator?.full_name ?? 'Otomatik'}</span>
          </span>
          <span className="flex shrink-0 items-center gap-[5px]">
            <span className="h-[4px] w-[4px] shrink-0 rounded-full bg-[#C4C4C4]" />
            {formatCreatedStamp(islem.created_at)}
          </span>
        </div>
      </div>
      <div
        className="shrink-0 text-sm font-bold"
        style={{
          color: transfer
            ? 'var(--color-ink)'
            : islem.tur === 'GELIR'
              ? '#15803D'
              : '#C62828',
        }}
      >
        {transfer ? formatTL(islem.kurus) : amountLabel(islem)}
      </div>
      {onOnayaGonder && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation() // kart tıklamasını (onOpen) tetikleme
            onOnayaGonder()
          }}
          aria-label="Onaya geri gönder"
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[9px] bg-field"
        >
          <UndoSmallIcon />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation() // kart tıklamasını (onOpen) tetikleme
            onDelete()
          }}
          aria-label="İşlemi sil"
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[9px] bg-danger-soft"
        >
          <TrashSmallIcon />
        </button>
      )}
    </div>
  )
}
