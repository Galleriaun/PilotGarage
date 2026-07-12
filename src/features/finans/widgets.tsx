import { useMemo } from 'react'
import { formatDayMonth, nextOccurrenceISO, TR_MONTHS, TR_MONTHS_FULL } from '../../lib/dates'
import { formatTL, numericStringToKurus } from '../../lib/money'
import type { Islem, SabitGider, TekrarKural } from './types'

// ── Nakit Akışı ──────────────────────────────────────────────

interface MonthAgg {
  month: number
  income: number
  expense: number
}

export function useCashFlowMonths(islemler: Islem[], year: number): MonthAgg[] {
  return useMemo(() => {
    const months: MonthAgg[] = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      income: 0,
      expense: 0,
    }))
    const prefix = `${year}-`
    for (const i of islemler) {
      if (!i.islem_tarihi.startsWith(prefix)) continue
      const m = Number(i.islem_tarihi.slice(5, 7)) - 1
      const agg = months[m]
      if (!agg) continue
      if (i.tur === 'GELIR') agg.income += i.kurus
      else agg.expense += i.kurus
    }
    return months
  }, [islemler, year])
}

export function CashFlowCard({
  months,
  year,
  selectedMonth,
  onSelectMonth,
  onSeeMonth,
}: {
  months: MonthAgg[]
  year: number
  selectedMonth: number
  onSelectMonth: (m: number) => void
  onSeeMonth: () => void
}) {
  const maxIncome = Math.max(1, ...months.map((m) => m.income))
  const maxExpense = Math.max(1, ...months.map((m) => m.expense))
  const selected = months[selectedMonth - 1] ?? { month: selectedMonth, income: 0, expense: 0 }
  const monthName = TR_MONTHS_FULL[selectedMonth - 1]

  return (
    <div className="rounded-[18px] bg-white px-4 pb-4 pt-[18px] shadow-[0_1px_2px_rgba(0,0,0,0.03),0_4px_10px_rgba(0,0,0,0.04)] md:border md:border-[#E4E4E7]">
      <div className="mb-[14px] flex items-center justify-between">
        <span className="text-[13px] font-bold text-ink">Nakit Akışı</span>
        <button
          type="button"
          onClick={onSeeMonth}
          className="cursor-pointer text-[13px] font-semibold text-danger"
        >
          {monthName} ayını gör
        </button>
      </div>
      <div className="overflow-x-auto">
        <div className="w-max min-w-full md:w-full">
          <div className="flex h-[88px] items-center gap-[10px]">
            {months.map((m) => {
              const isSelected = m.month === selectedMonth
              return (
                <button
                  key={m.month}
                  type="button"
                  onClick={() => onSelectMonth(m.month)}
                  className="flex h-full w-[30px] shrink-0 cursor-pointer flex-col items-center justify-center gap-[2px] md:w-auto md:flex-1"
                >
                  <div
                    className="w-full max-w-[22px] rounded-t-[5px] rounded-b-[2px]"
                    style={{
                      height: `${Math.max((m.income / maxIncome) * 42, 4)}px`,
                      background: isSelected ? '#22C55E' : '#C8EFD8',
                    }}
                  />
                  <div
                    className="w-full max-w-[22px] rounded-t-[2px] rounded-b-[5px]"
                    style={{
                      height: `${Math.max((m.expense / maxExpense) * 42, 4)}px`,
                      background: isSelected ? '#EF4444' : '#FBDCDC',
                    }}
                  />
                </button>
              )
            })}
          </div>
          <div className="mb-[18px] mt-2 flex gap-[10px]">
            {months.map((m) => (
              <button
                key={m.month}
                type="button"
                onClick={() => onSelectMonth(m.month)}
                className="w-[30px] shrink-0 cursor-pointer text-center text-[10px] font-bold md:w-auto md:flex-1"
                style={{ color: m.month === selectedMonth ? '#111' : '#ADADAD' }}
              >
                {TR_MONTHS[m.month - 1]}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mb-3 text-[13px] font-bold text-ink">
        {monthName} {year}
      </div>
      <div className="flex flex-col gap-[11px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-success" />
            <span className="text-[13px] font-medium text-soft">Gelir</span>
          </div>
          <span className="text-[13px] font-bold text-success">{formatTL(selected.income)}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-danger" />
            <span className="text-[13px] font-medium text-soft">Gider</span>
          </div>
          <span className="text-[13px] font-bold text-danger">{formatTL(selected.expense)}</span>
        </div>
        <div className="flex items-center justify-between border-t border-[#F3F3F3] pt-[9px]">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full border-[1.5px] border-ink" />
            <span className="text-[13px] font-medium text-soft">Net</span>
          </div>
          <span className="text-[13px] font-bold text-ink">
            {formatTL(selected.income - selected.expense)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Kategoriye Göre Harcama ──────────────────────────────────

const CAT_COLORS = ['#C62828', '#E08585', '#ADADAD', '#D4D4D4']
const CAT_ICON_BGS = ['#FEF3F2', '#FEF3F2', '#F2F2F2', '#F2F2F2']

export function SpendingCard({
  islemler,
  year,
  selectedMonth,
}: {
  islemler: Islem[]
  year: number
  selectedMonth: number
}) {
  const rows = useMemo(() => {
    const prefix = `${year}-${String(selectedMonth).padStart(2, '0')}`
    const byLabel = new Map<string, number>()
    let total = 0
    for (const i of islemler) {
      if (i.tur !== 'GIDER' || !i.islem_tarihi.startsWith(prefix)) continue
      const label = i.kategori?.label ?? 'Diğer'
      byLabel.set(label, (byLabel.get(label) ?? 0) + i.kurus)
      total += i.kurus
    }
    return {
      total,
      items: [...byLabel.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([label, kurus], idx) => ({
          label,
          kurus,
          pct: total > 0 ? Math.round((kurus / total) * 100) : 0,
          color: CAT_COLORS[Math.min(idx, CAT_COLORS.length - 1)] ?? '#D4D4D4',
          iconBg: CAT_ICON_BGS[Math.min(idx, CAT_ICON_BGS.length - 1)] ?? '#F2F2F2',
        })),
    }
  }, [islemler, year, selectedMonth])

  return (
    <div className="rounded-[18px] bg-white px-4 py-[18px] shadow-[0_1px_2px_rgba(0,0,0,0.03),0_4px_10px_rgba(0,0,0,0.04)] md:border md:border-[#E4E4E7]">
      <div className="mb-[2px] text-[13px] font-bold text-ink">Kategoriye Göre Harcama</div>
      <div className="mb-[14px] text-[11px] text-muted">
        {TR_MONTHS_FULL[selectedMonth - 1]} {year}
      </div>
      {rows.items.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-muted">Bu ay gider bulunmuyor.</p>
      ) : (
        <div className="flex flex-col gap-[2px]">
          {rows.items.map((cat, idx) => (
            <div
              key={cat.label}
              className="flex items-center gap-[10px] rounded-[10px] p-2"
              style={{ background: idx === 0 ? '#F0FDF4' : 'transparent' }}
            >
              <div
                className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px]"
                style={{ background: cat.iconBg }}
              >
                <div className="h-[9px] w-[9px] rounded-full" style={{ background: cat.color }} />
              </div>
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
                {cat.label}
              </span>
              <span className="shrink-0 text-xs font-semibold text-faint">%{cat.pct}</span>
              <span className="w-[70px] shrink-0 text-right text-[13px] font-bold text-ink">
                {formatTL(cat.kurus)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Sabit Ödemeler ───────────────────────────────────────────

function RefreshIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#888"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M23 4v6h-6" />
      <path d="M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
    </svg>
  )
}

export function RecurringCard({
  sabitGiderler,
  tekrarKurallari,
  maaslar,
}: {
  sabitGiderler: SabitGider[]
  tekrarKurallari: TekrarKural[]
  maaslar: { maas: number | string; odeme_gunu: number }[]
}) {
  const entries = useMemo(() => {
    const list: { key: string; title: string; dueISO: string; kurus: number }[] = []
    for (const sg of sabitGiderler) {
      list.push({
        key: `sg-${sg.id}`,
        title: sg.name,
        dueISO: nextOccurrenceISO(sg.odeme_gunu),
        kurus: numericStringToKurus(String(sg.tutar)),
      })
    }
    const maasByDay = new Map<number, number>()
    for (const m of maaslar) {
      maasByDay.set(
        m.odeme_gunu,
        (maasByDay.get(m.odeme_gunu) ?? 0) + numericStringToKurus(String(m.maas)),
      )
    }
    for (const [day, kurus] of maasByDay) {
      list.push({
        key: `maas-${day}`,
        title: 'Personel Maaşları',
        dueISO: nextOccurrenceISO(day),
        kurus,
      })
    }
    for (const r of tekrarKurallari) {
      if (r.tur !== 'GIDER') continue
      list.push({
        key: `tk-${r.id}`,
        title: r.baslik,
        dueISO: r.next_run,
        kurus: numericStringToKurus(String(r.tutar)),
      })
    }
    return list.sort((a, b) => a.dueISO.localeCompare(b.dueISO))
  }, [sabitGiderler, tekrarKurallari, maaslar])

  return (
    <div className="rounded-[18px] bg-white px-4 py-[18px] shadow-[0_1px_2px_rgba(0,0,0,0.03),0_4px_10px_rgba(0,0,0,0.04)] md:border md:border-[#E4E4E7]">
      <div className="mb-[14px] text-[13px] font-bold text-ink">Sabit Ödemeler</div>
      {entries.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-muted">Sabit ödeme bulunmuyor.</p>
      ) : (
        <div className="flex flex-col gap-[10px]">
          {entries.map((e) => (
            <div
              key={e.key}
              className="flex items-center gap-3 rounded-[14px] bg-card px-[14px] py-3"
            >
              <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-white">
                <RefreshIcon />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-bold text-ink">{e.title}</div>
                <div className="mt-[1px] text-[11px] text-muted">{formatDayMonth(e.dueISO)}</div>
              </div>
              <div className="shrink-0 text-[13px] font-bold text-ink">{formatTL(e.kurus)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
