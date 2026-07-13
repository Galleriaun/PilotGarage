import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import { safeStorage } from '../../lib/storage'
import { supabase } from '../../lib/supabase'
import type { Business } from '../../lib/types'
import { useAuth } from './AuthProvider'

const STORAGE_KEY = 'pg.activeBusiness'

interface BusinessContextValue {
  /** Businesses this user can access — RLS decides, not the client. */
  businesses: Business[]
  activeBusiness: Business | null
  businessesLoading: boolean
  selectBusiness: (id: string) => void
}

const BusinessContext = createContext<BusinessContextValue | null>(null)

export function BusinessProvider({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth()
  const enabled =
    session !== null && profile !== null && profile.status === 'ACTIVE' && profile.role !== null

  const { data: businesses = [], isPending } = useQuery({
    queryKey: ['businesses', session?.user.id],
    queryFn: async (): Promise<Business[]> => {
      const { data, error } = await supabase.from('businesses').select('*')
      if (error) throw error
      // SERVIS (PilotGarage) listed first, as in the design
      return (data as Business[]).sort((a, b) =>
        a.code === b.code ? 0 : a.code === 'SERVIS' ? -1 : 1,
      )
    },
    enabled,
  })

  const [activeId, setActiveId] = useState<string | null>(() =>
    safeStorage.getItem(STORAGE_KEY),
  )

  const selectBusiness = useCallback((id: string) => {
    safeStorage.setItem(STORAGE_KEY, id)
    setActiveId(id)
  }, [])

  // Signed out -> forget the selection. `session` is also null while auth
  // is still hydrating on a cold boot — clearing then would wipe the
  // persisted selection on every app launch (İşletme Seç on each open).
  useEffect(() => {
    if (!loading && !session) {
      safeStorage.removeItem(STORAGE_KEY)
      setActiveId(null)
    }
  }, [loading, session])

  // Exactly one accessible business -> skip İşletme Seç entirely
  useEffect(() => {
    if (enabled && !isPending && businesses.length === 1) {
      const only = businesses[0]
      if (only && only.id !== activeId) selectBusiness(only.id)
    }
  }, [enabled, isPending, businesses, activeId, selectBusiness])

  // A stale/revoked selection resolves to null -> guards send the user
  // back to İşletme Seç instead of showing the wrong business.
  const activeBusiness = businesses.find((b) => b.id === activeId) ?? null

  return (
    <BusinessContext.Provider
      value={{
        businesses,
        activeBusiness,
        businessesLoading: enabled && isPending,
        selectBusiness,
      }}
    >
      {children}
    </BusinessContext.Provider>
  )
}

export function useBusiness(): BusinessContextValue {
  const ctx = useContext(BusinessContext)
  if (!ctx) throw new Error('useBusiness, BusinessProvider içinde kullanılmalı')
  return ctx
}
