import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../../app/providers/AuthProvider'
import { formatCreatedStamp } from '../../lib/dates'
import { BackChevron } from '../auth/EyeIcon'
import { BellOutlineIcon } from '../kayit/icons'
import { useBildirimler, useMarkAllRead, useNotifPrefs, wantsType } from './api'

export default function Bildirimler() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data: bildirimler = [], isPending } = useBildirimler()
  const { data: prefs = {} } = useNotifPrefs(profile?.id ?? '')
  const markAllRead = useMarkAllRead()

  // mark everything read once the list has loaded
  const marked = useRef(false)
  const hasUnread = bildirimler.some((b) => !b.read_at)
  useEffect(() => {
    if (!marked.current && hasUnread) {
      marked.current = true
      markAllRead.mutate()
    }
  }, [hasUnread, markAllRead])

  const shown = bildirimler.filter((b) => wantsType(prefs, b.type))

  return (
    <div className="screen-forward">
      <div className="px-6 pt-4">
        <button
          type="button"
          onClick={() => void navigate(-1)}
          className="inline-flex cursor-pointer items-center gap-1 py-[6px]"
        >
          <BackChevron />
          <span className="text-[15px] font-medium text-ink">Geri</span>
        </button>
      </div>

      <div className="px-6 pt-4">
        <h1 className="text-[26px] font-bold tracking-[-0.4px] text-ink">Bildirimler</h1>
      </div>

      {isPending ? (
        <div className="flex justify-center py-14">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-divider border-t-ink" />
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-[70px] text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-[17px] bg-field">
            <BellOutlineIcon />
          </div>
          <div className="mb-1 text-base font-bold text-ink">Bildirim yok</div>
          <div className="text-[13px] text-muted">Yeni bildirimler burada görünecek.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 px-6 pt-[18px]">
          {shown.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => b.link && void navigate(b.link)}
              className="flex cursor-pointer items-start gap-3 rounded-[16px] bg-card px-4 py-[13px] text-left"
            >
              <span
                className="mt-[6px] h-2 w-2 shrink-0 rounded-full"
                style={{ background: b.read_at ? '#D4D4D4' : '#C62828' }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-ink">{b.baslik}</div>
                {b.body && <div className="mt-[1px] truncate text-[13px] text-muted">{b.body}</div>}
                <div className="mt-[3px] text-[11px] text-faint">
                  {formatCreatedStamp(b.created_at)}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      <div className="h-10" />
    </div>
  )
}
