import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { kurusToNumericString, numericStringToKurus } from '../../lib/money'
import type { Istek, IstekTur } from '../yonetim/types'

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const uid = data.session?.user.id
  if (!uid) throw new Error('Oturum bulunamadı — yeniden giriş yapın.')
  return uid
}

/** Own istekler, newest first (İsteklerim). */
export function useMyIstekler(businessId: string) {
  return useQuery({
    queryKey: ['istekler-mine', businessId],
    queryFn: async (): Promise<Istek[]> => {
      const uid = await currentUserId()
      const { data, error } = await supabase
        .from('istekler')
        .select('*')
        .eq('business_id', businessId)
        .eq('profile_id', uid)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data as unknown as Istek[]
    },
    enabled: businessId !== '',
  })
}

/** Own maaş in the active business, integer kuruş; 0 = no salary set. */
export function useMyMaas(businessId: string) {
  return useQuery({
    queryKey: ['my-maas', businessId],
    queryFn: async (): Promise<number> => {
      const uid = await currentUserId()
      const { data, error } = await supabase
        .from('business_members')
        .select('maas')
        .eq('business_id', businessId)
        .eq('profile_id', uid)
        .maybeSingle()
      if (error) throw error
      return data ? numericStringToKurus(String((data as { maas: number | string }).maas)) : 0
    },
    enabled: businessId !== '',
  })
}

export function useCreateIstek() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      businessId: string
      tur: IstekTur
      /** AVANS only */
      tutarKurus: number | null
      metin: string
    }) => {
      const uid = await currentUserId()
      const { error } = await supabase.from('istekler').insert({
        business_id: input.businessId,
        profile_id: uid,
        tur: input.tur,
        tutar: input.tutarKurus !== null ? kurusToNumericString(input.tutarKurus) : null,
        metin: input.metin,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['istekler-mine'] })
      // finance-side list + red dots refresh if a finance user files one
      void queryClient.invalidateQueries({ queryKey: ['istekler'] })
      void queryClient.invalidateQueries({ queryKey: ['istekler-bekleyen'] })
    },
  })
}
