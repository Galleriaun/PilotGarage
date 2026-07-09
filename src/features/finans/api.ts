import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { istanbulTodayISO } from '../../lib/dates'
import { kurusToNumericString, numericStringToKurus } from '../../lib/money'
import type { OdemeYontemi } from '../../lib/types'
import type { Islem, IslemTur, Kategori, SabitGider, TekrarKural, TekrarSiklik } from './types'

// islemler has several FKs to profiles (created_by, onaylayan) — the
// creator embed must name its constraint explicitly.
const ISLEM_SELECT =
  '*, kategori:kategoriler(id,label,tur), creator:profiles!islemler_created_by_fkey(full_name)'

function withKurus(rows: unknown[]): Islem[] {
  return (rows as Omit<Islem, 'kurus'>[]).map((r) => ({
    ...r,
    kurus: numericStringToKurus(String(r.tutar)),
  }))
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const uid = data.session?.user.id
  if (!uid) throw new Error('Oturum bulunamadı — yeniden giriş yapın.')
  return uid
}

/**
 * Advance an ISO date one period. AYLIK/YILLIK clamp to the target month's
 * last day (Oca 31 -> Şub 28) — mirrors the server-side materializer.
 */
export function advanceDateISO(iso: string, siklik: TekrarSiklik): string {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number)
  if (siklik === 'HAFTALIK') {
    return new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10)
  }
  const targetYear = siklik === 'YILLIK' ? y + 1 : m === 12 ? y + 1 : y
  const targetMonth = siklik === 'YILLIK' ? m : m === 12 ? 1 : m + 1
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate()
  const day = Math.min(d, lastDay)
  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// ── Queries ──────────────────────────────────────────────────

export function useApprovedIslemler(businessId: string) {
  return useQuery({
    queryKey: ['islemler', businessId, 'ONAYLANDI'],
    queryFn: async (): Promise<Islem[]> => {
      const { data, error } = await supabase
        .from('islemler')
        .select(ISLEM_SELECT)
        .eq('business_id', businessId)
        .eq('durum', 'ONAYLANDI')
        .order('islem_tarihi', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return withKurus(data)
    },
    enabled: businessId !== '',
  })
}

export function usePendingIslemler(businessId: string) {
  return useQuery({
    queryKey: ['islemler', businessId, 'BEKLIYOR'],
    queryFn: async (): Promise<Islem[]> => {
      const { data, error } = await supabase
        .from('islemler')
        .select(ISLEM_SELECT)
        .eq('business_id', businessId)
        .eq('durum', 'BEKLIYOR')
        .order('created_at', { ascending: true }) // oldest first in the queue
      if (error) throw error
      return withKurus(data)
    },
    enabled: businessId !== '',
  })
}

export function useKategoriler(businessId: string) {
  return useQuery({
    queryKey: ['kategoriler', businessId],
    queryFn: async (): Promise<Kategori[]> => {
      const { data, error } = await supabase
        .from('kategoriler')
        .select('*')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .order('label')
      if (error) throw error
      return data as Kategori[]
    },
    enabled: businessId !== '',
  })
}

export function useSabitGiderler(businessId: string) {
  return useQuery({
    queryKey: ['sabit-giderler', businessId],
    queryFn: async (): Promise<SabitGider[]> => {
      const { data, error } = await supabase
        .from('sabit_giderler')
        .select('*')
        .eq('business_id', businessId)
        .order('odeme_gunu')
      if (error) throw error
      return data as SabitGider[]
    },
    enabled: businessId !== '',
  })
}

export function useTekrarKurallari(businessId: string) {
  return useQuery({
    queryKey: ['tekrar-kurallari', businessId],
    queryFn: async (): Promise<TekrarKural[]> => {
      const { data, error } = await supabase
        .from('tekrar_kurallari')
        .select('*')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .order('next_run')
      if (error) throw error
      return data as TekrarKural[]
    },
    enabled: businessId !== '',
  })
}

/** Members with automatic salary payment — feeds the Sabit Ödemeler widget. */
export function useMaasOdemeleri(businessId: string) {
  return useQuery({
    queryKey: ['maas-odemeleri', businessId],
    queryFn: async (): Promise<{ maas: number | string; odeme_gunu: number }[]> => {
      const { data, error } = await supabase
        .from('business_members')
        .select('maas, odeme_gunu')
        .eq('business_id', businessId)
        .gt('odeme_gunu', 0)
        .gt('maas', 0)
      if (error) throw error
      return data as { maas: number | string; odeme_gunu: number }[]
    },
    enabled: businessId !== '',
  })
}

// ── Mutations ────────────────────────────────────────────────

export interface AddIslemInput {
  businessId: string
  tur: IslemTur
  kurus: number
  baslik: string
  kategoriId: string | null
  odemeYontemi: OdemeYontemi
  /** null = Bir Kez; a frequency = Tekrarlanan (rule + first pending işlem) */
  tekrar: TekrarSiklik | null
}

export function useAddIslem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: AddIslemInput) => {
      const uid = await currentUserId()
      const tarih = istanbulTodayISO()
      let tekrarKuralId: string | null = null

      if (input.tekrar) {
        const { data, error } = await supabase
          .from('tekrar_kurallari')
          .insert({
            business_id: input.businessId,
            tur: input.tur,
            tutar: kurusToNumericString(input.kurus),
            baslik: input.baslik,
            kategori_id: input.kategoriId,
            siklik: input.tekrar,
            next_run: advanceDateISO(tarih, input.tekrar), // first instance is created now
            created_by: uid,
          })
          .select('id')
          .single()
        if (error) throw error
        tekrarKuralId = (data as { id: string }).id
      }

      const { error: islemError } = await supabase.from('islemler').insert({
        business_id: input.businessId,
        tur: input.tur,
        tutar: kurusToNumericString(input.kurus),
        baslik: input.baslik,
        kategori_id: input.kategoriId,
        kaynak: 'MANUEL',
        durum: 'BEKLIYOR',
        islem_tarihi: tarih,
        created_by: uid,
        odeme_yontemi: input.odemeYontemi,
        tekrar_kural_id: tekrarKuralId,
      })
      if (islemError) {
        // compensate: never leave an orphaned recurring rule that the cron
        // would keep materializing into money entries
        if (tekrarKuralId) {
          await supabase.from('tekrar_kurallari').delete().eq('id', tekrarKuralId)
        }
        throw islemError
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['islemler'] })
      void queryClient.invalidateQueries({ queryKey: ['tekrar-kurallari'] })
    },
  })
}

export function useApproveIslem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      islemId,
      odemeYontemi,
    }: {
      islemId: string
      odemeYontemi: OdemeYontemi | null
    }) => {
      const { error } = await supabase.rpc('approve_islem', {
        p_islem_id: islemId,
        p_odeme_yontemi: odemeYontemi,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['islemler'] })
    },
  })
}

export function useRejectIslem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ islemId }: { islemId: string }) => {
      const { error } = await supabase.rpc('reject_islem', { p_islem_id: islemId })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['islemler'] })
      // a rejected CARI_HESAP işlem resets its hareket to YOK
      void queryClient.invalidateQueries({ queryKey: ['cari'] })
    },
  })
}
