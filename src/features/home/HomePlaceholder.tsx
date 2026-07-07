import { useNavigate } from 'react-router'
import { useAuth } from '../../app/providers/AuthProvider'
import { useBusiness } from '../../app/providers/BusinessProvider'

/**
 * Sprint 0 landing screen. The real dashboards arrive with Sprint 1
 * (kayıt list) and Sprint 2 (finance) — this proves the auth -> business
 * -> shell pipeline end to end.
 */
export default function HomePlaceholder({ title }: { title: string }) {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const { activeBusiness, businesses } = useBusiness()

  return (
    <div className="px-6 screen-forward">
      <header className="pb-5 pt-14">
        <p className="text-[11px] font-bold uppercase tracking-[0.6px] text-faint">
          {activeBusiness?.name ?? ''}
        </p>
        <h1 className="mt-1 text-[26px] font-bold tracking-[-0.4px] text-ink">{title}</h1>
      </header>

      <div className="rounded-[16px] bg-card p-[18px]">
        <p className="text-[15px] font-semibold text-ink">
          Hoş geldin{profile?.full_name ? `, ${profile.full_name}` : ''} 👋
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Kayıt listesi Sprint 1&apos;de, finans ekranları Sprint 2&apos;de burada olacak.
        </p>
      </div>

      <div className="mt-4 overflow-hidden rounded-[16px] bg-card">
        {businesses.length > 1 && (
          <button
            type="button"
            onClick={() => void navigate('/isletme-sec')}
            className="flex w-full cursor-pointer items-center justify-between border-b border-divider px-[18px] py-4 text-left"
          >
            <span className="text-[15px] font-medium text-ink">İşletme Değiştir</span>
            <span className="text-sm text-faint">{activeBusiness?.name}</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex w-full cursor-pointer items-center px-[18px] py-4 text-left"
        >
          <span className="text-[15px] font-medium text-danger">Çıkış Yap</span>
        </button>
      </div>
    </div>
  )
}
