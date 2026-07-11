import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

export interface Bildirim {
  id: string
  type: string // ONAY | KAYIT_SILME | UYELIK
  baslik: string
  body: string
  link: string
  read_at: string | null
  created_at: string
}

/** Which notification types the user wants — missing key = true. */
export interface NotifPrefs {
  onay?: boolean
  silme?: boolean
  uyelik?: boolean
}
export const PREF_OF_TYPE: Record<string, keyof NotifPrefs> = {
  ONAY: 'onay',
  KAYIT_SILME: 'silme',
  UYELIK: 'uyelik',
}
export function wantsType(prefs: NotifPrefs, type: string): boolean {
  const key = PREF_OF_TYPE[type]
  return key ? prefs[key] !== false : true
}

export interface TrashItem {
  id: string
  item_type: string
  title: string
  deleted_at: string
}

export function useBildirimler() {
  return useQuery({
    queryKey: ['bildirimler'],
    queryFn: async (): Promise<Bildirim[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id,type,baslik,body,link,read_at,created_at')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data as Bildirim[]
    },
  })
}

export function useNotifPrefs(profileId: string) {
  return useQuery({
    queryKey: ['notif-prefs', profileId],
    queryFn: async (): Promise<NotifPrefs> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('notif_prefs')
        .eq('id', profileId)
        .single()
      if (error) throw error
      return ((data as { notif_prefs: NotifPrefs | null }).notif_prefs ?? {}) as NotifPrefs
    },
    enabled: profileId !== '',
  })
}

export function useMarkAllRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .is('read_at', null)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['bildirimler'] }),
  })
}

export function useSaveProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      profileId: string
      fullName?: string
      notifPrefs?: NotifPrefs
    }) => {
      const patch: Record<string, unknown> = {}
      if (input.fullName !== undefined) patch.full_name = input.fullName
      if (input.notifPrefs !== undefined) patch.notif_prefs = input.notifPrefs
      const { error } = await supabase.from('profiles').update(patch).eq('id', input.profileId)
      if (error) throw error
    },
    onSuccess: (_d, { profileId }) => {
      void queryClient.invalidateQueries({ queryKey: ['notif-prefs', profileId] })
    },
  })
}

export function useTrashItems(businessId: string) {
  return useQuery({
    queryKey: ['trash', businessId],
    queryFn: async (): Promise<TrashItem[]> => {
      const { data, error } = await supabase
        .from('trash')
        .select('id,item_type,title,deleted_at')
        .eq('business_id', businessId)
        .order('deleted_at', { ascending: false })
      if (error) throw error
      return data as TrashItem[]
    },
    enabled: businessId !== '',
  })
}
