import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { useAuth } from '../../app/providers/AuthProvider'
import { useBusiness } from '../../app/providers/BusinessProvider'
import { istanbulTodayISO, monthRangeISO } from '../../lib/dates'
import { formatTL } from '../../lib/money'
import { GearIcon, SwapIcon } from '../kayit/icons'
import { BellButton, TrashHeaderButton } from '../settings/HeaderButtons'
import FinansMenu from '../yonetim/FinansMenu'
import AddTxModal from './AddTxModal'
import CeptenOdemeModal from './CeptenOdemeModal'
import TransferModal from './TransferModal'
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
  islemOrigin,
  isTransferEs,
  PERIOD_LABELS,
  PERIOD_SUBTITLES,
  periodRange,
  prevPeriodRange,
  sumKurus,
  type DateRange,
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
      className="text-ink"
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
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

  const { profile } = useAuth()
  // Onay (044): yalnızca Yönetici — FAB'ı Muhasebe'ye hiç gösterme
  const isYonetici = profile?.role === 'YONETICI'

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
  const [transferOpen, setTransferOpen] = useState(false)
  const [ceptenOpen, setCeptenOpen] = useState(false)

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
  // — cari, maaş/avans — are outside both buckets by design).
  // transferDahil: aktarım ciroya girmez ama kovalar arasında para GERÇEKTEN
  // taşınır — bu satırlar kova matematiğine dâhil edilmeli (041)
  function yontemNet(y: 'NAKIT' | 'KREDI_KARTI' | 'HAVALE', r: DateRange | null = range) {
    const rows = islemler.filter((i) => i.odeme_yontemi === y)
    const opts = { transferDahil: true }
    return sumKurus(rows, 'GELIR', r, opts) - sumKurus(rows, 'GIDER', r, opts)
  }
  const nakitNet = yontemNet('NAKIT')
  const kkNet = yontemNet('KREDI_KARTI')
  const havaleNet = yontemNet('HAVALE')
  // Aktarım ekranı hesabın GERÇEK bakiyesini göstermeli: dönem filtresi
  // "Bugün" iken bile tüm zamanların kova bakiyesi kullanılır (041)
  const nakitTumu = yontemNet('NAKIT', null)
  const kkTumu = yontemNet('KREDI_KARTI', null)

  const bakiyeLabel = formatTL(bakiye)
  const deltaLabel = delta !== null ? `${delta >= 0 ? '+' : '-'}${formatTL(Math.abs(delta))}` : ''

  function goToIslemler(params: Record<string, string>) {
    void navigate(`/yonetim/islemler?${new URLSearchParams(params).toString()}`)
  }

  return (
    <div className="screen-forward">
      {/* Header */}
      <div className="flex items-center gap-[10px] px-6 pb-[14px] pt-5 md:hidden">
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
        <TrashHeaderButton />
        <BellButton />
        <button
          type="button"
          aria-label="Ayarlar"
          onClick={() => void navigate('/ayarlar')}
          className="flex h-9 w-9 cursor-pointer items-center justify-center"
        >
          <GearIcon />
        </button>
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
          {/* Toplam bakiye + Gelir/Gider — desktop: side by side */}
          <div className="md:grid md:grid-cols-3 md:items-stretch md:gap-4 md:px-6 md:pt-[18px]">
          <div className="mx-6 mt-[18px] rounded-[24px] bg-[linear-gradient(150deg,#1C1C1E,#0A0A0A)] px-[22px] py-6 shadow-[0_12px_28px_rgba(0,0,0,0.18)] md:col-span-2 md:mx-0 md:mt-0">
            <div className="flex items-center justify-between gap-2">
              <div className="shrink-0 text-xs font-semibold tracking-[0.4px] text-white/50">
                TOPLAM BAKİYE
              </div>
              <div className="flex min-w-0 items-center gap-2">
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
                {/* Cepten Ödeme (052) — yalnızca Yönetici (RPC de öyle) */}
                {isYonetici && (
                  <button
                    type="button"
                    onClick={() => setCeptenOpen(true)}
                    className="pressable shrink-0 cursor-pointer whitespace-nowrap rounded-[20px] bg-white/10 px-[11px] py-[5px] text-[11.5px] font-semibold text-white/90"
                  >
                    Cepten Ödeme
                  </button>
                )}
              </div>
            </div>
            <div
              className="mt-[10px] truncate whitespace-nowrap font-bold tracking-[-1px] text-white"
              style={{ fontSize: bakiyeLabel.length > 11 ? '26px' : '36px' }}
            >
              {bakiyeLabel}
            </div>
            <div className="mt-1 flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-white/40">
                {PERIOD_SUBTITLES[period]}
              </span>
              {/* Hesaba Para Aktarımı (041): Nakit → Kredi Kartı */}
              <button
                type="button"
                onClick={() => setTransferOpen(true)}
                aria-label="Hesaba para aktar"
                className="pressable flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-[12px] bg-white/10"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
            {/* Yöntem kovaları: mobilde sarmalar (tam sayılar görünsün diye) —
                Nakit + Kredi K. bir satır, Havale alta; masaüstünde tek satır */}
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-3">
              <div className="flex shrink-0 items-center gap-[6px]">
                <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-[#4ADE80]" />
                <span className="text-[11px] font-semibold text-white/50">Nakit</span>
                <span className="whitespace-nowrap text-xs font-bold text-white">
                  {formatTL(nakitNet)}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-[6px]">
                <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-[#60A5FA]" />
                <span className="whitespace-nowrap text-[11px] font-semibold text-white/50">
                  <span className="md:hidden">Kredi K.</span>
                  <span className="hidden md:inline">Kredi Kartı</span>
                </span>
                <span className="whitespace-nowrap text-xs font-bold text-white">
                  {formatTL(kkNet)}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-[6px]">
                <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-[#C4B5FD]" />
                <span className="text-[11px] font-semibold text-white/50">Havale</span>
                <span className="whitespace-nowrap text-xs font-bold text-white">
                  {formatTL(havaleNet)}
                </span>
              </div>
            </div>
          </div>

          {/* Gelir / Gider */}
          {/* desktop: Gelir + Gider stacked in the third column */}
          <div className="flex gap-[10px] px-6 pt-[14px] md:flex-col md:gap-4 md:p-0">
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
                  className="flex-1 rounded-[18px] bg-white px-4 py-[15px] shadow-[0_1px_2px_rgba(0,0,0,0.03),0_4px_10px_rgba(0,0,0,0.04)] md:flex md:flex-row md:items-center md:justify-between md:gap-4 md:border md:border-[#E4E4E7] md:px-6"
                >
                  <button
                    type="button"
                    onClick={() =>
                      goToIslemler({ tur: card.tur, takvim: PERIOD_QUERY[period] })
                    }
                    className="flex w-full cursor-pointer items-center gap-[11px] text-left md:w-auto md:min-w-0 md:flex-1"
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
                    className="mx-auto mt-4 flex w-fit cursor-pointer items-center justify-center gap-[5px] rounded-[9px] bg-[#F5F5F5] px-3 py-[7px] md:mx-0 md:mt-0 md:shrink-0 md:px-4 md:py-[9px]"
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
          </div>

          {/* Dönem filtreleri */}
          <div className="flex gap-2 px-6 pt-[14px] md:justify-center md:pt-8">
            {PERIODS.map((p) => {
              const selected = period === p
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className="flex-1 cursor-pointer rounded-[12px] py-[9px] text-center text-[13px] font-semibold md:flex-none md:px-8"
                  style={{
                    background: selected ? 'var(--seg-on)' : 'var(--seg)',
                    color: selected ? 'var(--seg-fg-on)' : 'var(--seg-fg)',
                  }}
                >
                  {PERIOD_LABELS[p]}
                </button>
              )
            })}
          </div>

          {/* Son işlemler */}
          <div className="flex items-center justify-between px-6 pt-[22px] md:pt-10">
            <span className="text-[15px] font-bold tracking-[-0.3px] text-ink">Son İşlemler</span>
            <button
              type="button"
              onClick={() => goToIslemler({ takvim: PERIOD_QUERY[period] })}
              className="cursor-pointer text-[13px] font-semibold text-danger"
            >
              Tümü
            </button>
          </div>
          <div className="mx-6 mt-3 flex flex-col gap-[10px] md:mt-4">
            {islemler.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-muted">
                Henüz onaylanmış işlem yok.
              </p>
            ) : (
              // transferin eş bacağı gizli — aktarım tek satır görünür (041)
              islemler
                .filter((i) => !isTransferEs(i))
                .slice(0, 4)
                .map((i) => {
                  const origin = islemOrigin(i)
                  return (
                    <TxCard
                      key={i.id}
                      islem={i}
                      variant="white"
                      onOpen={origin ? () => void navigate(origin) : undefined}
                    />
                  )
                })
            )}
          </div>

          {/* Raporlar carousel */}
          <div className="pt-[22px] md:pt-10">
            <div className="mb-[14px] px-6 text-[15px] font-bold tracking-[-0.3px] text-ink">
              Raporlar
            </div>
            <div
              className="flex snap-x snap-mandatory items-start overflow-x-auto overflow-y-hidden md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:px-6"
              onScroll={(e) => {
                const el = e.currentTarget
                const idx = Math.round(el.scrollLeft / el.clientWidth)
                if (idx !== widgetIndex) setWidgetIndex(idx)
              }}
            >
              <div className="w-full shrink-0 snap-start px-6 md:px-0">
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
              <div className="w-full shrink-0 snap-start px-6 md:px-0">
                <SpendingCard
                  islemler={islemler}
                  year={currentYear}
                  selectedMonth={selectedMonth}
                />
              </div>
              <div className="w-full shrink-0 snap-start px-6 md:px-0">
                <RecurringCard
                  sabitGiderler={sabitGiderler}
                  tekrarKurallari={tekrarKurallari}
                  maaslar={maaslar}
                />
              </div>
            </div>
            <div className="mt-3 flex justify-center gap-[6px] md:hidden">
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
          position:fixed and pin the button to the scroll content.
          Offset mirrors the nav's height (12px pt + ~41px content +
          max(20px, safe-area) pb) plus a 12px gap — the old 72px+env()
          landed ON the nav in Safari, where the inset is 0. */}
      {isYonetici &&
        createPortal(
          <div className="pointer-events-none fixed inset-x-0 bottom-[calc(65px+max(20px,env(safe-area-inset-bottom)))] z-40 mx-auto flex w-full max-w-[480px] justify-center md:bottom-8">
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

      {/* Bakiyeler dönem filtresinden BAĞIMSIZ olmalı: aktarım tüm zamanların
          kova bakiyesini taşır, "Bugün" penceresini değil (041) */}
      <TransferModal
        open={transferOpen}
        businessId={businessId}
        nakitKurus={nakitTumu}
        kkKurus={kkTumu}
        onClose={() => setTransferOpen(false)}
      />

      {/* Cepten Ödeme (052): nakit kovası CANLI yükselir — bakiye gibi dönem
          filtresinden bağımsız, tüm zamanların nakit bakiyesi kullanılır */}
      <CeptenOdemeModal
        open={ceptenOpen}
        businessId={businessId}
        nakitKurus={nakitTumu}
        onClose={() => setCeptenOpen(false)}
      />
    </div>
  )
}
