import { useRef, useState, type TouchEvent } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from './providers/AuthProvider'
import { useBusiness } from './providers/BusinessProvider'
import { useBildirimler } from '../features/settings/api'

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

function SwapNavIcon({ color }: { color: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 014-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 01-4 4H3" />
    </svg>
  )
}

function TrashNavIcon({ color }: { color: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  )
}

function GearNavIcon({ color }: { color: string }) {
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
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
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

// var() so the nav icons/labels follow the dark-mode ink token
const ACTIVE = 'var(--color-ink)'
const INACTIVE = '#ADADAD'

/** Yönetici + Muhasebe nav: Kayıt | + | Yönetim (Yönetim wired in Sprint 2). */
function YoneticiNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const onKayit = pathname.startsWith('/yonetici') || pathname.startsWith('/kayit')
  const onYonetim = pathname.startsWith('/yonetim')
  return (
    <nav className="shrink-0 border-t border-divider bg-white px-2 pb-[max(20px,env(safe-area-inset-bottom))] pt-[12px]">
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
    <nav className="shrink-0 border-t border-divider bg-white px-2 pb-[max(20px,env(safe-area-inset-bottom))] pt-[12px]">
      <div className="flex items-center justify-around">
        <button
          type="button"
          onClick={() => void navigate('/personel')}
          className="flex min-w-[52px] cursor-pointer flex-col items-center gap-[3px]"
        >
          <DocIcon color={onHome ? ACTIVE : INACTIVE} />
          <span
            className="text-[10px] font-semibold"
            style={{ color: onHome ? ACTIVE : INACTIVE }}
          >
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
          onClick={() => void navigate('/ayarlar')}
          className="flex min-w-[52px] cursor-pointer flex-col items-center gap-[3px]"
        >
          <UserIcon color={pathname.startsWith('/ayarlar') ? ACTIVE : INACTIVE} />
          <span
            className="text-[10px] font-semibold"
            style={{ color: pathname.startsWith('/ayarlar') ? ACTIVE : INACTIVE }}
          >
            Profil
          </span>
        </button>
      </div>
    </nav>
  )
}

/** Desktop-only dark top bar; replaces the bottom nav on md+ screens. */
function TopBar({ isPersonel }: { isPersonel: boolean }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { activeBusiness, businesses } = useBusiness()
  const { data: bildirimler = [] } = useBildirimler()
  const unread = bildirimler.filter((b) => !b.read_at).length
  const items = isPersonel
    ? [
        { to: '/personel', label: 'Kayıtlar', icon: DocIcon, active: pathname.startsWith('/personel') },
      ]
    : [
        { to: '/yonetici', label: 'Kayıt', icon: DocIcon, active: pathname.startsWith('/yonetici') || pathname.startsWith('/kayit/') },
        { to: '/yonetim', label: 'Finans', icon: GridIcon, active: pathname.startsWith('/yonetim') },
      ]
  const iconLinks = [
    ...(isPersonel
      ? []
      : [{ to: '/yonetim/cop', label: 'Çöp Kutusu', icon: TrashNavIcon, active: pathname.startsWith('/yonetim/cop') }]),
    { to: '/bildirimler', label: 'Bildirimler', icon: BellIcon, active: pathname.startsWith('/bildirimler') },
    { to: '/ayarlar', label: 'Ayarlar', icon: GearNavIcon, active: pathname.startsWith('/ayarlar') },
  ]
  return (
    <header className="hidden h-14 shrink-0 items-center bg-[#202024]/80 px-6 backdrop-blur-md md:absolute md:inset-x-0 md:top-0 md:z-30 md:flex">
      <div className="flex w-[220px] items-center gap-2">
        <span className="truncate text-[17px] font-bold tracking-[-0.3px] text-white">
          {activeBusiness?.name ?? 'PilotGarage'}
        </span>
        {businesses.length > 1 && (
          <button
            type="button"
            aria-label="İşletme değiştir"
            onClick={() => void navigate('/isletme-sec')}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[9px] bg-white/10"
          >
            <SwapNavIcon color="#B5B5B5" />
          </button>
        )}
      </div>
      <nav className="flex flex-1 items-center justify-center gap-2">
        {items.map((it) => (
          <button
            key={it.to}
            type="button"
            onClick={() => void navigate(it.to)}
            className="cursor-pointer rounded-[8px] px-4 py-[7px] text-sm font-semibold"
            style={{
              background: it.active ? '#fff' : 'transparent',
              color: it.active ? '#111' : '#B5B5B5',
            }}
          >
            {it.label}
          </button>
        ))}
      </nav>
      <div className="flex w-[220px] items-center justify-end gap-1">
        {iconLinks.map((it) => (
          <button
            key={it.to}
            type="button"
            aria-label={it.label}
            onClick={() => void navigate(it.to)}
            className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-full"
            style={{ background: it.active ? '#fff' : 'transparent' }}
          >
            <it.icon color={it.active ? '#111' : '#B5B5B5'} />
            {it.to === '/bildirimler' && unread > 0 && (
              <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9.5px] font-bold text-white">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
        ))}
      </div>
    </header>
  )
}

export default function AppShell() {
  const { profile } = useAuth()
  const isPersonel = profile?.role === 'PERSONEL'

  // Pull-to-refresh (mobile PWA has no browser refresh): pulling down from
  // the top of the scroll area past the threshold refetches every query.
  const queryClient = useQueryClient()
  const mainRef = useRef<HTMLElement>(null)
  const startY = useRef<number | null>(null)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  function onTouchStart(e: TouchEvent) {
    startY.current =
      (mainRef.current?.scrollTop ?? 1) <= 0 ? e.touches[0].clientY : null
  }
  function onTouchMove(e: TouchEvent) {
    if (startY.current === null || refreshing) return
    const dy = e.touches[0].clientY - startY.current
    if (dy > 0 && (mainRef.current?.scrollTop ?? 1) <= 0) {
      setPull(Math.min(100, dy * 0.45))
    } else {
      setPull(0)
      startY.current = null
    }
  }
  function onTouchEnd() {
    startY.current = null
    if (pull > 55 && !refreshing) {
      setRefreshing(true)
      setPull(52)
      void queryClient.invalidateQueries().finally(() => {
        setTimeout(() => {
          setRefreshing(false)
          setPull(0)
        }, 350)
      })
    } else {
      setPull(0)
    }
  }

  return (
    // Desktop: dark top navigation bar + full-width content below.
    // Mobile keeps the centered phone column + bottom nav.
    <div className="relative flex h-dvh flex-col bg-white md:bg-[#FAFAF9]">
      <TopBar isPersonel={isPersonel} />
      <div className="relative flex min-h-0 flex-1 flex-col">
        {(pull > 8 || refreshing) && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2">
            <div
              className={`h-6 w-6 rounded-full border-[2.5px] border-divider border-t-ink ${
                refreshing ? 'animate-spin' : ''
              }`}
              style={{ transform: refreshing ? undefined : `rotate(${pull * 3.4}deg)` }}
            />
          </div>
        )}
        <main
          ref={mainRef}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain"
          style={{
            transform: pull > 0 ? `translateY(${pull}px)` : undefined,
            transition: startY.current === null ? 'transform 0.25s ease' : 'none',
          }}
        >
          <div className="mx-auto w-full max-w-[480px] md:max-w-none md:px-10 md:pb-10 md:pt-16 xl:px-14">
            <Outlet />
          </div>
        </main>
      </div>
      <div className="shrink-0 md:hidden">
        {isPersonel ? <PersonelNav /> : <YoneticiNav />}
      </div>
    </div>
  )
}
