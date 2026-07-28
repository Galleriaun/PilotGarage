import { ODEME_YONTEMI_LABELS } from '../../features/finans/types'
import type { OdemeYontemi } from '../../lib/types'

const YONTEMLER: OdemeYontemi[] = ['NAKIT', 'KREDI_KARTI', 'HAVALE']

/**
 * 054: ortak ödeme yöntemi seçici — avans/prim/maaş, sabit gider, cari
 * tahsilat ve sonradan düzeltme ekranlarının hepsi bunu kullanır.
 *
 * `allowNull` açıkken seçili yönteme tekrar dokunmak seçimi kaldırır
 * ("Seçilmedi"e döner) — sabit gider gibi yöntemi opsiyonel olan yerlerde
 * kullanıcı yanlış seçtiğinde geri alabilsin diye. Zorunlu olduğu yerlerde
 * (sonradan düzeltme) kapalıdır: RPC zaten NULL'ı reddeder.
 *
 * Renkler inline `var(--seg*)` ile — koyu modda serileşme sorunu yaşamamak
 * için uygulamanın segment deseni (index.css).
 */
export function YontemSecici({
  value,
  onChange,
  allowNull = false,
}: {
  value: OdemeYontemi | null
  onChange: (y: OdemeYontemi | null) => void
  allowNull?: boolean
}) {
  return (
    <div className="flex gap-2">
      {YONTEMLER.map((y) => {
        const selected = value === y
        return (
          <button
            key={y}
            type="button"
            onClick={() => onChange(selected && allowNull ? null : y)}
            className="flex-1 cursor-pointer rounded-[12px] py-[11px] text-center text-[13px] font-semibold"
            style={{
              background: selected ? 'var(--seg-on)' : 'var(--seg)',
              color: selected ? 'var(--seg-fg-on)' : 'var(--seg-fg)',
            }}
          >
            {ODEME_YONTEMI_LABELS[y]}
          </button>
        )
      })}
    </div>
  )
}
