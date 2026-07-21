import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useBusiness } from '../../app/providers/BusinessProvider'
import { periodRange, type PeriodKey } from '../finans/selectors'
import { BackChevron } from '../auth/EyeIcon'
import { useAktifIzinProfilleri } from '../yonetim/api'
import { Avatar } from '../yonetim/shared'
import { useMesaiAcikOturumlar, useMesaiKayitlari } from './api'
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
  const [period, setPeriod] = useState<PeriodKey>('BUGUN')
  const range = useMemo(() => periodRange(period), [period])
  const { data: kayitlar = [], isPending } = useMesaiKayitlari(businessId, range)
  const { data: acik = [] } = useMesaiAcikOturumlar(businessId)

  const reports = useMemo(() => buildReports(kayitlar, period), [kayitlar, period])
  // Live "şu an mesaide" — latest event is a GIRIŞ, independent of the period.
  const acikSet = useMemo(() => new Set(acik.map((a) => a.profileId)), [acik])
  // 048: bugün izinde olanlar. Fiili giriş izinden önce gelir — kişi
  // izindeyken gerçekten geldiyse "Şu an mesaide" doğrusudur.
  const { data: izindekiler = new Set<string>() } = useAktifIzinProfilleri(businessId)

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
          {reports.map((r) => {
            const mesaide = acikSet.has(r.profileId)
            const izinde = !mesaide && izindekiler.has(r.profileId)
            return (
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
                  <div className="mt-[3px] flex items-center gap-1.5 text-[11px]">
                    <span
                      className="h-[6px] w-[6px] shrink-0 rounded-full"
                      style={{
                        background: mesaide
                          ? 'var(--color-success)'
                          : izinde
                            ? 'var(--color-warn)'
                            : 'var(--color-faint)',
                      }}
                    />
                    <span
                      className="font-semibold"
                      style={{
                        color: mesaide
                          ? 'var(--color-success)'
                          : izinde
                            ? 'var(--color-warn)'
                            : 'var(--color-muted)',
                      }}
                    >
                      {mesaide ? 'Şu an mesaide' : izinde ? 'İzinde' : 'Mesaide değil'}
                    </span>
                    <span className="text-faint">· {r.sessions.length} oturum</span>
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
            )
          })}
        </div>
      )}
      <div className="h-10" />
    </div>
  )
}
