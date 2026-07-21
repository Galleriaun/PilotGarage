import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { useAuth } from '../../app/providers/AuthProvider'
import { formatDateDots } from '../../lib/dates'
import { formatTL, kurusToInput, numericStringToKurus } from '../../lib/money'
import { canSeeFinance } from '../../lib/rbac'
import type { OdemeYontemi } from '../../lib/types'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { BackChevron } from '../auth/EyeIcon'
import {
  useAddPhotos,
  useDeletePhoto,
  useKayit,
  usePaketler,
  usePhotoUrls,
  useRequestKayitSilme,
  useUpdateDurum,
  useUpdateKayit,
} from './api'
import { PaketDropdown, SaatDropdown, paketFullLabel, saatLabel } from './components'
import { DURUM_META, DURUM_MENU_META, DURUM_ORDER } from './durum'
import { buildFinansAlanlari, gelirBaseKurus, YONTEM_LABELS } from './finans'
import KomisyonBankaSecici from '../../components/ui/KomisyonBankaSecici'
import { digitsOnly, KAYIT_MAX, KM_DIGITS, YIL_DIGITS, YIL_MAX, YIL_MIN } from './limits'
import { formatTelDisplay, isTelComplete, normalizeTel, telHref } from './telefon'
import {
  ArrowLeftSmall,
  ArrowRightSmall,
  ChevronDownIcon,
  PhoneIcon,
  PhotoPlaceholderIcon,
  PlusDashedIcon,
  XIcon,
} from './icons'
import type { KayitDurum, KayitFields, KayitFinansAlanlari } from './types'

function InfoCard({
  label,
  className = '',
  children,
}: {
  label: string
  /** ek sınıf (ör. basis-full → sarmalı satırda tam genişlik kaplasın) */
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`flex-1 rounded-[14px] bg-card px-4 py-[14px] ${className}`}>
      <div className="mb-1 text-[11px] font-bold tracking-[0.5px] text-faint">{label}</div>
      {children}
    </div>
  )
}

const bareInputCls =
  'w-full border-none bg-transparent p-0 text-[15px] font-semibold text-ink outline-none'

/** Komisyon oranı, tr-TR yazımıyla: %2,99 (yüzde işareti önde). */
function formatYuzde(v: number): string {
  return `%${v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function KayitDetay() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const photoFailures =
    (location.state as { photoFailures?: number } | null)?.photoFailures ?? 0

  const { data: kayit, isPending, isError } = useKayit(id)
  const { data: paketler = [] } = usePaketler(kayit?.business_id ?? '')
  const updateKayit = useUpdateKayit()
  const updateDurum = useUpdateDurum()
  const addPhotos = useAddPhotos()
  const deletePhoto = useDeletePhoto()
  const requestSilme = useRequestKayitSilme()
  const { profile } = useAuth()
  const isFinance = canSeeFinance(profile?.role ?? null)

  const [draft, setDraft] = useState<KayitFields | null>(null)
  const editing = draft !== null
  const [error, setError] = useState('')
  // Finans (034): tutar override + yöntem + komisyon
  const [finansTutar, setFinansTutar] = useState('')
  const [finansYontem, setFinansYontem] = useState<OdemeYontemi | null>(null)
  const [finansKomisyon, setFinansKomisyon] = useState('')

  const [photoIndex, setPhotoIndex] = useState(0)
  const [lightbox, setLightbox] = useState(false)
  const [durumMenuOpen, setDurumMenuOpen] = useState(false)
  const [pendingDurum, setPendingDurum] = useState<KayitDurum | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fotograflar = useMemo(() => kayit?.fotograflar ?? [], [kayit])
  const photoPaths = useMemo(() => fotograflar.map((f) => f.storage_path), [fotograflar])
  const { data: photoUrls = {} } = usePhotoUrls(photoPaths)

  // Keep the carousel index valid as photos come and go
  useEffect(() => {
    setPhotoIndex((i) => Math.min(i, Math.max(0, fotograflar.length - 1)))
  }, [fotograflar.length])

  if (isPending) {
    return (
      <div className="flex justify-center py-20 screen-forward">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-divider border-t-ink" />
      </div>
    )
  }
  if (isError || !kayit) {
    return (
      <div className="px-6 py-16 text-center screen-forward">
        <p className="mb-4 text-sm text-danger">Kayıt yüklenemedi.</p>
        <button
          type="button"
          onClick={() => void navigate(-1)}
          className="cursor-pointer text-[15px] font-semibold text-ink underline"
        >
          Geri dön
        </button>
      </div>
    )
  }

  const durumMeta = DURUM_META[kayit.durum]
  const currentPhoto = fotograflar[photoIndex]
  const currentUrl = currentPhoto ? (photoUrls[currentPhoto.storage_path] ?? null) : null
  // Para alanları yalnızca gelir henüz doğmadan (aktif işlem yokken) düzenlenir;
  // gelir oluştuktan sonra değişiklik mevcut işlemi etkilemez.
  const hasActiveGelir = kayit.gelirler.some((g) => g.durum !== 'REDDEDILDI')
  const canEditFinans = isFinance && !hasActiveGelir

  // Komisyon oranı: saklanan komisyon TL'sinin geliri doğuran tutara oranı.
  // Tutar girilmediyse gelir paket fiyatından doğar (kayit_tamamlandi_islem,
  // 034) — oran da onun üzerinden hesaplanır. Hesaplanamıyorsa (tutar da paket
  // de yoksa) yüzde yerine TL tutarı gösterilir.
  const komisyonKurus = kayit.komisyon != null ? numericStringToKurus(kayit.komisyon) : null
  const gelirKurus =
    kayit.tutar != null
      ? numericStringToKurus(kayit.tutar)
      : kayit.paket != null
        ? numericStringToKurus(kayit.paket.price)
        : null
  const komisyonOran =
    komisyonKurus !== null && gelirKurus !== null && gelirKurus > 0
      ? (komisyonKurus / gelirKurus) * 100
      : null

  function startEdit() {
    if (!kayit) return
    setError('')
    setDraft({
      musteri_adi: kayit.musteri_adi,
      musteri_tel: kayit.musteri_tel,
      plaka: kayit.plaka,
      marka: kayit.marka,
      model: kayit.model,
      yil: kayit.yil,
      km: kayit.km,
      ruhsat_no: kayit.ruhsat_no,
      paket_id: kayit.paket_id,
      tarih: kayit.tarih,
      baslangic_saati: kayit.baslangic_saati,
      bitis_saati: kayit.bitis_saati,
      notlar: kayit.notlar,
    })
    setFinansTutar(kayit.tutar != null ? kurusToInput(numericStringToKurus(kayit.tutar)) : '')
    setFinansYontem(kayit.odeme_yontemi)
    setFinansKomisyon(
      kayit.komisyon != null ? kurusToInput(numericStringToKurus(kayit.komisyon)) : '',
    )
  }

  async function saveEdit() {
    if (!draft) return
    setError('')
    if (!draft.plaka.trim()) {
      setError('Plaka boş olamaz.')
      return
    }
    if (draft.yil !== null && (draft.yil < YIL_MIN || draft.yil > YIL_MAX)) {
      setError(`Geçerli bir yıl girin (${YIL_MIN}–${YIL_MAX}).`)
      return
    }
    if (draft.km !== null && draft.km < 0) {
      setError('Geçerli bir kilometre girin.')
      return
    }
    if (
      draft.baslangic_saati &&
      draft.bitis_saati &&
      draft.bitis_saati.slice(0, 5) <= draft.baslangic_saati.slice(0, 5)
    ) {
      setError('Bitiş saati başlangıçtan sonra olmalı.')
      return
    }
    if (draft.musteri_tel && !isTelComplete(draft.musteri_tel)) {
      setError('Telefon numarası eksik — 5 ile başlayan 10 hane girin.')
      return
    }
    let finans: KayitFinansAlanlari | undefined
    if (canEditFinans) {
      const res = buildFinansAlanlari(
        {
          paketId: draft.paket_id,
          tutar: finansTutar,
          odemeYontemi: finansYontem,
          komisyon: finansKomisyon,
        },
        false, // edit: yöntem optional (blank still asked at Onay)
      )
      if ('error' in res) {
        setError(res.error)
        return
      }
      finans = res.finans
    }
    try {
      await updateKayit.mutateAsync({ id, fields: draft, finans })
      setDraft(null)
    } catch {
      setError('Kaydedilemedi. Tekrar deneyin.')
    }
  }

  // No confirm: the kayıt just moves to the Onay queue (Reddet brings it back)
  async function onSil() {
    setError('')
    try {
      await requestSilme.mutateAsync({ id })
      void navigate(-1)
    } catch {
      setError('Silinemedi. Tekrar deneyin.')
    }
  }

  async function confirmDurumChange() {
    if (!pendingDurum) return
    try {
      await updateDurum.mutateAsync({ id, durum: pendingDurum })
      setPendingDurum(null)
    } catch {
      setPendingDurum(null)
      setError('Durum değiştirilemedi. Tekrar deneyin.')
    }
  }

  const subtitleParts = [
    `${draft?.marka ?? kayit.marka} ${draft?.model ?? kayit.model}`.trim(),
    (draft ? draft.yil : kayit.yil) ? String(draft ? draft.yil : kayit.yil) : '',
  ].filter(Boolean)

  return (
    <div className="screen-forward">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-4">
        <button
          type="button"
          onClick={() => void navigate(-1)}
          className="inline-flex cursor-pointer items-center gap-1 py-[6px]"
        >
          <BackChevron />
          <span className="text-[15px] font-medium text-ink">Geri</span>
        </button>
        <button
          type="button"
          onClick={() => (editing ? (setDraft(null), setError('')) : startEdit())}
          className="cursor-pointer rounded-[10px] bg-field px-[14px] py-[6px] text-sm font-semibold text-ink"
        >
          {editing ? 'İptal' : 'Düzenle'}
        </button>
      </div>

      {kayit.silme_talebi_at && (
        <div className="mx-6 mt-3 rounded-[14px] bg-[#FEF3F2] px-4 py-3 text-center text-[13px] font-semibold text-danger">
          Silme isteği Onay bölümünde bekliyor.
        </div>
      )}

      {photoFailures > 0 && (
        <p className="px-6 pt-3 text-center text-[13px] text-warn">
          {photoFailures} fotoğraf yüklenemedi — Düzenle ile tekrar ekleyebilirsiniz.
        </p>
      )}

      {/* Photos — carousel (view) / strip (edit) */}
      {!editing ? (
        <div className="relative mx-6 mt-[18px]">
          <button
            type="button"
            onClick={() => fotograflar.length > 0 && setLightbox(true)}
            className="flex h-[200px] w-full items-center justify-center overflow-hidden rounded-[18px] bg-[#E8E8E8]"
            style={{ cursor: fotograflar.length > 0 ? 'zoom-in' : 'default' }}
          >
            {currentUrl ? (
              <img src={currentUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <PhotoPlaceholderIcon size={40} strokeWidth={1.4} />
            )}
          </button>
          {fotograflar.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => setPhotoIndex((i) => Math.max(0, i - 1))}
                aria-label="Önceki fotoğraf"
                className="absolute left-[10px] top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/85 shadow-[0_2px_8px_rgba(0,0,0,0.12)]"
              >
                <ArrowLeftSmall />
              </button>
              <button
                type="button"
                onClick={() => setPhotoIndex((i) => Math.min(fotograflar.length - 1, i + 1))}
                aria-label="Sonraki fotoğraf"
                className="absolute right-[10px] top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/85 shadow-[0_2px_8px_rgba(0,0,0,0.12)]"
              >
                <ArrowRightSmall />
              </button>
              <div className="absolute bottom-[10px] left-1/2 flex -translate-x-1/2 items-center gap-[6px]">
                {fotograflar.map((f, i) => (
                  <div
                    key={f.id}
                    className="h-[6px] w-[6px] rounded-full"
                    style={{ background: i === photoIndex ? '#111' : '#D4D4D4' }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="mx-6 mt-[18px]">
          <div className="flex flex-wrap gap-[10px]">
            {fotograflar.map((f) => {
              const url = photoUrls[f.storage_path] ?? null
              return (
                <div key={f.id} className="relative h-[76px] w-[76px] shrink-0">
                  <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-[14px] bg-[#E8E8E8]">
                    {url ? (
                      <img src={url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <PhotoPlaceholderIcon size={24} />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      deletePhoto.mutate({ fotoId: f.id, storagePath: f.storage_path, kayitId: id })
                    }
                    disabled={deletePhoto.isPending}
                    aria-label="Fotoğrafı sil"
                    className="absolute -right-[6px] -top-[6px] flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-full bg-ink shadow-[0_2px_6px_rgba(0,0,0,0.25)] disabled:opacity-60"
                  >
                    <XIcon />
                  </button>
                </div>
              )
            })}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={addPhotos.isPending}
              aria-label="Fotoğraf ekle"
              className="flex h-[76px] w-[76px] shrink-0 cursor-pointer items-center justify-center rounded-[14px] border-[1.5px] border-dashed border-[#D4D4D4] disabled:opacity-60"
            >
              {addPhotos.isPending ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-divider border-t-ink" />
              ) : (
                <PlusDashedIcon color="#ADADAD" />
              )}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const files = e.target.files ? Array.from(e.target.files) : []
              if (files.length > 0 && kayit) {
                addPhotos.mutate({ businessId: kayit.business_id, kayitId: id, files })
              }
              e.target.value = ''
            }}
          />
        </div>
      )}

      <div className="px-6 pt-5">
        {/* Plaka + durum pill — labeled cards in edit mode so plaka and
            müşteri are distinguishable at a glance */}
        <div className="mb-[6px] flex items-center justify-between gap-3">
          {editing && draft ? (
            <div className="min-w-0 flex-1 rounded-[14px] bg-card px-4 py-[10px]">
              <div className="mb-1 text-[11px] font-bold tracking-[0.5px] text-faint">PLAKA</div>
              <input
                type="text"
                value={draft.plaka}
                onChange={(e) => setDraft({ ...draft, plaka: e.target.value })}
                maxLength={KAYIT_MAX.plaka}
                className="w-full border-none bg-transparent p-0 text-xl font-bold tracking-[1px] text-ink outline-none"
              />
            </div>
          ) : (
            <h1 className="text-[28px] font-bold tracking-[1px] text-ink">{kayit.plaka}</h1>
          )}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setDurumMenuOpen((v) => !v)}
              className="flex cursor-pointer select-none items-center gap-1 rounded-[8px] py-[5px] pl-3 pr-[10px] text-xs font-bold"
              style={{ background: durumMeta.bg, color: durumMeta.color }}
            >
              {durumMeta.label}
              <ChevronDownIcon size={11} color={durumMeta.color} rotated={durumMenuOpen} />
            </button>
            {durumMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setDurumMenuOpen(false)} />
                <div className="menu-in absolute right-0 top-[calc(100%+6px)] z-20 min-w-[130px] rounded-[12px] bg-white p-[6px] shadow-[0_8px_24px_rgba(0,0,0,0.15)]">
                  {DURUM_ORDER.filter((d) => d !== kayit.durum).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        setDurumMenuOpen(false)
                        setPendingDurum(d)
                      }}
                      className="mb-1 w-full cursor-pointer whitespace-nowrap rounded-[8px] px-3 py-[9px] text-left text-[13px] font-semibold last:mb-0"
                      style={{ background: DURUM_MENU_META[d].bg, color: DURUM_MENU_META[d].color }}
                    >
                      {DURUM_META[d].label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Müşteri */}
        {editing && draft ? (
          <div className="mb-2 flex gap-2">
            <div className="min-w-0 flex-1 rounded-[14px] bg-card px-4 py-[10px]">
              <div className="mb-1 text-[11px] font-bold tracking-[0.5px] text-faint">
                MÜŞTERİ ADI
              </div>
              <input
                type="text"
                value={draft.musteri_adi}
                onChange={(e) => setDraft({ ...draft, musteri_adi: e.target.value })}
                maxLength={KAYIT_MAX.musteriAdi}
                className="w-full border-none bg-transparent p-0 text-base font-bold text-ink outline-none"
              />
            </div>
            <div className="min-w-0 flex-1 rounded-[14px] bg-card px-4 py-[10px]">
              <div className="mb-1 text-[11px] font-bold tracking-[0.5px] text-faint">
                MÜŞTERİ NUMARASI
              </div>
              <div className="flex items-center">
                <span className="shrink-0 text-base font-bold text-muted">+90</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={draft.musteri_tel}
                  onChange={(e) =>
                    setDraft({ ...draft, musteri_tel: normalizeTel(e.target.value) })
                  }
                  placeholder="5__ ___ __ __"
                  maxLength={10}
                  className="w-full min-w-0 border-none bg-transparent p-0 pl-1 text-base font-bold text-ink outline-none placeholder:text-faint"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-[2px] flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-bold text-ink">{kayit.musteri_adi || '—'}</p>
              {isTelComplete(kayit.musteri_tel) && (
                <p className="mt-[1px] text-[13px] text-muted">
                  {formatTelDisplay(kayit.musteri_tel)}
                </p>
              )}
            </div>
            {isTelComplete(kayit.musteri_tel) && (
              <a
                href={telHref(kayit.musteri_tel)}
                aria-label="Müşteriyi ara"
                className="pressable flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-success"
              >
                <PhoneIcon size={17} color="#fff" />
              </a>
            )}
          </div>
        )}
        <p className="mb-6 text-[15px] text-muted">{subtitleParts.join(' · ') || '—'}</p>

        {/* Info grid */}
        <div className="mb-3 flex gap-[10px]">
          <InfoCard label="MARKA">
            {editing && draft ? (
              <input
                type="text"
                value={draft.marka}
                onChange={(e) => setDraft({ ...draft, marka: e.target.value })}
                maxLength={KAYIT_MAX.marka}
                className={bareInputCls}
              />
            ) : (
              <div className="text-[15px] font-semibold text-ink">{kayit.marka || '—'}</div>
            )}
          </InfoCard>
          <InfoCard label="MODEL">
            {editing && draft ? (
              <input
                type="text"
                value={draft.model}
                onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                maxLength={KAYIT_MAX.model}
                className={bareInputCls}
              />
            ) : (
              <div className="text-[15px] font-semibold text-ink">{kayit.model || '—'}</div>
            )}
          </InfoCard>
        </div>

        <div className="mb-3 flex gap-[10px]">
          <InfoCard label="YIL">
            {/* type="text" + digitsOnly: number alanı maxLength'i yok sayıyor */}
            {editing && draft ? (
              <input
                type="text"
                inputMode="numeric"
                value={draft.yil ?? ''}
                onChange={(e) => {
                  const v = digitsOnly(e.target.value, YIL_DIGITS)
                  setDraft({ ...draft, yil: v ? Number(v) : null })
                }}
                maxLength={YIL_DIGITS}
                className={bareInputCls}
              />
            ) : (
              <div className="text-[15px] font-semibold text-ink">{kayit.yil ?? '—'}</div>
            )}
          </InfoCard>
          <InfoCard label="KM">
            {editing && draft ? (
              <input
                type="text"
                inputMode="numeric"
                value={draft.km ?? ''}
                onChange={(e) => {
                  const v = digitsOnly(e.target.value, KM_DIGITS)
                  setDraft({ ...draft, km: v ? Number(v) : null })
                }}
                maxLength={KM_DIGITS}
                className={bareInputCls}
              />
            ) : (
              <div className="text-[15px] font-semibold text-ink">
                {kayit.km !== null ? kayit.km.toLocaleString('tr-TR') : '—'}
              </div>
            )}
          </InfoCard>
        </div>

        <div className="mb-3 flex">
          <InfoCard label="RUHSAT NUMARASI">
            {editing && draft ? (
              <input
                type="text"
                value={draft.ruhsat_no}
                onChange={(e) => setDraft({ ...draft, ruhsat_no: e.target.value })}
                maxLength={KAYIT_MAX.ruhsatNo}
                className={bareInputCls}
              />
            ) : (
              <div className="text-[15px] font-semibold text-ink">{kayit.ruhsat_no || '—'}</div>
            )}
          </InfoCard>
        </div>

        <div className="relative mb-3 rounded-[14px] bg-card px-4 py-[14px]">
          <div className="mb-1 text-[11px] font-bold tracking-[0.5px] text-faint">
            PAKET SEÇİMİ
          </div>
          {editing && draft ? (
            <PaketDropdown
              paketler={paketler}
              selectedId={draft.paket_id}
              onSelect={(pid) => {
                setDraft({ ...draft, paket_id: pid })
                if (canEditFinans && pid) {
                  const p = paketler.find((x) => x.id === pid)
                  if (p) setFinansTutar(kurusToInput(numericStringToKurus(p.price)))
                }
              }}
              variant="card"
            />
          ) : (
            <div className="text-[15px] font-semibold text-ink">
              {kayit.paket ? paketFullLabel(kayit.paket) : 'Paket seçilmedi'}
            </div>
          )}
        </div>

        {/* Görüntüleme: elle girilen tutar + ödeme yöntemi (034) — paketin hemen
            altında, gelir doğduktan sonra da görünür. Finans-only: ödeme bilgisi
            personelin işi değil (paket fiyatı zaten paket satırında görünüyor). */}
        {!editing &&
          isFinance &&
          (kayit.tutar != null || kayit.odeme_yontemi != null || komisyonKurus !== null) && (
            // flex-wrap + basis-full: MOBİLDE komisyon varsa yöntem kartı kendi
            // satırına iner (yarım genişlikte yöntem + komisyon sığmıyor);
            // md: üstünde yer bol, md:basis-0 ile TUTAR'la yan yana döner
            <div className="mb-3 flex flex-wrap gap-[10px]">
              <InfoCard label="TUTAR">
                <div className="text-[15px] font-semibold text-ink">
                  {kayit.tutar != null ? formatTL(numericStringToKurus(kayit.tutar)) : '—'}
                </div>
              </InfoCard>
              <InfoCard
                label="ÖDEME YÖNTEMİ"
                className={komisyonKurus !== null ? 'basis-full md:basis-0' : ''}
              >
                {/* metin uzarsa taşmak yerine alt satıra sarsın */}
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-[2px]">
                  <span className="text-[15px] font-semibold text-ink">
                    {kayit.odeme_yontemi ? YONTEM_LABELS[kayit.odeme_yontemi] : '—'}
                  </span>
                  {komisyonKurus !== null && (
                    <span className="text-[12.5px] font-medium text-muted">
                      {/* Oran + TL her iki boyutta da görünür; yalnızca
                          "Komisyon:" öneki mobilde gizli (satır kısalsın). */}
                      <span className="hidden md:inline">Komisyon: </span>
                      {komisyonOran !== null
                        ? `${formatYuzde(komisyonOran)} · ${formatTL(komisyonKurus)}`
                        : formatTL(komisyonKurus)}
                    </span>
                  )}
                </div>
              </InfoCard>
            </div>
          )}

        {/* Finans (034): tutar / ödeme yöntemi / komisyon — düzenlenebilir yalnızca
            gelir henüz doğmadıysa (finans + aktif işlem yok) */}
        {editing && canEditFinans && (
          <>
            <div className="mb-3 rounded-[14px] bg-card px-4 py-[14px]">
              <div className="mb-1 text-[11px] font-bold tracking-[0.5px] text-faint">
                TUTAR (₺)
              </div>
              <input
                type="text"
                inputMode="decimal"
                value={finansTutar}
                onChange={(e) => setFinansTutar(e.target.value)}
                placeholder="Paket fiyatı"
                className={bareInputCls}
              />
            </div>

            <div className="mb-3 rounded-[14px] bg-card px-4 py-[14px]">
              <div className="mb-[8px] text-[11px] font-bold tracking-[0.5px] text-faint">
                ÖDEME YÖNTEMİ
              </div>
              <div className="flex gap-2">
                {(['NAKIT', 'KREDI_KARTI', 'HAVALE'] as const).map((y) => {
                  const selected = finansYontem === y
                  return (
                    <button
                      key={y}
                      type="button"
                      onClick={() => setFinansYontem(selected ? null : y)}
                      className="flex-1 cursor-pointer rounded-[10px] border-[1.5px] py-[10px] text-center text-[13px] font-semibold"
                      style={{
                        background: selected ? 'var(--seg-on)' : 'var(--seg)',
                        borderColor: selected ? 'var(--seg-on)' : 'var(--color-inputline)',
                        color: selected ? 'var(--seg-fg-on)' : 'var(--seg-fg)',
                      }}
                    >
                      {YONTEM_LABELS[y]}
                    </button>
                  )
                })}
              </div>
            </div>

            {finansYontem === 'KREDI_KARTI' && (
              <div className="mb-3 rounded-[14px] bg-card px-4 py-[14px]">
                <div className="mb-1 text-[11px] font-bold tracking-[0.5px] text-faint">
                  KOMİSYON (₺)
                </div>
                <KomisyonBankaSecici
                  baseKurus={gelirBaseKurus(
                    finansTutar,
                    paketler.find((p) => p.id === draft.paket_id)?.price ?? null,
                  )}
                  komisyon={finansKomisyon}
                  onKomisyon={setFinansKomisyon}
                />
                <input
                  type="text"
                  inputMode="decimal"
                  value={finansKomisyon}
                  onChange={(e) => setFinansKomisyon(e.target.value)}
                  placeholder="İsteğe bağlı"
                  className={bareInputCls}
                />
              </div>
            )}
          </>
        )}

        {editing && isFinance && hasActiveGelir && (
          <div className="mb-3 rounded-[14px] bg-field px-4 py-3 text-[12px] leading-relaxed text-muted">
            Gelir oluşturuldu; tutar/ödeme yöntemi ilgili işlem üzerinden yönetilir.
          </div>
        )}

        <div className="mb-3 flex gap-[10px]">
          <InfoCard label="TARİH">
            {editing && draft ? (
              <input
                type="date"
                value={draft.tarih}
                onChange={(e) => setDraft({ ...draft, tarih: e.target.value })}
                className={bareInputCls}
              />
            ) : (
              <div className="text-[15px] font-semibold text-ink">
                {formatDateDots(kayit.tarih)}
              </div>
            )}
          </InfoCard>
          <InfoCard label="OLUŞTURAN">
            <div className="truncate text-[15px] font-semibold text-ink">
              {kayit.creator?.full_name ?? '—'}
            </div>
          </InfoCard>
        </div>

        {/* Saat */}
        <div className="mb-3 rounded-[14px] bg-card px-4 py-[14px]">
          <div className="mb-1 text-[11px] font-bold tracking-[0.5px] text-faint">SAAT</div>
          {editing && draft ? (
            <div className="flex gap-[10px]">
              <SaatDropdown
                value={draft.baslangic_saati}
                onChange={(v) => setDraft({ ...draft, baslangic_saati: v })}
                placeholder="Başlangıç saati"
              />
              <SaatDropdown
                value={draft.bitis_saati}
                onChange={(v) => setDraft({ ...draft, bitis_saati: v })}
                placeholder="Bitiş saati"
              />
            </div>
          ) : (
            <div className="text-[15px] font-semibold text-ink">
              {kayit.baslangic_saati || kayit.bitis_saati
                ? `${kayit.baslangic_saati ? saatLabel(kayit.baslangic_saati) : '—'} – ${
                    kayit.bitis_saati ? saatLabel(kayit.bitis_saati) : '—'
                  }`
                : '—'}
            </div>
          )}
        </div>

        <div className="mb-5 rounded-[14px] bg-card px-4 py-[14px]">
          <div className="mb-[6px] text-[11px] font-bold tracking-[0.5px] text-faint">NOTLAR</div>
          {editing && draft ? (
            <textarea
              value={draft.notlar}
              onChange={(e) => setDraft({ ...draft, notlar: e.target.value })}
              maxLength={KAYIT_MAX.notlar}
              className="min-h-20 w-full resize-none border-none bg-transparent p-0 text-[15px] text-ink outline-none"
            />
          ) : (
            <p className="text-[15px] leading-normal text-ink">{kayit.notlar || '—'}</p>
          )}
        </div>

        {error && <p className="mb-3 text-center text-sm text-danger">{error}</p>}

        {editing && (
          <button
            type="button"
            onClick={() => void saveEdit()}
            disabled={updateKayit.isPending}
            className="pressable mb-3 w-full cursor-pointer rounded-[14px] bg-ink py-[18px] text-base font-semibold text-white disabled:opacity-60"
          >
            {updateKayit.isPending ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        )}

        {!editing && !kayit.silme_talebi_at && (
          <button
            type="button"
            onClick={() => void onSil()}
            disabled={requestSilme.isPending}
            className="pressable mb-3 w-full cursor-pointer rounded-[14px] bg-[#FEF3F2] py-4 text-[15px] font-semibold text-danger disabled:opacity-60"
          >
            {requestSilme.isPending ? 'Siliniyor…' : 'Kaydı Sil'}
          </button>
        )}
      </div>
      <div className="h-10" />

      {/* Lightbox */}
      {lightbox && (
        <div className="modal-backdrop fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/[.88]">
          <button
            type="button"
            onClick={() => setLightbox(false)}
            aria-label="Kapat"
            className="absolute right-5 top-5 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/15"
          >
            <XIcon size={14} />
          </button>
          <div className="flex h-[300px] w-[calc(100%-40px)] max-w-[340px] items-center justify-center overflow-hidden rounded-[18px] bg-white">
            {currentUrl ? (
              <img src={currentUrl} alt="" className="h-full w-full object-contain" />
            ) : (
              <PhotoPlaceholderIcon size={52} strokeWidth={1.2} />
            )}
          </div>
          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPhotoIndex((i) => Math.max(0, i - 1))}
              aria-label="Önceki"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/20"
            >
              <ArrowLeftSmall color="white" />
            </button>
            <span className="text-sm font-semibold text-white/80">
              {fotograflar.length === 0 ? '0 / 0' : `${photoIndex + 1} / ${fotograflar.length}`}
            </span>
            <button
              type="button"
              onClick={() => setPhotoIndex((i) => Math.min(fotograflar.length - 1, i + 1))}
              aria-label="Sonraki"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/20"
            >
              <ArrowRightSmall color="white" />
            </button>
          </div>
        </div>
      )}

      {/* Durum change confirmation */}
      <ConfirmDialog
        open={pendingDurum !== null}
        title="Durumu değiştir"
        message={`Durumu "${durumMeta.label}" yerine "${
          pendingDurum ? DURUM_META[pendingDurum].label : ''
        }" olarak değiştirmek istediğinize emin misiniz?`}
        busy={updateDurum.isPending}
        onConfirm={() => void confirmDurumChange()}
        onCancel={() => setPendingDurum(null)}
      />

    </div>
  )
}
