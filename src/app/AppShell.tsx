import { Outlet, useLocation, useNavigate } from 'react-router'
import AccountMenu from '../components/ui/AccountMenu'
import { useAuth } from './providers/AuthProvider'

function DocIcon({ color }: { color: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
    </svg>
  )
}

function GridIcon({ color }: { color: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  )
}

function HomeIcon({ color }: { color: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

function BellIcon({ color }: { color: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  )
}

function UserIcon({ color }: { color: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function PlusFab({ size }: { size: number }) {
  return (
    <span
      className="flex items-center justify-center rounded-[16px] bg-ink shadow-[0_4px_16px_rgba(0,0,0,0.2)]"
      style={{ width: size, height: size }}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
      >
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </span>
  )
}

const ACTIVE = '#111'
const INACTIVE = '#ADADAD'

/** Yönetici + Muhasebe nav: Kayıt | + | Yönetim (Yönetim wired in Sprint 2). */
function YoneticiNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const onKayit = pathname.startsWith('/yonetici') || pathname.startsWith('/kayit')
  const onYonetim = pathname.startsWith('/yonetim')
  return (
    <nav className="shrink-0 border-t border-divider bg-white px-2 pb-[max(6px,env(safe-area-inset-bottom))] pt-[10px]">
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => void navigate('/yonetici')}
          className="flex flex-1 cursor-pointer flex-col items-center gap-[3px]"
        >
          <DocIcon color={onKayit ? ACTIVE : INACTIVE} />
          <span
            className="text-[10px] font-semibold"
            style={{ color: onKayit ? ACTIVE : INACTIVE }}
          >
            Kayıt
          </span>
        </button>
        <button
          type="button"
          onClick={() => void navigate('/kayit/yeni')}
          aria-label="Yeni Kayıt"
          className="flex flex-1 cursor-pointer items-center justify-center self-stretch"
        >
          <PlusFab size={50} />
        </button>
        <button
          type="button"
          onClick={() => void navigate('/yonetim')}
          className="flex flex-1 cursor-pointer flex-col items-center gap-[3px]"
        >
          <GridIcon color={onYonetim ? ACTIVE : INACTIVE} />
          <span
            className="text-[10px] font-semibold"
            style={{ color: onYonetim ? ACTIVE : INACTIVE }}
          >
            Yönetim
          </span>
        </button>
      </div>
    </nav>
  )
}

/** Personel nav: Ana Sayfa | Kayıtlar | + | Bildirimler | Profil. */
function PersonelNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const onHome = pathname.startsWith('/personel')
  return (
    <nav className="shrink-0 border-t border-divider bg-white px-2 pb-[max(6px,env(safe-area-inset-bottom))] pt-[10px]">
      <div className="flex items-center justify-around">
        <button
          type="button"
          onClick={() => void navigate('/personel')}
          className="flex min-w-[52px] cursor-pointer flex-col items-center gap-[3px]"
        >
          <HomeIcon color={onHome ? ACTIVE : INACTIVE} />
          <span
            className="text-[10px] font-semibold"
            style={{ color: onHome ? ACTIVE : INACTIVE }}
          >
            Ana Sayfa
          </span>
        </button>
        <button
          type="button"
          aria-label="Kayıtlar (yakında)"
          className="flex min-w-[52px] cursor-pointer flex-col items-center gap-[3px]"
        >
          <DocIcon color={INACTIVE} />
          <span className="text-[10px] font-semibold" style={{ color: INACTIVE }}>
            Kayıtlar
          </span>
        </button>
        <button
          type="button"
          onClick={() => void navigate('/kayit/yeni')}
          aria-label="Yeni Kayıt"
          className="-mt-[14px] cursor-pointer"
        >
          <PlusFab size={48} />
        </button>
        <button
          type="button"
          aria-label="Bildirimler"
          onClick={() => void navigate('/bildirimler')}
          className="flex min-w-[52px] cursor-pointer flex-col items-center gap-[3px]"
        >
          <BellIcon color={INACTIVE} />
          <span className="text-[10px] font-semibold" style={{ color: INACTIVE }}>
            Bildirimler
          </span>
        </button>
        <AccountMenu side="top">
          <button
            type="button"
            aria-label="Profil"
            className="flex min-w-[52px] cursor-pointer flex-col items-center gap-[3px]"
          >
            <UserIcon color={INACTIVE} />
            <span className="text-[10px] font-semibold" style={{ color: INACTIVE }}>
              Profil
            </span>
          </button>
        </AccountMenu>
      </div>
    </nav>
  )
}

export default function AppShell() {
  const { profile } = useAuth()
  const isPersonel = profile?.role === 'PERSONEL'
  return (
    // Desktop: gray backdrop with the app as a centered phone-width panel;
    // mobile keeps the edge-to-edge layout untouched.
    <div className="h-dvh md:bg-[#ECECEC] md:py-6">
      <div className="mx-auto flex h-full w-full max-w-[480px] flex-col overflow-hidden bg-white md:rounded-[28px] md:border md:border-[#E2E2E2] md:shadow-[0_24px_60px_rgba(0,0,0,0.10)]">
        <main className="flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain">
          <Outlet />
        </main>
        {isPersonel ? <PersonelNav /> : <YoneticiNav />}
      </div>
    </div>
  )
}
