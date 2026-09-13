import { useId, useState, type ReactNode } from 'react'
import { ChevronDownIcon } from '../../features/kayit/icons'
import { rpcErrorText } from '../../lib/errors'

/**
 * Ayar ekranlarının ortak kartı — Ayarlar.tsx'teki `rounded-[18px] bg-card
 * p-[18px]` deseninin katlanabilir hâli.
 *
 * NEDEN VAR: İşletme Ayarları beş bölümü beyaz sayfada çıplak <div> olarak
 * diziyordu; bölüm başlığı ile içerideki alan etiketi neredeyse aynı stildeydi,
 * dolayısıyla hiçbir şey hiçbir şeye ait görünmüyordu.
 */
export default function SettingsCard({
  title,
  summary,
  defaultOpen = false,
  collapsible = true,
  children,
}: {
  title: string
  /** Kapalıyken başlıkta görünen tek satırlık özet (ör. "3 paket"). */
  summary?: string
  defaultOpen?: boolean
  /** false = her zaman açık, chevron yok. */
  collapsible?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen || !collapsible)
  const bodyId = useId()

  const header = (
    <>
      <span className={`${cardTitleCls} min-w-0 truncate`}>{title}</span>
      {collapsible && (
        <span className="flex min-w-0 shrink items-center gap-2">
          {summary && (
            <span className="min-w-0 truncate text-[12px] font-semibold text-muted">
              {summary}
            </span>
          )}
          <ChevronDownIcon size={13} color="#888" rotated={open} />
        </span>
      )}
    </>
  )

  return (
    <div className="rounded-[18px] bg-card p-[18px]">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex w-full cursor-pointer items-center justify-between gap-3 text-left"
        >
          {header}
        </button>
      ) : (
        <div className="flex items-center justify-between gap-3">{header}</div>
      )}

      {/*
        KAPALIYKEN GİZLENİR, UNMOUNT EDİLMEZ. İşletme adı ve Mesai formu
        kaydedilmemiş taslak state tutuyor — unmount edilseydi yarım yazılmış
        bir yarıçap ya da IP listesi katlayınca sessizce yok olurdu.
      */}
      <div id={bodyId} className={open ? 'mt-4' : 'hidden'}>
        {children}
      </div>
    </div>
  )
}

/* ── Etiket ölçeği ────────────────────────────────────────────
   Asıl hiyerarşi düzeltmesi bu: kart → grup → alan sırasıyla ink → soft →
   faint. Üçü de token olduğu için koyu modda kendiliğinden çevrilir.

   KART İÇİ DOLGU `bg-field` OLMALI, `bg-white` DEĞİL: `.dark .bg-white`
   #202023'e çözülüyor ve bu koyu modda `--color-card` ile birebir aynı renk —
   iç içelik kaybolur. `bg-field` iki temada da ayrışır (açık: karttan koyu,
   koyu: karttan açık). */

export const cardTitleCls = 'text-[12px] font-bold uppercase tracking-[0.8px] text-ink'

export const groupTitleCls = 'text-[11px] font-bold uppercase tracking-[0.6px] text-soft'

export const fieldLabelCls =
  'mb-[6px] text-[11px] font-semibold uppercase tracking-[0.4px] text-faint'

/** Kart içi girdi/açılır menü dolgusu. */
export const cardInputCls =
  'w-full rounded-[12px] border-none bg-field px-[14px] py-[11px] text-sm text-ink outline-none placeholder:text-faint'

/** Kart içi liste satırı (kategori, prim paketi). */
export const cardRowCls = 'flex items-center gap-2 rounded-[12px] bg-field px-3 py-[11px]'

/**
 * Sorgu hatası — BOŞ DURUM METNİ YERİNE gösterilir.
 *
 * NEDEN VAR: yükleme hatası ile "hiç kayıt yok" ayırt edilemiyordu. 061'de
 * `useMesaiKonum`'un select'ine yeni bir kolon eklendi; migration canlıda
 * koşmadan PostgREST **tüm** sorguyu reddediyor (kolonu atlayıp devam etmez),
 * form boş varsayılanlarda kalıyor ve owner haklı olarak "verileri de mi
 * sildin?" diye soruyor. Hata artık açıkça yazılır ve "veriler silinmedi"
 * cümlesi metnin içindedir.
 */
export function LoadError({ error, what }: { error: unknown; what: string }) {
  // Renk `--danger-on-soft` üzerinden: `text-danger` (#c62828) koyu moddaki
  // `bg-danger-soft` (#331b1b) üstünde 2.8:1 kontrast veriyor ve okunmuyor.
  return (
    <div className="rounded-[12px] bg-danger-soft px-3 py-[11px]">
      <div className="text-[13px] font-semibold" style={{ color: 'var(--danger-on-soft)' }}>
        {what} yüklenemedi.
      </div>
      <div
        className="mt-[3px] text-[12px] leading-relaxed"
        style={{ color: 'var(--danger-on-soft)' }}
      >
        Veriler silinmedi — büyük ihtimalle çalıştırılmamış bir migration var.
      </div>
      {/* `text-soft`, `text-muted` DEĞİL: #888 bu pembe zeminde 3.26:1 kalıyor
          (AA 4.5:1 altı); #555 ile 6.9:1. */}
      <div className="mt-[6px] break-words text-[11.5px] leading-relaxed text-soft">
        {rpcErrorText(error, 'Bilinmeyen hata.')}
      </div>
    </div>
  )
}

/** Uygulamanın standart satır içi yükleme göstergesi. */
export function LoadSpinner() {
  return (
    <div className="flex justify-center py-6">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-divider border-t-ink" />
    </div>
  )
}
