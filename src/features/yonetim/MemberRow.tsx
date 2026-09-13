import { formatTL, numericStringToKurus } from '../../lib/money'
import { Avatar } from './shared'
import { ROLE_LABELS, type Member } from './types'

export function ChevronRightSm() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#ADADAD"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

/** Personel kartı — Personel ve Devre Dışı ekranları aynı kartı kullanır. */
export function MemberRow({
  member: m,
  izinde,
  maasGizli,
  onOpen,
}: {
  member: Member
  izinde: boolean
  /** 063: maaş rakamı yalnızca Yöneticiye görünür; ödeme günü herkese */
  maasGizli: boolean
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="pressable flex w-full cursor-pointer items-center gap-3 rounded-[16px] bg-card px-4 py-[14px] text-left"
    >
      <Avatar name={m.profile.full_name || '?'} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-bold text-ink">
          {m.profile.full_name || 'İsimsiz'}
        </div>
        <div className="mt-[2px] flex items-center gap-[6px] text-[13px] text-muted">
          <span>
            {m.profile.status === 'DISABLED'
              ? 'Devre dışı'
              : m.profile.role
                ? ROLE_LABELS[m.profile.role]
                : '—'}
          </span>
          {izinde && (
            <span className="flex shrink-0 items-center gap-[4px]">
              <span className="h-[6px] w-[6px] rounded-full bg-warn" />
              <span className="font-semibold text-warn">İzinde</span>
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0 text-right">
        {!maasGizli && (
          <div className="text-sm font-bold text-ink">
            {formatTL(numericStringToKurus(String(m.maas)))}
          </div>
        )}
        <div className={`${maasGizli ? '' : 'mt-[2px] '}text-[11.5px] text-muted`}>
          {m.odeme_gunu > 0 ? `Her ayın ${m.odeme_gunu}.` : 'Elle ödeme'}
        </div>
      </div>
      <ChevronRightSm />
    </button>
  )
}
