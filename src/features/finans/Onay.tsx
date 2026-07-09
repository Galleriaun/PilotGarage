import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useBusiness } from '../../app/providers/BusinessProvider'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { formatRelativeDate } from '../../lib/dates'
import type { OdemeYontemi } from '../../lib/types'
import { BackChevron } from '../auth/EyeIcon'
import { amountLabel } from './TxCard'
import { useApproveIslem, usePendingIslemler, useRejectIslem } from './api'
import { ODEME_YONTEMI_LABELS, type Islem, type IslemKaynak } from './types'

const SOURCE_META: Record<IslemKaynak, { label: string; bg: string; color: string }> = {
  KAYIT: { label: 'Kayıttan', bg: '#EEF4FF', color: '#2A5BD7' },
  CARI_HESAP: { label: 'Cari Hesap', bg: '#FFF7ED', color: '#B45309' },
  MANUEL: { label: 'Manuel', bg: '#F5F0FF', color: '#7C3AED' },
  SABIT_GIDER: { label: 'Sabit Gider', bg: '#F0FDF4', color: '#15803D' },
  PERSONEL: { label: 'Personel', bg: '#FEF3F2', color: '#C62828' },
}

function OnayCard({
  islem,
  onApprove,
  onReject,
  busy,
  error,
}: {
  islem: Islem
  onApprove: (yontem: OdemeYontemi | null) => void
  onReject: () => void
  busy: boolean
  error: string
}) {
  const [yontem, setYontem] = useState<OdemeYontemi | null>(islem.odeme_yontemi)
  const source = SOURCE_META[islem.kaynak]

  return (
    <div className="rounded-[18px] border border-[#EDEDED] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_4px_12px_rgba(0,0,0,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold text-ink">{islem.baslik}</div>
          <div className="mt-[2px] truncate text-xs text-muted">
            {formatRelativeDate(islem.islem_tarihi)} · {islem.creator?.full_name ?? 'Otomatik'}
          </div>
        </div>
        <div
          className="shrink-0 text-base font-bold"
          style={{ color: islem.tur === 'GELIR' ? '#15803D' : '#C62828' }}
        >
          {amountLabel(islem)}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-[6px]">
        <span
          className="inline-flex items-center gap-[5px] rounded-[8px] px-[10px] py-[5px] text-[11.5px] font-bold"
          style={{ background: source.bg, color: source.color }}
        >
          <span className="h-[5px] w-[5px] rounded-full" style={{ background: source.color }} />
          {source.label}
        </span>
        <span className="whitespace-nowrap rounded-[8px] bg-field px-[10px] py-[5px] text-[11.5px] font-semibold text-[#666]">
          {islem.kategori?.label ?? 'Diğer'}
        </span>
      </div>

      {/* Ödeme yöntemi — required for KAYIT-sourced entries, per owner decision */}
      <div className="mt-3 flex gap-2">
        {(['NAKIT', 'KREDI_KARTI'] as const).map((y) => {
          const selected = yontem === y
          return (
            <button
              key={y}
              type="button"
              onClick={() => setYontem(y)}
              disabled={busy}
              className="flex-1 cursor-pointer rounded-[10px] border-[1.5px] py-2 text-center text-xs font-semibold disabled:opacity-60"
              style={{
                background: selected ? '#111' : '#fff',
                borderColor: selected ? '#111' : '#E2E2E2',
                color: selected ? '#fff' : '#888',
              }}
            >
              {ODEME_YONTEMI_LABELS[y]}
            </button>
          )
        })}
      </div>

      {error && <p className="mt-3 text-center text-[13px] text-danger">{error}</p>}

      <div className="mt-[14px] flex gap-2">
        <button
          type="button"
          onClick={onReject}
          disabled={busy}
          className="flex-1 cursor-pointer rounded-[12px] bg-field py-[11px] text-center text-sm font-semibold text-ink disabled:opacity-60"
        >
          Reddet
        </button>
        <button
          type="button"
          onClick={() => onApprove(yontem)}
          disabled={busy}
          className="flex-1 cursor-pointer rounded-[12px] bg-[#1F2937] py-[11px] text-center text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? '…' : 'Onayla'}
        </button>
      </div>
    </div>
  )
}

export default function Onay() {
  const navigate = useNavigate()
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id ?? ''
  const { data: pending = [], isPending, isError } = usePendingIslemler(businessId)
  const approve = useApproveIslem()
  const reject = useRejectIslem()

  const [busyId, setBusyId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [rejecting, setRejecting] = useState<Islem | null>(null)

  function setCardError(id: string, msg: string) {
    setErrors((e) => ({ ...e, [id]: msg }))
  }

  async function onApprove(islem: Islem, yontem: OdemeYontemi | null) {
    setCardError(islem.id, '')
    if (islem.kaynak === 'KAYIT' && !yontem) {
      setCardError(islem.id, 'Onaylamak için ödeme yöntemi seçin.')
      return
    }
    setBusyId(islem.id)
    try {
      await approve.mutateAsync({ islemId: islem.id, odemeYontemi: yontem })
    } catch {
      setCardError(islem.id, 'Onaylanamadı. Tekrar deneyin.')
    } finally {
      setBusyId(null)
    }
  }

  async function onConfirmReject() {
    if (!rejecting) return
    const islem = rejecting
    setBusyId(islem.id)
    try {
      await reject.mutateAsync({ islemId: islem.id })
      setRejecting(null)
    } catch {
      setRejecting(null)
      setCardError(islem.id, 'Reddedilemedi. Tekrar deneyin.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="screen-forward">
      <div className="px-6 pt-4">
        <button
          type="button"
          onClick={() => void navigate('/yonetim')}
          className="inline-flex cursor-pointer items-center gap-1 py-[6px]"
        >
          <BackChevron />
          <span className="text-[15px] font-medium text-ink">Geri</span>
        </button>
      </div>

      <div className="px-6 pt-4">
        <h1 className="text-[26px] font-bold tracking-[-0.4px] text-ink">Onay Bekleyenler</h1>
      </div>

      {isPending ? (
        <div className="flex justify-center py-14">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-divider border-t-ink" />
        </div>
      ) : isError ? (
        <p className="px-6 py-10 text-center text-sm text-danger">Bekleyen işlemler yüklenemedi.</p>
      ) : pending.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-[70px] text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-[17px] bg-field">
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ADADAD"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div className="mb-1 text-base font-bold text-ink">Bekleyen işlem yok</div>
          <div className="text-[13px] text-muted">Onay bekleyen tüm işlemler tamamlandı.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-6 pt-[22px]">
          {pending.map((islem) => (
            <OnayCard
              key={islem.id}
              islem={islem}
              busy={busyId === islem.id}
              error={errors[islem.id] ?? ''}
              onApprove={(yontem) => void onApprove(islem, yontem)}
              onReject={() => setRejecting(islem)}
            />
          ))}
        </div>
      )}
      <div className="h-10" />

      <ConfirmDialog
        open={rejecting !== null}
        title="İşlemi reddet"
        message={`"${rejecting?.baslik ?? ''}" işlemini reddetmek istediğinize emin misiniz? Bu işlem geri alınamaz.`}
        confirmLabel="Reddet"
        danger
        busy={busyId !== null && rejecting !== null && busyId === rejecting.id}
        onConfirm={() => void onConfirmReject()}
        onCancel={() => setRejecting(null)}
      />
    </div>
  )
}
