import { formatRelativeDate, istanbulDateISO, istanbulTime } from '../../lib/dates'
import { inRange, periodRange, type PeriodKey } from '../finans/selectors'
import type { MesaiKayit } from './api'

export interface Session {
  startId: string // GIRIS row id
  endId: string | null // CIKIS row id (null = ongoing)
  start: string // GIRIS created_at
  end: string | null // CIKIS created_at (null = ongoing)
  startDate: string // Istanbul YYYY-MM-DD of giriş
  durationMin: number | null // null while ongoing
  kaynak: 'IP' | 'KONUM' | 'MANUEL'
}

export interface PersonSummary {
  sessions: Session[] // period-filtered, newest first
  totalMin: number // sum of completed sessions in period
  hasOpen: boolean
}

export interface PersonReport extends PersonSummary {
  profileId: string
  name: string
}

/** minutes -> "2s 30dk" | "45dk" | "3s". */
export function formatDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}dk`
  if (m === 0) return `${h}s`
  return `${h}s ${m}dk`
}

function makeSession(giris: MesaiKayit, cikis: MesaiKayit | null): Session {
  const durationMin =
    cikis == null
      ? null
      : Math.max(0, Math.round((new Date(cikis.created_at).getTime() - new Date(giris.created_at).getTime()) / 60000))
  return {
    startId: giris.id,
    endId: cikis?.id ?? null,
    start: giris.created_at,
    end: cikis?.created_at ?? null,
    startDate: istanbulDateISO(giris.created_at),
    durationMin,
    kaynak: giris.kaynak,
  }
}

function kaynakLabel(kaynak: Session['kaynak']): string {
  if (kaynak === 'IP') return 'Ofis ağı'
  if (kaynak === 'MANUEL') return 'Manuel'
  return 'Konum'
}

/** Pair one person's GIRIŞ→ÇIKIŞ events into sessions, filtered to the period. */
export function personSessions(events: MesaiKayit[], period: PeriodKey): PersonSummary {
  const range = periodRange(period)
  // Ascending order so GIRIŞ precedes its ÇIKIŞ.
  const asc = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at))
  const all: Session[] = []
  let open: MesaiKayit | null = null
  for (const ev of asc) {
    if (ev.tip === 'GIRIS') {
      if (open) all.push(makeSession(open, null)) // guarded server-side; defensive
      open = ev
    } else if (open) {
      all.push(makeSession(open, ev))
      open = null
    }
    // A ÇIKIŞ with no open GIRIŞ (fetch boundary) is skipped.
  }
  if (open) all.push(makeSession(open, null))

  const sessions = all
    .filter((s) => inRange(s.startDate, range))
    .sort((a, b) => b.start.localeCompare(a.start))
  let totalMin = 0
  let hasOpen = false
  for (const s of sessions) {
    if (s.durationMin != null) totalMin += s.durationMin
    else hasOpen = true
  }
  return { sessions, totalMin, hasOpen }
}

/** Group all staff rows into per-person reports for the selected period. */
export function buildReports(rows: MesaiKayit[], period: PeriodKey): PersonReport[] {
  const byPerson = new Map<string, MesaiKayit[]>()
  for (const r of rows) {
    const list = byPerson.get(r.profile_id)
    if (list) list.push(r)
    else byPerson.set(r.profile_id, [r])
  }

  const reports: PersonReport[] = []
  for (const [profileId, events] of byPerson) {
    const summary = personSessions(events, period)
    if (summary.sessions.length === 0) continue
    reports.push({
      profileId,
      name: events.find((e) => e.profile?.full_name)?.profile?.full_name || 'İsimsiz',
      ...summary,
    })
  }

  reports.sort((a, b) => b.totalMin - a.totalMin || a.name.localeCompare(b.name, 'tr-TR'))
  return reports
}

/** Session list grouped by day with a daily subtotal header. */
export function PersonSessions({
  sessions,
  onEdit,
  onDelete,
}: {
  sessions: Session[]
  onEdit?: (s: Session) => void
  onDelete?: (s: Session) => void
}) {
  const editable = Boolean(onEdit || onDelete)
  const days: { date: string; items: Session[]; subtotal: number }[] = []
  for (const s of sessions) {
    let day = days.find((d) => d.date === s.startDate)
    if (!day) {
      day = { date: s.startDate, items: [], subtotal: 0 }
      days.push(day)
    }
    day.items.push(s)
    if (s.durationMin != null) day.subtotal += s.durationMin
  }

  return (
    <div className="flex flex-col gap-3">
      {days.map((d) => (
        <div key={d.date}>
          <div className="mb-[6px] flex items-center justify-between">
            <span className="text-[12px] font-bold text-soft">{formatRelativeDate(d.date)}</span>
            {d.subtotal > 0 && (
              <span className="text-[12px] font-semibold text-muted">{formatDuration(d.subtotal)}</span>
            )}
          </div>
          <div className="flex flex-col gap-[6px]">
            {d.items.map((s) => (
              <div key={s.startId} className="flex items-center gap-2 text-[13px]">
                <span className="font-semibold text-ink">{istanbulTime(s.start)}</span>
                <span className="text-faint">→</span>
                {s.end ? (
                  <span className="font-semibold text-ink">{istanbulTime(s.end)}</span>
                ) : (
                  <span className="font-semibold text-success">devam ediyor</span>
                )}
                <span className="text-[11px] text-faint">· {kaynakLabel(s.kaynak)}</span>
                <div className="flex-1" />
                {s.durationMin != null && (
                  <span className="text-[12px] font-bold text-muted">{formatDuration(s.durationMin)}</span>
                )}
                {editable && (
                  <div className="flex items-center gap-1 pl-1">
                    {onEdit && (
                      <button
                        type="button"
                        onClick={() => onEdit(s)}
                        aria-label="Düzenle"
                        className="pressable flex h-7 w-7 cursor-pointer items-center justify-center rounded-[8px] text-muted"
                        style={{ background: 'var(--seg)' }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </button>
                    )}
                    {onDelete && (
                      <button
                        type="button"
                        onClick={() => onDelete(s)}
                        aria-label="Sil"
                        className="pressable flex h-7 w-7 cursor-pointer items-center justify-center rounded-[8px] text-danger"
                        style={{ background: 'var(--seg)' }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6M14 11v6" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
