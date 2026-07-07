import { Navigate, Outlet } from 'react-router'
import type { Role } from '../lib/types'
import { homePathFor } from '../lib/rbac'
import { useAuth } from './providers/AuthProvider'
import { useBusiness } from './providers/BusinessProvider'

export function Splash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-white">
      <div className="text-2xl font-bold tracking-[-0.4px] text-ink">PilotGarage</div>
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-divider border-t-ink" />
    </div>
  )
}

/** Session required — otherwise Giriş Yap. */
export function RequireAuth() {
  const { session, loading } = useAuth()
  if (loading) return <Splash />
  if (!session) return <Navigate to="/giris" replace />
  return <Outlet />
}

/**
 * Active + role assigned required. PENDING, DISABLED and the explicit
 * NULL-role case all land on the "onay bekliyor" gate — they also get
 * zero rows from RLS, this guard is just the friendly face of it.
 */
export function RequireActive() {
  const { profile } = useAuth()
  if (!profile) return <Splash />
  if (profile.status !== 'ACTIVE' || profile.role === null) {
    return <Navigate to="/onay-bekliyor" replace />
  }
  return <Outlet />
}

/** An active business must be chosen (auto-chosen when there is only one). */
export function RequireBusiness() {
  const { activeBusiness, businessesLoading } = useBusiness()
  if (businessesLoading) return <Splash />
  if (!activeBusiness) return <Navigate to="/isletme-sec" replace />
  return <Outlet />
}

/** Role gate — mirrors RLS, never a substitute for it. */
export function RequireRole({ roles }: { roles: Role[] }) {
  const { profile } = useAuth()
  if (!profile) return <Splash />
  if (profile.role === null || !roles.includes(profile.role)) {
    return <Navigate to={homePathFor(profile.role)} replace />
  }
  return <Outlet />
}

export function HomeRedirect() {
  const { profile } = useAuth()
  return <Navigate to={homePathFor(profile?.role ?? null)} replace />
}
