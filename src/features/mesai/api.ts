import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { istanbulTodayISO, shiftDaysISO } from '../../lib/dates'

export interface MesaiKayit {
  id: string
  profile_id: string
  tip: 'GIRIS' | 'CIKIS'
  kaynak: 'IP' | 'KONUM' | 'MANUEL'
  mesafe_m: number | null
  created_at: string
  profile?: { full_name: string } | null
}

export interface AcikOturum {
  profileId: string
  name: string
  since: string // GIRIŞ created_at
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const uid = data.session?.user.id
  if (!uid) throw new Error('Oturum bulunamadı — yeniden giriş yapın.')
  return uid
}

/** Current user's own mesai rows for a business (newest first). */
export function useMyMesai(businessId: string) {
  return useQuery({
    queryKey: ['mesai-mine', businessId],
    queryFn: async (): Promise<MesaiKayit[]> => {
      const uid = await currentUserId()
      const { data, error } = await supabase
        .from('mesai_kayitlari')
        .select('id, profile_id, tip, kaynak, mesafe_m, created_at')
        .eq('business_id', businessId)
        .eq('profile_id', uid)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as MesaiKayit[]
    },
    enabled: businessId !== '',
  })
}

/**
 * All staff mesai rows for the finance report, scoped to an Istanbul date
 * range (inclusive, YYYY-MM-DD). `range = null` → all time (capped at 1000).
 * Istanbul is UTC+3 year-round, so the day bounds map cleanly to +03:00.
 */
export function useMesaiKayitlari(
  businessId: string,
  range: { start: string; end: string } | null,
) {
  return useQuery({
    queryKey: ['mesai-all', businessId, range?.start ?? 'all', range?.end ?? 'all'],
    queryFn: async (): Promise<MesaiKayit[]> => {
      let q = supabase
        .from('mesai_kayitlari')
        .select(
          'id, profile_id, tip, kaynak, mesafe_m, created_at, profile:profiles!mesai_kayitlari_profile_id_fkey(full_name)',
        )
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
      if (range) {
        q = q
          .gte('created_at', `${range.start}T00:00:00+03:00`)
          .lte('created_at', `${range.end}T23:59:59.999+03:00`)
      } else {
        q = q.limit(1000)
      }
      const { data, error } = await q
      if (error) throw error
      return data as unknown as MesaiKayit[]
    },
    enabled: businessId !== '',
  })
}

/** One staff member's mesai rows in a date range — per-person detail screen. */
export function useMesaiKisiKayitlari(
  businessId: string,
  profileId: string,
  range: { start: string; end: string } | null,
) {
  return useQuery({
    queryKey: ['mesai-kisi', businessId, profileId, range?.start ?? 'all', range?.end ?? 'all'],
    queryFn: async (): Promise<MesaiKayit[]> => {
      let q = supabase
        .from('mesai_kayitlari')
        .select(
          'id, profile_id, tip, kaynak, mesafe_m, created_at, profile:profiles!mesai_kayitlari_profile_id_fkey(full_name)',
        )
        .eq('business_id', businessId)
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false })
      if (range) {
        q = q
          .gte('created_at', `${range.start}T00:00:00+03:00`)
          .lte('created_at', `${range.end}T23:59:59.999+03:00`)
      } else {
        q = q.limit(1000)
      }
      const { data, error } = await q
      if (error) throw error
      return data as unknown as MesaiKayit[]
    },
    enabled: businessId !== '' && profileId !== '',
  })
}

/**
 * Who is currently clocked in — anyone whose latest event is a GIRIŞ.
 * Looks back a few days (the nightly auto-close keeps stale sessions out).
 */
export function useMesaiAcikOturumlar(businessId: string) {
  return useQuery({
    queryKey: ['mesai-acik', businessId],
    queryFn: async (): Promise<AcikOturum[]> => {
      const since = shiftDaysISO(istanbulTodayISO(), -3)
      const { data, error } = await supabase
        .from('mesai_kayitlari')
        .select(
          'profile_id, tip, created_at, profile:profiles!mesai_kayitlari_profile_id_fkey(full_name)',
        )
        .eq('business_id', businessId)
        .gte('created_at', `${since}T00:00:00+03:00`)
        .order('created_at', { ascending: false })
      if (error) throw error
      const rows = data as unknown as MesaiKayit[]
      const seen = new Set<string>()
      const acik: AcikOturum[] = []
      for (const r of rows) {
        if (seen.has(r.profile_id)) continue // rows are newest-first: first = latest
        seen.add(r.profile_id)
        if (r.tip === 'GIRIS') {
          acik.push({
            profileId: r.profile_id,
            name: r.profile?.full_name || 'İsimsiz',
            since: r.created_at,
          })
        }
      }
      return acik
    },
    enabled: businessId !== '',
  })
}

export interface MesaiKonum {
  konum_lat: number | null
  konum_lng: number | null
  konum_yaricap_m: number
  statik_ipler: string[]
}

export function useMesaiKonum(businessId: string) {
  return useQuery({
    queryKey: ['mesai-konum', businessId],
    queryFn: async (): Promise<MesaiKonum> => {
      const { data, error } = await supabase
        .from('businesses')
        .select('konum_lat, konum_lng, konum_yaricap_m, statik_ipler')
        .eq('id', businessId)
        .single()
      if (error) throw error
      return data as MesaiKonum
    },
    enabled: businessId !== '',
  })
}

export function useSaveMesaiKonum() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { businessId: string } & MesaiKonum) => {
      const { error } = await supabase
        .from('businesses')
        .update({
          konum_lat: input.konum_lat,
          konum_lng: input.konum_lng,
          konum_yaricap_m: input.konum_yaricap_m,
          statik_ipler: input.statik_ipler,
        })
        .eq('id', input.businessId)
      if (error) throw error
    },
    onSuccess: (_d, { businessId }) => {
      void queryClient.invalidateQueries({ queryKey: ['mesai-konum', businessId] })
    },
  })
}

/** Does the caller's IP alone satisfy the business (office WiFi)? */
export async function checkMesaiIp(businessId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('mesai_ip_uygun', { p_business: businessId })
  if (error) throw error
  return data as boolean
}

export interface MesaiSonuc {
  kaynak: 'IP' | 'KONUM'
  mesafe_m: number | null
  tip: 'GIRIS' | 'CIKIS'
}

/** Records the giriş/çıkış; server verifies IP/distance and may reject. */
export async function mesaiGirisCikis(
  businessId: string,
  tip: 'GIRIS' | 'CIKIS',
  lat: number | null,
  lng: number | null,
): Promise<MesaiSonuc> {
  const { data, error } = await supabase.rpc('mesai_giris_cikis', {
    p_business: businessId,
    p_tip: tip,
    p_lat: lat,
    p_lng: lng,
  })
  if (error) throw error
  return data as MesaiSonuc
}

export function useInvalidateMesai() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['mesai-mine'] })
    void queryClient.invalidateQueries({ queryKey: ['mesai-all'] })
    void queryClient.invalidateQueries({ queryKey: ['mesai-kisi'] })
    void queryClient.invalidateQueries({ queryKey: ['mesai-acik'] })
  }
}

function useMesaiInvalidateOnSuccess() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['mesai-mine'] })
    void queryClient.invalidateQueries({ queryKey: ['mesai-all'] })
    void queryClient.invalidateQueries({ queryKey: ['mesai-kisi'] })
    void queryClient.invalidateQueries({ queryKey: ['mesai-acik'] })
  }
}

/** Finance-only: add a manual giriş/çıkış record for a staff member. */
export function useMesaiManuelEkle() {
  const invalidate = useMesaiInvalidateOnSuccess()
  return useMutation({
    mutationFn: async (input: {
      businessId: string
      profileId: string
      tip: 'GIRIS' | 'CIKIS'
      zaman: string // timestamptz ISO
    }) => {
      const { error } = await supabase.rpc('mesai_manuel_ekle', {
        p_business: input.businessId,
        p_profile: input.profileId,
        p_tip: input.tip,
        p_zaman: input.zaman,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

/** Finance-only: change a record's timestamp. */
export function useMesaiKayitGuncelle() {
  const invalidate = useMesaiInvalidateOnSuccess()
  return useMutation({
    mutationFn: async (input: { kayitId: string; zaman: string }) => {
      const { error } = await supabase.rpc('mesai_kayit_guncelle', {
        p_kayit: input.kayitId,
        p_zaman: input.zaman,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

/** Finance-only: delete a record (goes to trash). */
export function useMesaiKayitSil() {
  const invalidate = useMesaiInvalidateOnSuccess()
  return useMutation({
    mutationFn: async (kayitId: string) => {
      const { error } = await supabase.rpc('mesai_kayit_sil', { p_kayit: kayitId })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}
