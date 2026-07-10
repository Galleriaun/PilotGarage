import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { useBusiness } from '../../app/providers/BusinessProvider'
import AccountMenu from '../../components/ui/AccountMenu'
import { istanbulTodayISO, monthRangeISO } from '../../lib/dates'
import { formatTL } from '../../lib/money'
import { BellOutlineIcon, GearIcon, SwapIcon } from '../kayit/icons'
import FinansMenu from '../yonetim/FinansMenu'
import AddTxModal from './AddTxModal'
import TxCard from './TxCard'
import {
  useApprovedIslemler,
  useKayitSilmeTalepleri,
  useMaasOdemeleri,
  usePendingIslemler,
  useSabitGiderler,
  useTekrarKurallari,
} from './api'
import {
  PERIOD_LABELS,
  PERIOD_SUBTITLES,
  periodRange,
  prevPeriodRange,
  sumKurus,
  type PeriodKey,
} from './selectors'
import type { IslemTur } from './types'
import { CashFlowCard, RecurringCard, SpendingCard, useCashFlowMonths } from './widgets'

const PERIODS: PeriodKey[] = ['TUMU', 'BUGUN', 'HAFTA', 'AY']
const PERIOD_QUERY: Record<PeriodKey, string> = {
  TUMU: 'tumu',
  BUGUN: 'bugun',
  HAFTA: 'hafta',
  AY: 'ay',
}

function ArrowUpMini({ color }: { color: string }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  )
}

function ArrowDownMini({ color }: { color: string }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
    </svg>
  )
}

function PlusMini() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#111"
      strokeWidth="2.8"
      strokeLinecap="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

export default function Yonetim() {
  const navigate = useNavigate()
  const { activeBusiness, businesses } = useBusiness()
  const businessId = activeBusiness?.id ?? ''

  const { data: islemler = [], isPending, isError } = useApprovedIslemler(businessId)
  const { data: pending = [] } = usePendingIslemler(businessId)
  const { data: silmeTalepleri = [] } = useKayitSilmeTalepleri(businessId)
  const onayCount = pending.length + silmeTalepleri.length
  const { data: sabitGiderler = [] } = useSabitGiderler(businessId)
  const { data: tekrarKurallari = [] } = useTekrarKurallari(businessId)
  const { data: maaslar = [] } = useMaasOdemeleri(businessId)

  const [period, setPeriod] = useState<PeriodKey>('TUMU')
  const [widgetIndex, setWidgetIndex] = useState(0)
  const [addTx, setAddTx] = useState<IslemTur | null>(null)

  const today = istanbulTodayISO()
  const currentYear = Number(today.slice(0, 4))
  const currentMonth = Number(today.slice(5, 7))
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const cashFlowMonths = useCashFlowMonths(islemler, currentYear)

  const range = periodRange(period)
  const gelir = sumKurus(islemler, 'GELIR', range)
  const gider = sumKurus(islemler, 'GIDER', range)
  const bakiye = gelir - gider // TUMU: all-time kasa balance; else period net

  const prevRange = prevPeriodRange(period)
  const prevNet = prevRange
    ? sumKurus(islemler, 'GELIR', prevRange) - sumKurus(islemler, 'GIDER', prevRange)
    : null
  const delta = prevNet !== null ? bakiye - prevNet : null

  // Nakit / Kredi Kartı split of the same period (net; yöntemsiz işlemler
  // — cari, maaş/avans — are outside both buckets by design)
  function yontemNet(y: 'NAKIT' | 'KREDI_KARTI') {
    const rows = islemler.filter((i) => i.odeme_yontemi === y)
    return sumKurus(rows, 'GELIR', range) - sumKurus(rows, 'GIDER', range)
  }
  const nakitNet = yontemNet('NAKIT')
  const kkNet = yontemNet('KREDI_KARTI')

  const bakiyeLabel = formatTL(bakiye)
  const deltaLabel = delta !== null ? `${delta >= 0 ? '+' : '-'}${formatTL(Math.abs(delta))}` : ''

  function goToIslemler(params: Record<string, string>) {
    void navigate(`/yonetim/islemler?${new URLSearchParams(params).toString()}`)
  }

  return (
    <div className="screen-forward">
      {/* Header */}
      <div className="flex items-center gap-[10px] px-6 pb-[14px] pt-5">
        <span className="text-[19px] font-bold text-ink">{activeBusiness?.name ?? ''}</span>
        {businesses.length > 1 && (
          <button
            type="button"
            onClick={() => void navigate('/isletme-sec')}
            aria-label="İşletme değiştir"
            className="pressable flex h-9 w-9 cursor-pointer items-center justify-center rounded-[12px] bg-field"
          >
            <SwapIcon size={16} />
          </button>
        )}
        <div className="flex-1" />
        <button
          type="button"
          aria-label="Bildirimler (yakında)"
          className="flex h-9 w-9 cursor-pointer items-center justify-center"
        >
          <BellOutlineIcon />
        </button>
        <AccountMenu side="bottom">
          <button
            type="button"
            aria-label="Ayarlar"
            className="flex h-9 w-9 cursor-pointer items-center justify-center"
          >
            <GearIcon />
          </button>
        </AccountMenu>
      </div>

      <div className="flex items-center justify-between px-6 pt-1">
        <h1 className="text-[26px] font-bold tracking-[-0.4px] text-ink">Finans</h1>
        <FinansMenu />
      </div>

      {isPending ? (
        <div className="flex justify-center py-16">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-divider border-t-ink" />
        </div>
      ) : isError ? (
        <p className="px-6 py-10 text-center text-sm text-danger">
          Finans verileri yüklenemedi. İnternet bağlantınızı kontrol edin.
        </p>
      ) : (
        <>
          {/* Toplam bakiye */}
          <div className="mx-6 mt-[18px] rounded-[24px] bg-[linear-gradient(150deg,#1C1C1E,#0A0A0A)] px-[22px] py-6 shadow-[0_12px_28px_rgba(0,0,0,0.18)]">
            <div className="flex items-center justify-between gap-2">
              <div className="shrink-0 text-xs font-semibold tracking-[0.4px] text-white/50">
                TOPLAM BAKİYE
              </div>
              {delta !== null && (
                <div
                  className="flex min-w-0 items-center gap-1 rounded-[20px] px-[9px] py-1"
                  style={{
                    background: delta >= 0 ? 'rgba(127,199,154,0.16)' : 'rgba(248,113,113,0.16)',
                  }}
                >
                  {delta >= 0 ? (
                    <ArrowUpMini color="#7FC79A" />
                  ) : (
                    <ArrowDownMini color="#F87171" />
                  )}
                  <span
                    className="truncate whitespace-nowrap font-bold"
                    style={{
                      color: delta >= 0 ? '#7FC79A' : '#F87171',
                      fontSize: deltaLabel.length > 9 ? '9.5px' : '11px',
                    }}
                  >
                    {deltaLabel}
                  </span>
                </div>
              )}
            </div>
            <div
              className="mt-[10px] truncate whitespace-nowrap font-bold tracking-[-1px] text-white"
              style={{ fontSize: bakiyeLabel.length > 11 ? '26px' : '36px' }}
            >
              {bakiyeLabel}
            </div>
            <div className="mt-1 text-xs font-medium text-white/40">
              {PERIOD_SUBTITLES[period]}
            </div>
            <div className="mt-3 flex items-center gap-5 border-t border-white/10 pt-3">
              <div className="flex min-w-0 items-center gap-[6px]">
                <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-[#4ADE80]" />
                <span className="text-[11px] font-semibold text-white/50">Nakit</span>
                <span className="truncate text-xs font-bold text-white">
                  {formatTL(nakitNet)}
                </span>
              </div>
              <div className="flex min-w-0 items-center gap-[6px]">
                <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-[#60A5FA]" />
                <span className="whitespace-nowrap text-[11px] font-semibold text-white/50">
                  Kredi Kartı
                </span>
                <span className="truncate text-xs font-bold text-white">{formatTL(kkNet)}</span>
              </div>
            </div>
          </div>

          {/* Gelir / Gider */}
          <div className="flex gap-[10px] px-6 pt-[14px]">
            {(
              [
                { tur: 'GELIR', label: 'Gelir', amount: gelir, iconBg: '#F0FDF4' },
                { tur: 'GIDER', label: 'Gider', amount: gider, iconBg: '#FEF3F2' },
              ] as const
            ).map((card) => {
              const amount = formatTL(card.amount)
              return (
                <div
                  key={card.tur}
                  className="flex-1 rounded-[18px] bg-white px-4 py-[15px] shadow-[0_1px_2px_rgba(0,0,0,0.03),0_4px_10px_rgba(0,0,0,0.04)]"
                >
                  <button
                    type="button"
                    onClick={() =>
                      goToIslemler({ tur: card.tur, takvim: PERIOD_QUERY[period] })
                    }
                    className="flex w-full cursor-pointer items-center gap-[11px] text-left"
                  >
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]"
                      style={{ background: card.iconBg }}
                    >
                      {card.tur === 'GELIR' ? (
                        <ArrowUpMini color="#15803D" />
                      ) : (
                        <ArrowDownMini color="#C62828" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-semibold text-faint">{card.label}</div>
                      <div
                        className="mt-[1px] truncate whitespace-nowrap font-bold tracking-[-0.3px] text-ink"
                        style={{ fontSize: amount.length > 10 ? '14px' : '17px' }}
                      >
                        {amount}
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddTx(card.tur)}
                    className="mx-auto mt-4 flex w-fit cursor-pointer items-center justify-center gap-[5px] rounded-[9px] bg-[#F5F5F5] px-3 py-[7px]"
                  >
                    <PlusMini />
                    <span className="text-xs font-semibold text-ink">
                      {card.tur === 'GELIR' ? 'Gelir Ekle' : 'Gider Ekle'}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>

          {/* Dönem filtreleri */}
          <div className="flex gap-2 px-6 pt-[14px]">
            {PERIODS.map((p) => {
              const selected = period === p
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className="flex-1 cursor-pointer rounded-[12px] py-[9px] text-center text-[13px] font-semibold"
                  style={{
                    background: selected ? '#111' : '#F2F2F2',
                    color: selected ? '#fff' : '#888',
                  }}
                >
                  {PERIOD_LABELS[p]}
                </button>
              )
            })}
          </div>

          {/* Son işlemler */}
          <div className="flex items-center justify-between px-6 pt-[22px]">
            <span className="text-[15px] font-bold tracking-[-0.3px] text-ink">Son İşlemler</span>
            <button
              type="button"
              onClick={() => goToIslemler({ takvim: PERIOD_QUERY[period] })}
              className="cursor-pointer text-[13px] font-semibold text-danger"
            >
              Tümü
            </button>
          </div>
          <div className="mx-6 mt-3 flex flex-col gap-[10px]">
            {islemler.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-muted">
                Henüz onaylanmış işlem yok.
              </p>
            ) : (
              islemler.slice(0, 4).map((i) => <TxCard key={i.id} islem={i} variant="white" />)
            )}
          </div>

          {/* Raporlar carousel */}
          <div className="pt-[22px]">
            <div className="mb-[14px] px-6 text-[13px] font-bold text-ink">Raporlar</div>
            <div
              className="flex snap-x snap-mandatory items-start overflow-x-auto overflow-y-hidden"
              onScroll={(e) => {
                const el = e.currentTarget
                const idx = Math.round(el.scrollLeft / el.clientWidth)
                if (idx !== widgetIndex) setWidgetIndex(idx)
              }}
            >
              <div className="w-full shrink-0 snap-start px-6">
                <CashFlowCard
                  months={cashFlowMonths}
                  year={currentYear}
                  selectedMonth={selectedMonth}
                  onSelectMonth={setSelectedMonth}
                  onSeeMonth={() => {
                    const { start, end } = monthRangeISO(currentYear, selectedMonth)
                    goToIslemler({ takvim: 'custom', start, end })
                  }}
                />
              </div>
              <div className="w-full shrink-0 snap-start px-6">
                <SpendingCard
                  islemler={islemler}
                  year={currentYear}
                  selectedMonth={selectedMonth}
                />
              </div>
              <div className="w-full shrink-0 snap-start px-6">
                <RecurringCard
                  sabitGiderler={sabitGiderler}
                  tekrarKurallari={tekrarKurallari}
                  maaslar={maaslar}
                />
              </div>
            </div>
            <div className="mt-3 flex justify-center gap-[6px]">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-[6px] w-[6px] rounded-full"
                  style={{ background: widgetIndex === i ? '#111' : '#D4D4D4' }}
                />
              ))}
            </div>
          </div>
        </>
      )}
      <div className="h-6" />

      {/* Onay floating button — always visible; the badge shows only when
          something is actually waiting. Portaled to <body>: the screen
          entrance animation transforms the wrapper, which would hijack
          position:fixed and pin the button to the scroll content. */}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom))] z-40 mx-auto flex w-full max-w-[480px] justify-center">
          <button
            type="button"
            onClick={() => void navigate('/yonetim/onay')}
            className="pressable pointer-events-auto flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-[10px] bg-[#1F2937] py-2 px-[18px] text-[17px] font-bold text-white shadow-[0_8px_20px_rgba(31,41,55,0.28)]"
          >
            <span>Onay</span>
            {onayCount > 0 && (
              <span className="-mr-[6px] inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-[7px] bg-white/[.18] px-[6px] text-sm font-bold">
                {onayCount}
              </span>
            )}
          </button>
        </div>,
        document.body,
      )}

      <AddTxModal
        open={addTx !== null}
        tur={addTx ?? 'GELIR'}
        businessId={businessId}
        onClose={() => setAddTx(null)}
      />
    </div>
  )
}
