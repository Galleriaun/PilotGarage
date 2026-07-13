import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useBusiness } from '../../app/providers/BusinessProvider'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { formatCreatedStamp, formatRelativeDate } from '../../lib/dates'
import { formatTL } from '../../lib/money'
import type { OdemeYontemi } from '../../lib/types'
import { BackChevron } from '../auth/EyeIcon'
import { amountLabel } from './TxCard'
import {
  useApproveIslem,
  useApproveKayitSilme,
  useKayitSilmeTalepleri,
  usePendingIslemler,
  useRejectIslem,
  useRejectKayitSilme,
} from './api'
import {
  ODEME_YONTEMI_LABELS,
  type Islem,
  type IslemKaynak,
  type KayitSilmeTalebi,
} from './types'

type FilterKey = 'TUMU' | 'MANUEL' | 'KAYIT' | 'CARI_HESAP' | 'SILME'
type ManuelTur = 'TUMU' | 'GELIR' | 'GIDER'
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'TUMU', label: 'Tümü' },
  { key: 'MANUEL', label: 'Manuel' },
  { key: 'KAYIT', label: 'Kayıt' },
  { key: 'CARI_HESAP', label: 'İşletme' },
  { key: 'SILME', label: 'Kayıt Silme' },
]
const MANUEL_TURLER: { key: ManuelTur; label: string }[] = [
  { key: 'TUMU', label: 'Tümü' },
  { key: 'GELIR', label: 'Gelir' },
  { key: 'GIDER', label: 'Gider' },
]

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
        {(['NAKIT', 'KREDI_KARTI', 'HAVALE'] as const).map((y) => {
          const selected = yontem === y
          return (
            <button
              key={y}
              type="button"
              onClick={() => setYontem(y)}
              disabled={busy}
              className="flex-1 cursor-pointer rounded-[10px] border-[1.5px] py-2 text-center text-xs font-semibold disabled:opacity-60"
              style={{
                background: selected ? 'var(--seg-on)' : 'var(--seg)',
                borderColor: selected ? 'var(--seg-on)' : 'var(--color-inputline)',
                color: selected ? 'var(--seg-fg-on)' : 'var(--seg-fg)',
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

/** A kayıt deletion request: no money movement — approval permanently
 *  deletes the kayıt (a still-pending gelir goes with it). */
function SilmeCard({
  talep,
  onApprove,
  onReject,
  busy,
  error,
}: {
  talep: KayitSilmeTalebi
  onApprove: () => void
  onReject: () => void
  busy: boolean
  error: string
}) {
  const title = talep.musteri_adi
    ? `${talep.plaka} — ${talep.musteri_adi}`
    : talep.plaka
  return (
    <div className="rounded-[18px] border border-[#EDEDED] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_4px_12px_rgba(0,0,0,0.04)]">
      <div className="min-w-0">
        <div className="truncate text-[15px] font-bold text-ink">{title}</div>
        <div className="mt-[2px] truncate text-xs text-muted">
          {formatCreatedStamp(talep.silme_talebi_at)} ·{' '}
          {talep.talep_eden?.full_name ?? '—'}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-[6px]">
        <span className="inline-flex items-center gap-[5px] rounded-[8px] bg-[#FEF3F2] px-[10px] py-[5px] text-[11.5px] font-bold text-[#C62828]">
          <span className="h-[5px] w-[5px] rounded-full bg-[#C62828]" />
          Kayıt Silme
        </span>
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
          onClick={onApprove}
          disabled={busy}
          className="flex-1 cursor-pointer rounded-[12px] bg-[#C62828] py-[11px] text-center text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? '…' : 'Sil'}
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
  const { data: silmeTalepleri = [] } = useKayitSilmeTalepleri(businessId)
  const approve = useApproveIslem()
  const reject = useRejectIslem()
  const approveSilme = useApproveKayitSilme()
  const rejectSilme = useRejectKayitSilme()

  const [busyId, setBusyId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [rejecting, setRejecting] = useState<Islem | null>(null)
  const [silmeConfirm, setSilmeConfirm] = useState<KayitSilmeTalebi | null>(null)
  const [filter, setFilter] = useState<FilterKey>('TUMU')
  const [manuelTur, setManuelTur] = useState<ManuelTur>('TUMU')

  const showBar = filter === 'MANUEL' || filter === 'KAYIT' || filter === 'CARI_HESAP'

  const shownSilme =
    filter === 'TUMU' || filter === 'SILME' ? silmeTalepleri : []
  const shownPending = pending.filter((i) =>
    filter === 'TUMU'
      ? true
      : filter === 'SILME'
        ? false
        : filter === 'MANUEL'
          ? i.kaynak === 'MANUEL' && (manuelTur === 'TUMU' || i.tur === manuelTur)
          : i.kaynak === filter,
  )

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

  async function onConfirmSilme() {
    if (!silmeConfirm) return
    const talep = silmeConfirm
    setCardError(talep.id, '')
    setBusyId(talep.id)
    try {
      await approveSilme.mutateAsync({ kayitId: talep.id })
      setSilmeConfirm(null)
    } catch {
      setSilmeConfirm(null)
      setCardError(talep.id, 'Silinemedi. Tekrar deneyin.')
    } finally {
      setBusyId(null)
    }
  }

  async function onRejectSilme(talep: KayitSilmeTalebi) {
    setCardError(talep.id, '')
    setBusyId(talep.id)
    try {
      await rejectSilme.mutateAsync({ kayitId: talep.id })
    } catch {
      setCardError(talep.id, 'Reddedilemedi. Tekrar deneyin.')
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

      <div className="flex gap-2 overflow-x-auto px-6 pt-4">
        {FILTERS.map((f) => {
          const selected = filter === f.key
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => {
                setFilter(f.key)
                setManuelTur('TUMU')
              }}
              className="shrink-0 cursor-pointer whitespace-nowrap rounded-[20px] px-[14px] py-[8px] text-[13px] font-semibold"
              style={{
                background: selected ? 'var(--seg-on)' : 'var(--seg)',
                color: selected ? 'var(--seg-fg-on)' : 'var(--seg-fg)',
              }}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {filter === 'MANUEL' && (
        <div className="flex gap-2 px-6 pt-2">
          {MANUEL_TURLER.map((t) => {
            const selected = manuelTur === t.key
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setManuelTur(t.key)}
                className="shrink-0 cursor-pointer whitespace-nowrap rounded-[20px] px-3 py-[6px] text-xs font-semibold"
                style={{
                  background: selected ? 'var(--seg-on)' : 'var(--seg)',
                  color: selected ? 'var(--seg-fg-on)' : 'var(--seg-fg)',
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      )}

      {showBar &&
        (() => {
          let gelir = 0
          let gider = 0
          let nakitNet = 0
          let kkNet = 0
          let havaleNet = 0
          for (const i of shownPending) {
            if (i.tur === 'GELIR') gelir += i.kurus
            else gider += i.kurus
            const signed = i.tur === 'GELIR' ? i.kurus : -i.kurus
            if (i.odeme_yontemi === 'NAKIT') nakitNet += signed
            else if (i.odeme_yontemi === 'KREDI_KARTI') kkNet += signed
            else if (i.odeme_yontemi === 'HAVALE') havaleNet += signed
          }
          return (
            <div className="mx-6 mt-4 rounded-[14px] bg-[linear-gradient(150deg,#1C1C1E,#0A0A0A)] px-4 py-3">
              <div className="flex items-center gap-[18px]">
                <div className="flex items-baseline gap-1">
                  <span className="text-xs font-semibold text-white/55">Toplam:</span>
                  <span className="text-[13px] font-bold text-white">
                    {formatTL(gelir - gider)}
                  </span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xs font-semibold text-white/55">Gelir:</span>
                  <span className="text-[13px] font-bold text-[#4ADE80]">{formatTL(gelir)}</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xs font-semibold text-white/55">Gider:</span>
                  <span className="text-[13px] font-bold text-[#F87171]">{formatTL(gider)}</span>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-[18px] border-t border-white/10 pt-2">
                <div className="flex items-baseline gap-1">
                  <span className="text-xs font-semibold text-white/55">Nakit:</span>
                  <span className="text-[13px] font-bold text-[#4ADE80]">
                    {formatTL(nakitNet)}
                  </span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xs font-semibold text-white/55">Kredi Kartı:</span>
                  <span className="text-[13px] font-bold text-[#60A5FA]">{formatTL(kkNet)}</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xs font-semibold text-white/55">Havale:</span>
                  <span className="text-[13px] font-bold text-[#C4B5FD]">
                    {formatTL(havaleNet)}
                  </span>
                </div>
              </div>
            </div>
          )
        })()}

      {isPending ? (
        <div className="flex justify-center py-14">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-divider border-t-ink" />
        </div>
      ) : isError ? (
        <p className="px-6 py-10 text-center text-sm text-danger">Bekleyen işlemler yüklenemedi.</p>
      ) : shownPending.length === 0 && shownSilme.length === 0 ? (
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
          <div className="text-[13px] text-muted">
            {filter === 'TUMU'
              ? 'Onay bekleyen tüm işlemler tamamlandı.'
              : 'Bu filtreyle eşleşen bekleyen işlem yok.'}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-6 pt-[22px]">
          {shownSilme.map((talep) => (
            <SilmeCard
              key={talep.id}
              talep={talep}
              busy={busyId === talep.id}
              error={errors[talep.id] ?? ''}
              onApprove={() => setSilmeConfirm(talep)}
              onReject={() => void onRejectSilme(talep)}
            />
          ))}
          {shownPending.map((islem) => (
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

      <ConfirmDialog
        open={silmeConfirm !== null}
        title="Kaydı sil"
        message={`${silmeConfirm?.plaka ?? ''} kaydı kalıcı olarak silinecek. Bu işlem geri alınamaz.`}
        confirmLabel="Sil"
        danger
        busy={busyId !== null && silmeConfirm !== null && busyId === silmeConfirm.id}
        onConfirm={() => void onConfirmSilme()}
        onCancel={() => setSilmeConfirm(null)}
      />
    </div>
  )
}
