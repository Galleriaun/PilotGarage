import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { istanbulTodayISO, nextOccurrenceAfterISO } from '../../lib/dates'
import { kurusToNumericString } from '../../lib/money'
import type { Profile, Role } from '../../lib/types'
import type { IslemTur } from '../finans/types'
import type { CariIsletme, Istek, IstekTur, Izin, Member, PersonelOdeme, PrimPaket } from './types'

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const uid = data.session?.user.id
  if (!uid) throw new Error('Oturum bulunamadı — yeniden giriş yapın.')
  return uid
}

// ═══ Paketler ═══════════════════════════════════════════════
// (list query lives in features/kayit/api.ts — usePaketler)

export function useCreatePaket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { businessId: string; name: string; priceKurus: number }) => {
      const { error } = await supabase.from('paketler').insert({
        business_id: input.businessId,
        name: input.name,
        price: kurusToNumericString(input.priceKurus),
      })
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['paketler'] }),
  })
}

export function useUpdatePaket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; name: string; priceKurus: number }) => {
      const { error } = await supabase
        .from('paketler')
        .update({ name: input.name, price: kurusToNumericString(input.priceKurus) })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['paketler'] }),
  })
}

/** Soft delete — kayıt history keeps referencing the paket. */
export function useDeactivatePaket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase.from('paketler').update({ is_active: false }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['paketler'] }),
  })
}

// ═══ Prim paketleri (050) ═══════════════════════════════════

export function usePrimPaketleri(businessId: string) {
  return useQuery({
    queryKey: ['prim-paketleri', businessId],
    queryFn: async (): Promise<PrimPaket[]> => {
      const { data, error } = await supabase
        .from('prim_paketleri')
        .select('id, business_id, name, tutar')
        .eq('business_id', businessId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as PrimPaket[]
    },
    enabled: businessId !== '',
  })
}

export function useAddPrimPaket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { businessId: string; name: string; tutarKurus: number }) => {
      const { error } = await supabase.from('prim_paketleri').insert({
        business_id: input.businessId,
        name: input.name,
        tutar: kurusToNumericString(input.tutarKurus),
      })
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['prim-paketleri'] }),
  })
}

export function useUpdatePrimPaket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; name: string; tutarKurus: number }) => {
      const { error } = await supabase
        .from('prim_paketleri')
        .update({ name: input.name, tutar: kurusToNumericString(input.tutarKurus) })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['prim-paketleri'] }),
  })
}

/** Hard delete — hiçbir işlem paketi referanslamaz (tutar/ad işleme kopyalanır). */
export function useDeletePrimPaket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase.from('prim_paketleri').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['prim-paketleri'] }),
  })
}

// ═══ Personel ═══════════════════════════════════════════════

const MEMBER_SELECT = 'profile_id, business_id, maas, odeme_gunu, profile:profiles(id, full_name, role, status)'

export function useMembers(businessId: string) {
  return useQuery({
    queryKey: ['members', businessId],
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await supabase
        .from('business_members')
        .select(MEMBER_SELECT)
        .eq('business_id', businessId)
      if (error) throw error
      // Rol önceliğiyle sırala: Yönetici > Muhasebe > Personel, rol içinde ada göre
      const oncelik = (r: Member['profile']['role']) =>
        r === 'YONETICI' ? 0 : r === 'MUHASEBE' ? 1 : r === 'PERSONEL' ? 2 : 3
      return (data as unknown as Member[]).sort(
        (a, b) =>
          oncelik(a.profile.role) - oncelik(b.profile.role) ||
          a.profile.full_name.localeCompare(b.profile.full_name, 'tr-TR'),
      )
    },
    enabled: businessId !== '',
  })
}

export function useMember(profileId: string, businessId: string) {
  return useQuery({
    queryKey: ['member', profileId, businessId],
    queryFn: async (): Promise<Member> => {
      const { data, error } = await supabase
        .from('business_members')
        .select(MEMBER_SELECT)
        .eq('profile_id', profileId)
        .eq('business_id', businessId)
        .single()
      if (error) throw error
      return data as unknown as Member
    },
    enabled: profileId !== '' && businessId !== '',
  })
}

/** All memberships of one person — İşletme Erişimi (Yönetici-only UI). */
export function useMemberBusinessIds(profileId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['member-businesses', profileId],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('business_members')
        .select('business_id')
        .eq('profile_id', profileId)
      if (error) throw error
      return (data as { business_id: string }[]).map((r) => r.business_id)
    },
    enabled: enabled && profileId !== '',
  })
}

/** Pending signups — visible to Yönetici only (RLS enforces regardless). */
export function usePendingProfiles(enabled: boolean) {
  return useQuery({
    queryKey: ['profiles-pending'],
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('status', 'PENDING')
        .order('created_at')
      if (error) throw error
      return data as Profile[]
    },
    enabled,
  })
}

export function usePersonelOdemeler(profileId: string, businessId: string) {
  return useQuery({
    queryKey: ['personel-odemeler', profileId, businessId],
    queryFn: async (): Promise<PersonelOdeme[]> => {
      const { data, error } = await supabase
        .from('personel_odemeler')
        // 045: avans/prim Onay'dan geçtiği için durum bağlı işlemden okunur
        .select('*, islem:islemler(durum)')
        .eq('profile_id', profileId)
        .eq('business_id', businessId)
        .order('tarih', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as PersonelOdeme[]
    },
    enabled: profileId !== '' && businessId !== '',
  })
}

// ═══ İstekler (037) ══════════════════════════════════════════

const ISTEK_SELECT = '*, profile:profiles!istekler_profile_id_fkey(full_name, role)'

export function useIstekler(businessId: string) {
  return useQuery({
    queryKey: ['istekler', businessId],
    queryFn: async (): Promise<Istek[]> => {
      const { data, error } = await supabase
        .from('istekler')
        .select(ISTEK_SELECT)
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return data as unknown as Istek[]
    },
    enabled: businessId !== '',
  })
}

/** Which türler have a BEKLIYOR istek — drives the red dots. */
export function useBekleyenIstekTurleri(businessId: string) {
  return useQuery({
    queryKey: ['istekler-bekleyen', businessId],
    queryFn: async (): Promise<Set<IstekTur>> => {
      const { data, error } = await supabase
        .from('istekler')
        .select('tur')
        .eq('business_id', businessId)
        .eq('durum', 'BEKLIYOR')
      if (error) throw error
      return new Set((data as { tur: IstekTur }[]).map((r) => r.tur))
    },
    enabled: businessId !== '',
  })
}

function useIstekMutation<TInput>(fn: (input: TInput) => Promise<void>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['istekler'] })
      void queryClient.invalidateQueries({ queryKey: ['istekler-bekleyen'] })
      // approved avans hits the kasa + personel history, exactly like Avans Ver
      void queryClient.invalidateQueries({ queryKey: ['personel-odemeler'] })
      void queryClient.invalidateQueries({ queryKey: ['islemler'] })
    },
  })
}

export function useApproveAvansIstek() {
  return useIstekMutation(async ({ id }: { id: string }) => {
    const { error } = await supabase.rpc('approve_avans_istek', { p_id: id })
    if (error) throw error
  })
}

export function useRejectAvansIstek() {
  return useIstekMutation(async ({ id }: { id: string }) => {
    const { error } = await supabase.rpc('reject_avans_istek', { p_id: id })
    if (error) throw error
  })
}

export function useAlindiIstek() {
  return useIstekMutation(async ({ id }: { id: string }) => {
    const { error } = await supabase.rpc('alindi_istek', { p_id: id })
    if (error) throw error
  })
}

function usePersonelMutation<TInput>(fn: (input: TInput) => Promise<void>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['members'] })
      void queryClient.invalidateQueries({ queryKey: ['member'] })
      void queryClient.invalidateQueries({ queryKey: ['member-businesses'] })
      void queryClient.invalidateQueries({ queryKey: ['profiles-pending'] })
      void queryClient.invalidateQueries({ queryKey: ['personel-odemeler'] })
      void queryClient.invalidateQueries({ queryKey: ['maas-odemeleri'] })
      void queryClient.invalidateQueries({ queryKey: ['islemler'] }) // avans/maaş hit the kasa
    },
  })
}

export function useSetRole() {
  return usePersonelMutation(async (input: { profileId: string; role: Role }) => {
    const { error } = await supabase.rpc('set_role', {
      p_profile: input.profileId,
      p_role: input.role,
    })
    if (error) throw error
  })
}

export function useUpdateMemberPay() {
  return usePersonelMutation(
    async (input: { profileId: string; businessId: string; maasKurus: number; odemeGunu: number }) => {
      const { error } = await supabase.rpc('update_member_pay', {
        p_profile: input.profileId,
        p_business: input.businessId,
        p_maas: kurusToNumericString(input.maasKurus),
        p_odeme_gunu: input.odemeGunu,
      })
      if (error) throw error
    },
  )
}

export function useSetBusinessAccess() {
  return usePersonelMutation(async (input: { profileId: string; businessIds: string[] }) => {
    const { error } = await supabase.rpc('set_business_access', {
      p_profile: input.profileId,
      p_business_ids: input.businessIds,
    })
    if (error) throw error
  })
}

export function useGivePrim() {
  return usePersonelMutation(
    async (input: { profileId: string; businessId: string; kurus: number; note: string }) => {
      const { error } = await supabase.rpc('give_prim', {
        p_profile: input.profileId,
        p_business: input.businessId,
        p_tutar: kurusToNumericString(input.kurus),
        p_note: input.note,
      })
      if (error) throw error
    },
  )
}

export function useGiveAvans() {
  return usePersonelMutation(
    async (input: { profileId: string; businessId: string; kurus: number; note: string }) => {
      const { error } = await supabase.rpc('give_avans', {
        p_profile: input.profileId,
        p_business: input.businessId,
        p_tutar: kurusToNumericString(input.kurus),
        p_note: input.note,
      })
      if (error) throw error
    },
  )
}

export function usePayMaas() {
  return usePersonelMutation(async (input: { profileId: string; businessId: string }) => {
    const { error } = await supabase.rpc('pay_maas', {
      p_profile: input.profileId,
      p_business: input.businessId,
    })
    if (error) throw error
  })
}

export function useApproveSignup() {
  return usePersonelMutation(
    async (input: {
      profileId: string
      role: Role
      businessIds: string[]
      maasKurus: number
      odemeGunu: number
    }) => {
      const { error } = await supabase.rpc('approve_signup', {
        p_profile: input.profileId,
        p_role: input.role,
        p_business_ids: input.businessIds,
        p_maas: kurusToNumericString(input.maasKurus),
        p_odeme_gunu: input.odemeGunu,
      })
      if (error) throw error
    },
  )
}

export function useSetStatus() {
  return usePersonelMutation(async (input: { profileId: string; status: 'ACTIVE' | 'DISABLED' }) => {
    const { error } = await supabase.rpc('set_status', {
      p_profile: input.profileId,
      p_status: input.status,
    })
    if (error) throw error
  })
}

// ═══ İşletmeler (cari hesap) ════════════════════════════════

const CARI_SELECT = '*, hareketler:cari_hareketler(*)'

function sortHareketler(ci: CariIsletme): CariIsletme {
  return {
    ...ci,
    hareketler: [...(ci.hareketler ?? [])].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    ),
  }
}

export function useCariIsletmeler(businessId: string) {
  return useQuery({
    queryKey: ['cari', businessId],
    queryFn: async (): Promise<CariIsletme[]> => {
      const { data, error } = await supabase
        .from('cari_isletmeler')
        .select(CARI_SELECT)
        .eq('business_id', businessId)
        .order('name')
      if (error) throw error
      return (data as unknown as CariIsletme[]).map(sortHareketler)
    },
    enabled: businessId !== '',
  })
}

export function useCariIsletme(id: string) {
  return useQuery({
    queryKey: ['cari-detail', id],
    queryFn: async (): Promise<CariIsletme> => {
      const { data, error } = await supabase
        .from('cari_isletmeler')
        .select(CARI_SELECT)
        .eq('id', id)
        .single()
      if (error) throw error
      return sortHareketler(data as unknown as CariIsletme)
    },
    enabled: id !== '',
  })
}

function useCariMutation<TInput>(fn: (input: TInput) => Promise<void>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cari'] })
      void queryClient.invalidateQueries({ queryKey: ['cari-detail'] })
      void queryClient.invalidateQueries({ queryKey: ['islemler'] })
      void queryClient.invalidateQueries({ queryKey: ['tekrar-kurallari'] })
    },
  })
}

export function useCreateCari() {
  return useCariMutation(
    async (input: { businessId: string; name: string; note: string; telefon: string }) => {
      const { error } = await supabase.from('cari_isletmeler').insert({
        business_id: input.businessId,
        name: input.name,
        note: input.note,
        telefon: input.telefon,
      })
      if (error) throw error
    },
  )
}

export function useUpdateCari() {
  return useCariMutation(
    async (input: { id: string; name: string; note: string; telefon: string }) => {
      const { error } = await supabase
        .from('cari_isletmeler')
        .update({ name: input.name, note: input.note, telefon: input.telefon })
        .eq('id', input.id)
      if (error) throw error
    },
  )
}

export function useDeleteCari() {
  return useCariMutation(async ({ id }: { id: string }) => {
    const { error } = await supabase.rpc('delete_cari_isletme', { p_id: id })
    if (error) throw error
  })
}

export function useAddHareket() {
  return useCariMutation(
    async (input: {
      cariIsletmeId: string
      businessId: string
      cariName: string
      tur: IslemTur
      kurus: number
      note: string
      /** 0 = tek sefer; 1–28 = her ay o gün otomatik hareket (AYLIK rule) */
      odemeGunu: number
    }) => {
      const uid = await currentUserId()
      let kuralId: string | null = null

      if (input.odemeGunu > 0) {
        const { data, error } = await supabase
          .from('tekrar_kurallari')
          .insert({
            business_id: input.businessId,
            cari_isletme_id: input.cariIsletmeId,
            tur: input.tur,
            tutar: kurusToNumericString(input.kurus),
            // cari name in the başlık so the rule is recognizable in the
            // Tekrarlanan İşlemler management list
            baslik: `${input.cariName} — ${
              input.note || (input.tur === 'GELIR' ? 'Borç' : 'Ödeme')
            }`,
            siklik: 'AYLIK',
            // today's hareket covers the current period — schedule strictly after
            next_run: nextOccurrenceAfterISO(input.odemeGunu),
            created_by: uid,
          })
          .select('id')
          .single()
        if (error) throw error
        kuralId = (data as { id: string }).id
      }

      const { error } = await supabase.from('cari_hareketler').insert({
        cari_isletme_id: input.cariIsletmeId,
        tur: input.tur,
        tutar: kurusToNumericString(input.kurus),
        note: input.note,
        kasa_durumu: 'YOK',
        created_by: uid,
        tekrar_kural_id: kuralId,
      })
      if (error) {
        // compensate: never leave an orphaned rule the cron would keep materializing
        if (kuralId) await supabase.from('tekrar_kurallari').delete().eq('id', kuralId)
        throw error
      }
    },
  )
}

/** Delete guard lives in RLS: only kasa_durumu = 'YOK' rows are deletable. */
export function useDeleteHareket() {
  return useCariMutation(async ({ id }: { id: string }) => {
    const { error } = await supabase.from('cari_hareketler').delete().eq('id', id)
    if (error) throw error
  })
}

/** Hareket "Ödeme Topla" — atomic RPC: pending kasa geliri + hareket BEKLIYOR. */
export function useYansitHareket() {
  return useCariMutation(async (input: { hareketId: string }) => {
    const { error } = await supabase.rpc('yansit_cari_hareket', {
      p_hareket_id: input.hareketId,
    })
    if (error) throw error
  })
}

/** Genel "Ödeme Topla" — atomic RPC (032): ödeme hareketi (bakiyeden düşer)
 *  + pending kasa geliri; kasa Onay'a kadar etkilenmez. */
export function useToplaOdeme() {
  return useCariMutation(
    async (input: { cariIsletmeId: string; kurus: number; note: string }) => {
      const { error } = await supabase.rpc('topla_cari_odeme', {
        p_cari: input.cariIsletmeId,
        p_tutar: kurusToNumericString(input.kurus),
        p_note: input.note,
      })
      if (error) throw error
    },
  )
}

// ═══ Sabit Giderler ═════════════════════════════════════════
// (list query lives in features/finans/api.ts — useSabitGiderler)

function useSabitMutation<TInput>(fn: (input: TInput) => Promise<void>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['sabit-giderler'] }),
  })
}

export function useCreateSabitGider() {
  return useSabitMutation(
    async (input: {
      businessId: string
      name: string
      kurus: number
      odemeGunu: number
      kategoriId: string | null
    }) => {
      const { error } = await supabase.from('sabit_giderler').insert({
        business_id: input.businessId,
        name: input.name,
        tutar: kurusToNumericString(input.kurus),
        odeme_gunu: input.odemeGunu,
        kategori_id: input.kategoriId,
      })
      if (error) throw error
    },
  )
}

export function useUpdateSabitGider() {
  return useSabitMutation(
    async (input: {
      id: string
      name: string
      kurus: number
      odemeGunu: number
      kategoriId: string | null
    }) => {
      const { error } = await supabase
        .from('sabit_giderler')
        .update({
          name: input.name,
          tutar: kurusToNumericString(input.kurus),
          odeme_gunu: input.odemeGunu,
          kategori_id: input.kategoriId,
        })
        .eq('id', input.id)
      if (error) throw error
    },
  )
}

export function useDeleteSabitGider() {
  return useSabitMutation(async ({ id }: { id: string }) => {
    const { error } = await supabase.from('sabit_giderler').delete().eq('id', id)
    if (error) throw error
  })
}

// ═══ Tekrarlanan işlemler ═══════════════════════════════════
// (list query lives in features/finans/api.ts — useTekrarKurallari)

/**
 * Soft stop — the rule row stays (its işlemler keep referencing it),
 * the daily materializer only picks is_active rules.
 */
export function useStopTekrarKural() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase
        .from('tekrar_kurallari')
        .update({ is_active: false })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['tekrar-kurallari'] }),
  })
}

/** Hard delete of a rule; its işlemler survive detached (tekrar_kural_id
 *  set null — the 013 guard fix allows this even on decided rows). */
export function useDeleteTekrarKural() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase.from('tekrar_kurallari').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['tekrar-kurallari'] }),
  })
}

// ═══ İşletme Ayarları ═══════════════════════════════════════

export function useUpdateBusinessName() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { businessId: string; name: string }) => {
      const { error } = await supabase
        .from('businesses')
        .update({ name: input.name })
        .eq('id', input.businessId)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['businesses'] }),
  })
}

export function useAddKategori() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { businessId: string; tur: IslemTur; label: string }) => {
      const { error } = await supabase.from('kategoriler').insert({
        business_id: input.businessId,
        tur: input.tur,
        label: input.label,
      })
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['kategoriler'] }),
  })
}

/** Soft delete — işlem history keeps referencing the kategori. */
export function useDeactivateKategori() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase.from('kategoriler').update({ is_active: false }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['kategoriler'] }),
  })
}

// ═══ İzinler (048) ══════════════════════════════════════════

/** One person's leave records, newest range first. */
export function useIzinler(businessId: string, profileId: string) {
  return useQuery({
    queryKey: ['izinler', businessId, profileId],
    queryFn: async (): Promise<Izin[]> => {
      const { data, error } = await supabase
        .from('izinler')
        .select('id, business_id, profile_id, baslangic, bitis, created_at')
        .eq('business_id', businessId)
        .eq('profile_id', profileId)
        .order('baslangic', { ascending: false })
      if (error) throw error
      return data as Izin[]
    },
    enabled: businessId !== '' && profileId !== '',
  })
}

/** Who is on leave today (Istanbul) — profile ids, for the İzinde badges. */
export function useAktifIzinProfilleri(businessId: string) {
  return useQuery({
    queryKey: ['izin-aktif', businessId],
    queryFn: async (): Promise<Set<string>> => {
      const today = istanbulTodayISO()
      const { data, error } = await supabase
        .from('izinler')
        .select('profile_id')
        .eq('business_id', businessId)
        .lte('baslangic', today)
        .gte('bitis', today)
      if (error) throw error
      return new Set((data as { profile_id: string }[]).map((r) => r.profile_id))
    },
    enabled: businessId !== '',
  })
}

function useInvalidateIzinler() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['izinler'] })
    void queryClient.invalidateQueries({ queryKey: ['izin-aktif'] })
  }
}

/** RLS kademeli: Muhasebe yalnızca PERSONEL hedefe, Yönetici herkese (048). */
export function useAddIzin() {
  const invalidate = useInvalidateIzinler()
  return useMutation({
    mutationFn: async (input: {
      businessId: string
      profileId: string
      baslangic: string
      bitis: string
    }) => {
      const { error } = await supabase.from('izinler').insert({
        business_id: input.businessId,
        profile_id: input.profileId,
        baslangic: input.baslangic,
        bitis: input.bitis,
      })
      if (error) throw error
    },
    onSuccess: () => invalidate(),
  })
}

export function useDeleteIzin() {
  const invalidate = useInvalidateIzinler()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('izinler').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate(),
  })
}
