import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useBusiness } from '../../app/providers/BusinessProvider'
import { periodRange, type PeriodKey } from '../finans/selectors'
import { BackChevron } from '../auth/EyeIcon'
import { Avatar } from '../yonetim/shared'
import { useMesaiKayitlari } from './api'
import { buildReports, formatDuration } from './report'

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'BUGUN', label: 'Bugün' },
  { key: 'HAFTA', label: 'Bu Hafta' },
  { key: 'AY', label: 'Bu Ay' },
  { key: 'TUMU', label: 'Tümü' },
]

export default function MesaiKayitlari() {
  const navigate = useNavigate()
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id ?? ''
  const [period, setPeriod] = useState<PeriodKey>('HAFTA')
  const range = useMemo(() => periodRange(period), [period])
  const { data: kayitlar = [], isPending } = useMesaiKayitlari(businessId, range)

  const reports = useMemo(() => buildReports(kayitlar, period), [kayitlar, period])

  const totalMin = reports.reduce((sum, r) => sum + r.totalMin, 0)
  const sessionCount = reports.reduce((sum, r) => sum + r.sessions.length, 0)

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

      <div className="flex items-center justify-between px-6 pt-4">
        <h1 className="text-[26px] font-bold tracking-[-0.4px] text-ink">Mesai Kayıtları</h1>
        <button
          type="button"
          onClick={() => void navigate('/mesai')}
          className="shrink-0 cursor-pointer rounded-[10px] bg-ink px-3 py-2 text-[13px] font-semibold text-white"
        >
          Giriş/Çıkış
        </button>
      </div>

      {/* Dönem filtreleri */}
      <div className="flex gap-2 overflow-x-auto px-6 pt-4">
        {PERIODS.map((p) => {
          const selected = period === p.key
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className="shrink-0 cursor-pointer whitespace-nowrap rounded-[20px] px-[14px] py-2 text-[13px] font-semibold"
              style={{
                background: selected ? 'var(--seg-on)' : 'var(--seg)',
                color: selected ? 'var(--seg-fg-on)' : 'var(--seg-fg)',
              }}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      {/* Özet */}
      <div className="mx-6 mt-4">
        <div
          className="rounded-[18px] px-5 py-4"
          style={{ background: 'linear-gradient(150deg,#1C1C1E,#0A0A0A)' }}
        >
          <div className="text-[11px] font-semibold tracking-[0.5px] text-white/50">
            TOPLAM MESAİ
          </div>
          <div className="mt-1 text-[26px] font-bold tracking-[-0.5px] text-white">
            {totalMin > 0 ? formatDuration(totalMin) : '—'}
          </div>
          <div className="mt-[2px] text-[12px] text-white/50">
            {reports.length} kişi · {sessionCount} oturum
          </div>
        </div>
      </div>

      {isPending ? (
        <div className="flex justify-center py-14">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-divider border-t-ink" />
        </div>
      ) : reports.length === 0 ? (
        <div className="px-6 py-16 text-center text-[13px] text-muted">
          Bu dönemde mesai kaydı yok.
        </div>
      ) : (
        <div className="flex flex-col gap-2 px-6 pt-4">
          {reports.map((r) => (
            <button
              key={r.profileId}
              type="button"
              onClick={() =>
                void navigate(`/yonetim/mesai/${r.profileId}`, { state: { name: r.name } })
              }
              className="pressable flex w-full cursor-pointer items-center gap-3 rounded-[16px] bg-card px-4 py-3 text-left"
            >
              <Avatar name={r.name} size={38} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-ink">{r.name}</div>
                <div className="mt-[2px] text-[11px] text-muted">
                  {r.sessions.length} oturum
                  {r.hasOpen && <span className="text-success"> · şu an mesaide</span>}
                </div>
              </div>
              <div className="shrink-0 text-[14px] font-bold text-ink">
                {r.totalMin > 0 ? formatDuration(r.totalMin) : '—'}
              </div>
              <svg
                className="shrink-0 text-faint"
                width="8" height="14" viewBox="0 0 9 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              >
                <polyline points="1 1 8 8 1 15" />
              </svg>
            </button>
          ))}
        </div>
      )}
      <div className="h-10" />
    </div>
  )
}
