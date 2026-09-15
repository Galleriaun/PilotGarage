import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { istanbulTodayISO, nextOccurrenceAfterISO } from '../../lib/dates'
import { kurusToNumericString, numericStringToKurus } from '../../lib/money'
import type { OdemeYontemi } from '../../lib/types'
import type { ExcelFiltre } from './excel'
import type {
  Islem,
  IslemTur,
  Kategori,
  KayitSilmeTalebi,
  SabitGider,
  TekrarKural,
} from './types'

// islemler has several FKs to profiles (created_by, onaylayan) — the
// creator embed must name its constraint explicitly. cari_hareket +
// personel_odeme feed "işleme tıkla → oluşturulduğu yere git" (TxCard onOpen):
// cari hareketin işletmesi ve avans/prim/maaş satırının personeli. Embed'ler
// RLS'e tabidir; finans ekranlarında dolu gelir, kaynak uymayan satırlarda boş.
// personel_odeme.tur (063): maaş tutarını Yönetici dışından gizler (maasTutariGizli).
// kayit.musteri_adi + cari_hareket.cari_isletme.name: Tüm İşlemler müşteri araması
// ve kart satırı (islemMusteri) — kayıt geliri başlığı adı hiç taşımaz, cari başlığı
// oluşturulduğu andaki adı taşır; buradan GÜNCEL ad okunur. İki embed de tek FK'dan
// çözülür (islemler.kayit_id, cari_hareketler.cari_isletme_id): ikinci bir FK
// eklenirse PostgREST TÜM sorguyu reddeder ve Finans ekranları boşalır.
const ISLEM_SELECT =
  '*, kategori:kategoriler(id,label,tur), creator:profiles!islemler_created_by_fkey(full_name), cari_hareket:cari_hareketler(cari_isletme_id,cari_isletme:cari_isletmeler(name)), personel_odeme:personel_odemeler(profile_id,tur), kayit:kayitlar(musteri_adi)'

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

/** Members with automatic salary payment — feeds the Sabit Ödemeler widget.
 *  BRÜT maaş gösterir: bu bir bütçe/tahmin kartıdır, kasa rakamı değil.
 *  (057'de avans borcu düşülmüş NET denendi, owner geri aldı.) */
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

/** Kayıts whose deletion waits in the Onay queue (013). The profiles embed
 *  must name its FK — kayitlar has two FKs to profiles (created_by too). */
export function useKayitSilmeTalepleri(businessId: string) {
  return useQuery({
    queryKey: ['kayit-silme-talepleri', businessId],
    queryFn: async (): Promise<KayitSilmeTalebi[]> => {
      const { data, error } = await supabase
        .from('kayitlar')
        .select(
          'id, business_id, plaka, musteri_adi, silme_talebi_at, talep_eden:profiles!kayitlar_silme_talebi_by_fkey(full_name)',
        )
        .eq('business_id', businessId)
        .not('silme_talebi_at', 'is', null)
        .order('silme_talebi_at', { ascending: true }) // oldest first in the queue
      if (error) throw error
      return data as unknown as KayitSilmeTalebi[]
    },
    enabled: businessId !== '',
  })
}

/**
 * Excel dışa aktarım (Finans): tarih aralığındaki ONAYLANDI işlemler + isteğe
 * bağlı süzgeçler. Önbelleğe alınmayan tek seferlik çekim.
 *
 * Supabase yanıt başına en fazla 1000 satır döndürür (varsayılan max_rows) —
 * tek sorgu geniş aralıkta SESSİZCE kırpılırdı. id'ye göre keyset sayfalama:
 * çekim sırasında eklenen/silinen satır başka satırı atlatmaz; BOŞ sayfa gelene
 * kadar döner, sunucu sınırı daha düşük ayarlansa da eksik bırakmaz.
 */
export async function fetchIslemlerExcel(businessId: string, filtre: ExcelFiltre): Promise<Islem[]> {
  const SAYFA = 1000
  const MAX_SAYFA = 200
  const tum: Islem[] = []
  let sonId: string | null = null
  for (let sayfa = 0; sayfa < MAX_SAYFA; sayfa++) {
    let q = supabase
      .from('islemler')
      .select(ISLEM_SELECT)
      .eq('business_id', businessId)
      .eq('durum', 'ONAYLANDI')
      .gte('islem_tarihi', filtre.baslangic)
      .lte('islem_tarihi', filtre.bitis)
    if (filtre.tur !== null) q = q.eq('tur', filtre.tur)
    if (filtre.yalnizcaKayit) q = q.eq('kaynak', 'KAYIT')
    if (filtre.yontemler.length > 0) q = q.in('odeme_yontemi', filtre.yontemler)
    if (filtre.kategoriIdler.length > 0) q = q.in('kategori_id', filtre.kategoriIdler)
    if (sonId !== null) q = q.gt('id', sonId)
    const { data, error } = await q.order('id', { ascending: true }).limit(SAYFA)
    if (error) throw error
    if (data.length === 0) return tum
    const rows = withKurus(data)
    tum.push(...rows)
    const son = rows.at(-1)
    if (!son) return tum
    sonId = son.id
  }
  throw new Error('Bu aralıkta çok fazla işlem var — daha kısa bir tarih aralığı seçin.')
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
  /** KREDI_KARTI only (033): deducted as a separate gider on approval;
   *  a recurring rule repeats the deduction every period. */
  komisyonKurus: number | null
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
            // the cron copies the yöntem and repeats the KK komisyonu (033)
            odeme_yontemi: input.odemeYontemi,
            komisyon:
              input.komisyonKurus !== null ? kurusToNumericString(input.komisyonKurus) : null,
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
        komisyon:
          input.komisyonKurus !== null ? kurusToNumericString(input.komisyonKurus) : null,
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
      komisyon,
    }: {
      islemId: string
      odemeYontemi: OdemeYontemi | null
      /** numeric string (₺); '0' cancels a stored komisyon; null keeps it */
      komisyon: string | null
    }) => {
      const { error } = await supabase.rpc('approve_islem', {
        p_islem_id: islemId,
        p_odeme_yontemi: odemeYontemi,
        p_komisyon: komisyon,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['islemler'] })
      // 057: avans onaylanınca borç değişir → Personel Detay kartındaki borç
      // bayat kalmasın (avans BEKLIYOR iken borca sayılmıyordu)
      void queryClient.invalidateQueries({ queryKey: ['personel-odemeler'] })
    },
  })
}

/**
 * Hesaba Para Aktarımı (041): Nakit kovasından Kredi Kartı kovasına aktarım.
 * RPC iki bacağı (nakit gideri + KK geliri) atomik olarak born-ONAYLANDI yazar;
 * kasa toplamı değişmez, yalnızca kovalar kayar.
 */
export function useParaTransferi() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ businessId, kurus }: { businessId: string; kurus: number }) => {
      const { error } = await supabase.rpc('para_transferi', {
        p_business: businessId,
        p_tutar: kurusToNumericString(kurus),
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['islemler'] })
    },
  })
}

/**
 * Transferi Geri Al (042) — Yönetici-only. Silmez: ters yönde ikinci bir
 * aktarım ("Transfer Geri Alma") yazar, tutar kaynak kovaya geri döner.
 */
export function useTransferGeriAl() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ islemId }: { islemId: string }) => {
      const { error } = await supabase.rpc('transfer_geri_al', { p_islem_id: islemId })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['islemler'] })
    },
  })
}

/** Cepten Ödeme (052, Yönetici-only): yöneticinin cebinden ödediği gideri
 *  telafi eden NAKİT gelirini born-ONAYLANDI yazar ve o yöneticiye olan borcu
 *  ("verilecek") kaydeder. Onay'a düşmez. */
export function useCeptenOdeme() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      businessId: string
      yoneticiId: string
      kurus: number
      aciklama: string
    }) => {
      const { error } = await supabase.rpc('cepten_odeme', {
        p_business: input.businessId,
        p_yonetici: input.yoneticiId,
        p_tutar: kurusToNumericString(input.kurus),
        p_aciklama: input.aciklama,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['islemler'] })
      void queryClient.invalidateQueries({ queryKey: ['cepten-toplam'] }) // Personel Detay "Verilecek"
    },
  })
}

/** Yönetici-only (040): onaylanmış işlemi tekrar Onay kuyruğuna döndürür.
 *  Kasadan çıkar; bağlı KK komisyonu silinir (yeniden onayda tekrar doğar);
 *  cari hareket YANSIDI → BEKLIYOR'a döner. */
export function useOnayaGeriGonder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ islemId }: { islemId: string }) => {
      const { error } = await supabase.rpc('islem_onaya_geri_gonder', {
        p_islem_id: islemId,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['islemler'] })
      void queryClient.invalidateQueries({ queryKey: ['cari'] })
      void queryClient.invalidateQueries({ queryKey: ['cari-detail'] })
    },
  })
}

export function useApproveKayitSilme() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ kayitId }: { kayitId: string }) => {
      const { data, error } = await supabase.rpc('approve_kayit_silme', {
        p_kayit_id: kayitId,
      })
      if (error) throw error
      const paths = (data ?? []) as string[]
      if (paths.length > 0) {
        // best-effort bucket cleanup — the DB rows are already gone and an
        // orphaned storage object is harmless
        try {
          await supabase.storage.from('kayit-fotograflar').remove(paths)
        } catch {
          /* ignore */
        }
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['kayit-silme-talepleri'] })
      void queryClient.invalidateQueries({ queryKey: ['kayitlar'] })
      void queryClient.invalidateQueries({ queryKey: ['kayit'] })
      // a still-pending KAYIT geliri is deleted together with the kayıt
      void queryClient.invalidateQueries({ queryKey: ['islemler'] })
    },
  })
}

export function useRejectKayitSilme() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ kayitId }: { kayitId: string }) => {
      const { error } = await supabase.rpc('reject_kayit_silme', { p_kayit_id: kayitId })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['kayit-silme-talepleri'] })
      void queryClient.invalidateQueries({ queryKey: ['kayitlar'] })
      void queryClient.invalidateQueries({ queryKey: ['kayit'] })
    },
  })
}

/** Finance-only hard delete (RPC — the kasa view recalculates itself). */
export function useDeleteIslem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ islemId }: { islemId: string }) => {
      const { error } = await supabase.rpc('delete_islem', { p_id: islemId })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['islemler'] })
      // 057: avans/maaş satırı silinince veya reddedilince borç değişir
      void queryClient.invalidateQueries({ queryKey: ['personel-odemeler'] })
      // a deleted CARI_HESAP işlem resets its hareket to YOK
      void queryClient.invalidateQueries({ queryKey: ['cari'] })
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
      // 057: avans/maaş satırı silinince veya reddedilince borç değişir
      void queryClient.invalidateQueries({ queryKey: ['personel-odemeler'] })
      // a rejected CARI_HESAP işlem resets its hareket to YOK
      void queryClient.invalidateQueries({ queryKey: ['cari'] })
    },
  })
}
