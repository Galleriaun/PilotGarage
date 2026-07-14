import { useNavigate } from 'react-router'
import { useBusiness } from '../../app/providers/BusinessProvider'
import { formatCreatedStamp } from '../../lib/dates'
import { formatTL, numericStringToKurus } from '../../lib/money'
import { BackChevron } from '../auth/EyeIcon'
import type { IstekDurum, IstekTur } from '../yonetim/types'
import { useMyIstekler } from './api'

const TUR_LABELS: Record<IstekTur, string> = {
  AVANS: 'Avans İsteği',
  SIKAYET: 'Şikayet',
  ONERI: 'Öneri',
}

// ALINDI personele "Görüldü" olarak gösterilir (owner wording)
const DURUM_CHIP: Record<IstekDurum, { label: string; bg: string; color: string }> = {
  BEKLIYOR: { label: 'Bekliyor', bg: '#FFF7ED', color: '#B45309' },
  ONAYLANDI: { label: 'Onaylandı', bg: '#F0FDF4', color: '#15803D' },
  REDDEDILDI: { label: 'Reddedildi', bg: '#FEF3F2', color: '#C62828' },
  ALINDI: { label: 'Görüldü', bg: '#F2F2F2', color: '#666666' },
}

export default function Isteklerim() {
  const navigate = useNavigate()
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id ?? ''
  const { data: istekler = [], isPending } = useMyIstekler(businessId)

  return (
    <div className="screen-forward">
      <div className="px-6 pt-4">
        <button
          type="button"
          onClick={() => void navigate('/istekler')}
          className="inline-flex cursor-pointer items-center gap-1 py-[6px]"
        >
          <BackChevron />
          <span className="text-[15px] font-medium text-ink">Geri</span>
        </button>
      </div>

      <div className="px-6 pt-4">
        <h1 className="text-[26px] font-bold tracking-[-0.4px] text-ink">İsteklerim</h1>
      </div>

      {isPending ? (
        <div className="flex justify-center py-14">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-divider border-t-ink" />
        </div>
      ) : istekler.length === 0 ? (
        <div className="px-6 py-[60px] text-center">
          <div className="mb-1 text-base font-bold text-ink">Henüz istek yok</div>
          <div className="text-[13px] text-muted">
            İşlemler ekranından avans, şikayet veya öneri gönderebilirsiniz.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 px-6 pt-[18px]">
          {istekler.map((i) => {
            const chip = DURUM_CHIP[i.durum]
            return (
              <div key={i.id} className="rounded-[16px] bg-card px-4 py-[13px]">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-ink">
                      {TUR_LABELS[i.tur]}
                      {i.tur === 'AVANS' && i.tutar != null && (
                        <span> — {formatTL(numericStringToKurus(String(i.tutar)))}</span>
                      )}
                    </div>
                    <div className="mt-[2px] text-[11px] text-muted">
                      {formatCreatedStamp(i.created_at)}
                    </div>
                  </div>
                  <span
                    className="shrink-0 rounded-[8px] px-3 py-[6px] text-xs font-semibold"
                    style={{ background: chip.bg, color: chip.color }}
                  >
                    {chip.label}
                  </span>
                </div>
                {i.metin && (
                  <p className="mt-2 text-[13px] leading-relaxed text-muted">{i.metin}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
      <div className="h-10" />
    </div>
  )
}
