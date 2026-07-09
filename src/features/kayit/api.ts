import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { compressPhoto } from '../../lib/image'
import type { Kayit, KayitDurum, KayitFields, Paket } from './types'

const KAYIT_SELECT =
  '*, paket:paketler(id,name,price), fotograflar:kayit_fotograflar(id,kayit_id,storage_path,created_at), creator:profiles!kayitlar_created_by_fkey(full_name)'

function sortFotograflar(kayit: Kayit): Kayit {
  return {
    ...kayit,
    fotograflar: [...(kayit.fotograflar ?? [])].sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    ),
  }
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const uid = data.session?.user.id
  if (!uid) throw new Error('Oturum bulunamadı — yeniden giriş yapın.')
  return uid
}

// ── Queries ──────────────────────────────────────────────────

export function useKayitlar(businessId: string) {
  return useQuery({
    queryKey: ['kayitlar', businessId],
    queryFn: async (): Promise<Kayit[]> => {
      const { data, error } = await supabase
        .from('kayitlar')
        .select(KAYIT_SELECT)
        .eq('business_id', businessId)
        .order('tarih', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data as unknown as Kayit[]).map(sortFotograflar)
    },
    enabled: businessId !== '',
  })
}

export function useKayit(id: string) {
  return useQuery({
    queryKey: ['kayit', id],
    queryFn: async (): Promise<Kayit> => {
      const { data, error } = await supabase
        .from('kayitlar')
        .select(KAYIT_SELECT)
        .eq('id', id)
        .single()
      if (error) throw error
      return sortFotograflar(data as unknown as Kayit)
    },
  })
}

export function usePaketler(businessId: string) {
  return useQuery({
    queryKey: ['paketler', businessId],
    queryFn: async (): Promise<Paket[]> => {
      const { data, error } = await supabase
        .from('paketler')
        .select('id,name,price')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return data as Paket[]
    },
    enabled: businessId !== '',
  })
}

/** Signed URLs for the private photo bucket (valid 60 min, refetched at 45). */
export function usePhotoUrls(paths: string[]) {
  return useQuery({
    queryKey: ['foto-urls', ...paths],
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.storage
        .from('kayit-fotograflar')
        .createSignedUrls(paths, 3600)
      if (error) throw error
      const map: Record<string, string> = {}
      for (const item of data) {
        if (item.path && item.signedUrl) map[item.path] = item.signedUrl
      }
      return map
    },
    enabled: paths.length > 0,
    staleTime: 45 * 60_000,
  })
}

// ── Mutations ────────────────────────────────────────────────

async function uploadPhoto(businessId: string, kayitId: string, uid: string, file: File) {
  const compressed = await compressPhoto(file)
  const path = `${businessId}/${kayitId}/${crypto.randomUUID()}.jpg`
  const { error: uploadError } = await supabase.storage
    .from('kayit-fotograflar')
    .upload(path, compressed, { contentType: 'image/jpeg' })
  if (uploadError) throw uploadError
  const { error: rowError } = await supabase
    .from('kayit_fotograflar')
    .insert({ kayit_id: kayitId, storage_path: path, created_by: uid })
  if (rowError) throw rowError
}

export interface CreateKayitInput {
  businessId: string
  fields: KayitFields
  durum: KayitDurum
  photos: File[]
}

export function useCreateKayit() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ businessId, fields, durum, photos }: CreateKayitInput) => {
      const uid = await currentUserId()
      const { data, error } = await supabase
        .from('kayitlar')
        .insert({
          business_id: businessId,
          ...fields,
          plaka: fields.plaka.trim().toUpperCase(),
          durum,
          created_by: uid,
        })
        .select('id')
        .single()
      if (error) throw error
      const kayitId = (data as { id: string }).id

      let photoFailures = 0
      for (const file of photos) {
        try {
          await uploadPhoto(businessId, kayitId, uid, file)
        } catch {
          photoFailures += 1
        }
      }
      return { kayitId, photoFailures }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['kayitlar'] })
    },
  })
}

export function useUpdateKayit() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, fields }: { id: string; fields: KayitFields }) => {
      const { error } = await supabase
        .from('kayitlar')
        .update({ ...fields, plaka: fields.plaka.trim().toUpperCase() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ['kayitlar'] })
      void queryClient.invalidateQueries({ queryKey: ['kayit', id] })
    },
  })
}

/** Durum changes ride the DB trigger: TAMAMLANDI queues the paket price as
 *  pending gelir; reverting removes the still-pending işlem. */
export function useUpdateDurum() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, durum }: { id: string; durum: KayitDurum }) => {
      const { error } = await supabase.from('kayitlar').update({ durum }).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ['kayitlar'] })
      void queryClient.invalidateQueries({ queryKey: ['kayit', id] })
    },
  })
}

export function useAddPhotos() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      businessId,
      kayitId,
      files,
    }: {
      businessId: string
      kayitId: string
      files: File[]
    }) => {
      const uid = await currentUserId()
      let failures = 0
      for (const file of files) {
        try {
          await uploadPhoto(businessId, kayitId, uid, file)
        } catch {
          failures += 1
        }
      }
      return { failures }
    },
    onSuccess: (_data, { kayitId }) => {
      void queryClient.invalidateQueries({ queryKey: ['kayitlar'] })
      void queryClient.invalidateQueries({ queryKey: ['kayit', kayitId] })
    },
  })
}

export function useDeletePhoto() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ fotoId, storagePath }: { fotoId: string; storagePath: string; kayitId: string }) => {
      // DB row first (source of truth); an orphaned storage object is harmless
      const { error } = await supabase.from('kayit_fotograflar').delete().eq('id', fotoId)
      if (error) throw error
      await supabase.storage.from('kayit-fotograflar').remove([storagePath])
    },
    onSuccess: (_data, { kayitId }) => {
      void queryClient.invalidateQueries({ queryKey: ['kayitlar'] })
      void queryClient.invalidateQueries({ queryKey: ['kayit', kayitId] })
    },
  })
}
