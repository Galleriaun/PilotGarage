import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { istanbulTodayISO, nextOccurrenceAfterISO } from '../../lib/dates'
import { kurusToNumericString, numericStringToKurus } from '../../lib/money'
import type { OdemeYontemi } from '../../lib/types'
import type { Islem, IslemTur, Kategori, SabitGider, TekrarKural } from './types'

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
  /** 0 = Bir Kez; 1–28 = her ay o gün otomatik (AYLIK rule + today's işlem) */
  odemeGunu: number
}

export function useAddIslem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: AddIslemInput) => {
      const uid = await currentUserId()
      const tarih = istanbulTodayISO()
      let tekrarKuralId: string | null = null

      if (input.odemeGunu > 0) {
        const { data, error } = await supabase
          .from('tekrar_kurallari')
          .insert({
            business_id: input.businessId,
            tur: input.tur,
            tutar: kurusToNumericString(input.kurus),
            baslik: input.baslik,
            kategori_id: input.kategoriId,
            siklik: 'AYLIK',
            // today's işlem covers the current period — schedule strictly after
            next_run: nextOccurrenceAfterISO(input.odemeGunu),
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
