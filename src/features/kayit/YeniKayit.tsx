import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../../app/providers/AuthProvider'
import { useBusiness } from '../../app/providers/BusinessProvider'
import { istanbulTodayISO } from '../../lib/dates'
import { kurusToInput, numericStringToKurus } from '../../lib/money'
import { canSeeFinance } from '../../lib/rbac'
import type { OdemeYontemi } from '../../lib/types'
import { useCreateKayit, usePaketler } from './api'
import { PaketDropdown, SaatDropdown } from './components'
import { DURUM_ORDER, DURUM_META, DURUM_SEGMENT_META } from './durum'
import { buildFinansAlanlari, gelirBaseKurus, YONTEM_LABELS } from './finans'
import KomisyonBankaSecici from '../../components/ui/KomisyonBankaSecici'
import { digitsOnly, KAYIT_MAX, KM_DIGITS, YIL_DIGITS, YIL_MAX, YIL_MIN } from './limits'
import { isTelComplete, normalizeTel } from './telefon'
import { PhotoPlaceholderIcon, PlusDashedIcon, XIcon } from './icons'
import { BackChevron } from '../auth/EyeIcon'
import type { KayitDurum, KayitFinansAlanlari } from './types'

const inputCls =
  'w-full rounded-[14px] border-[1.5px] border-inputline bg-inputfill px-[18px] py-4 text-[15px] text-ink outline-none placeholder:text-faint'

function FieldLabel({ children }: { children: string }) {
  return (
    <div className="mb-[6px] text-[11px] font-bold uppercase tracking-[0.6px] text-label">
      {children}
    </div>
  )
}

interface PhotoDraft {
  file: File
  url: string
}

export default function YeniKayit() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isFinance = canSeeFinance(profile?.role ?? null)
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id ?? ''
  const { data: paketler = [] } = usePaketler(businessId)
  const createKayit = useCreateKayit()

  const [musteriAdi, setMusteriAdi] = useState('')
  const [musteriTel, setMusteriTel] = useState('') // ulusal kısım "5XXXXXXXXX"
  const [plaka, setPlaka] = useState('')
  const [marka, setMarka] = useState('')
  const [model, setModel] = useState('')
  const [yil, setYil] = useState('')
  const [km, setKm] = useState('')
  const [ruhsatNo, setRuhsatNo] = useState('')
  const [paketId, setPaketId] = useState<string | null>(null)
  const [tarih, setTarih] = useState(istanbulTodayISO())
  const [baslangicSaati, setBaslangicSaati] = useState<string | null>(null)
  const [bitisSaati, setBitisSaati] = useState<string | null>(null)
  const [notlar, setNotlar] = useState('')
  const [durum, setDurum] = useState<KayitDurum>('AKTIF')
  // Finans (034): tutar override + ödeme yöntemi + KK komisyonu
  const [tutar, setTutar] = useState('')
  const [odemeYontemi, setOdemeYontemi] = useState<OdemeYontemi | null>(null)
  const [komisyon, setKomisyon] = useState('')
  const [photos, setPhotos] = useState<PhotoDraft[]>([])
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Revoke preview object URLs on unmount
  const photosRef = useRef<PhotoDraft[]>([])
  photosRef.current = photos
  useEffect(
    () => () => {
      for (const p of photosRef.current) URL.revokeObjectURL(p.url)
    },
    [],
  )

  function addFiles(list: FileList | null) {
    if (!list) return
    const next = Array.from(list).map((file) => ({ file, url: URL.createObjectURL(file) }))
    setPhotos((prev) => [...prev, ...next])
  }

  function removePhoto(url: string) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.url === url)
      if (target) URL.revokeObjectURL(target.url)
      return prev.filter((p) => p.url !== url)
    })
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!plaka.trim()) {
      setError('Plaka girin.')
      return
    }
    const yilNum = yil.trim() ? Number(yil) : null
    if (yilNum !== null && (!Number.isInteger(yilNum) || yilNum < YIL_MIN || yilNum > YIL_MAX)) {
      setError(`Geçerli bir yıl girin (${YIL_MIN}–${YIL_MAX}).`)
      return
    }
    const kmNum = km.trim() ? Number(km) : null
    if (kmNum !== null && (!Number.isInteger(kmNum) || kmNum < 0)) {
      setError('Geçerli bir kilometre girin.')
      return
    }
    if (!tarih) {
      setError('Tarih seçin.')
      return
    }
    if (baslangicSaati && bitisSaati && bitisSaati <= baslangicSaati) {
      setError('Bitiş saati başlangıçtan sonra olmalı.')
      return
    }
    if (musteriTel && !isTelComplete(musteriTel)) {
      setError('Telefon numarası eksik — 5 ile başlayan 10 hane girin.')
      return
    }

    // Finans alanları (034): tutar override + yöntem + komisyon
    let finans: KayitFinansAlanlari | undefined
    if (isFinance) {
      const res = buildFinansAlanlari({ paketId, tutar, odemeYontemi, komisyon })
      if ('error' in res) {
        setError(res.error)
        return
      }
      finans = res.finans
    }

    try {
      const { kayitId, photoFailures } = await createKayit.mutateAsync({
        businessId,
        fields: {
          musteri_adi: musteriAdi.trim(),
          musteri_tel: musteriTel,
          plaka,
          marka: marka.trim(),
          model: model.trim(),
          yil: yilNum,
          km: kmNum,
          ruhsat_no: ruhsatNo.trim(),
          paket_id: paketId,
          tarih,
          baslangic_saati: baslangicSaati,
          bitis_saati: bitisSaati,
          notlar: notlar.trim(),
        },
        durum,
        photos: photos.map((p) => p.file),
        finans,
      })
      void navigate(`/kayit/${kayitId}`, { replace: true, state: { photoFailures } })
    } catch {
      setError('Kayıt oluşturulamadı. Tekrar deneyin.')
    }
  }

  return (
    <div className="screen-forward">
      <div className="px-6 pt-4">
        <button
          type="button"
          onClick={() => void navigate(-1)}
          className="inline-flex cursor-pointer items-center gap-1 py-[6px]"
        >
          <BackChevron />
          <span className="text-[15px] font-medium text-ink">Geri</span>
        </button>
      </div>

      <form noValidate onSubmit={(e) => void onSubmit(e)} className="px-6 pt-4">
        <h1 className="mb-6 text-[26px] font-bold tracking-[-0.4px] text-ink">Yeni Araç Kaydı</h1>

        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <div className="min-w-0 flex-1">
              <FieldLabel>MÜŞTERİ ADI</FieldLabel>
              <input
                type="text"
                value={musteriAdi}
                onChange={(e) => setMusteriAdi(e.target.value)}
                maxLength={KAYIT_MAX.musteriAdi}
                className={inputCls}
              />
            </div>
            <div className="min-w-0 flex-1">
              <FieldLabel>MÜŞTERİ NUMARASI</FieldLabel>
              {/* +90 sabit; yalnızca 5 ile başlayan 10 hane yazılabilir (035) */}
              <div className="flex items-center rounded-[14px] border-[1.5px] border-inputline bg-inputfill px-[14px] py-4">
                <span className="shrink-0 text-[15px] font-semibold text-muted">+90</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={musteriTel}
                  onChange={(e) => setMusteriTel(normalizeTel(e.target.value))}
                  placeholder="5__ ___ __ __"
                  maxLength={10}
                  className="w-full min-w-0 border-none bg-transparent pl-2 text-[15px] text-ink outline-none placeholder:text-faint"
                />
              </div>
            </div>
          </div>

          <div>
            <FieldLabel>PLAKA</FieldLabel>
            <input
              type="text"
              value={plaka}
              onChange={(e) => setPlaka(e.target.value)}
              maxLength={KAYIT_MAX.plaka}
              autoCapitalize="characters"
              className={`${inputCls} text-[17px] font-bold tracking-[1px]`}
            />
          </div>

          <div>
            <FieldLabel>RUHSAT NUMARASI</FieldLabel>
            <input
              type="text"
              value={ruhsatNo}
              onChange={(e) => setRuhsatNo(e.target.value)}
              maxLength={KAYIT_MAX.ruhsatNo}
              className={inputCls}
            />
          </div>

          <div className="flex gap-[10px]">
            <div className="flex-1">
              <FieldLabel>MARKA</FieldLabel>
              <input
                type="text"
                value={marka}
                onChange={(e) => setMarka(e.target.value)}
                maxLength={KAYIT_MAX.marka}
                className={inputCls}
              />
            </div>
            <div className="flex-1">
              <FieldLabel>MODEL</FieldLabel>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                maxLength={KAYIT_MAX.model}
                className={inputCls}
              />
            </div>
          </div>

          <div className="flex gap-[10px]">
            <div className="flex-1">
              <FieldLabel>YIL</FieldLabel>
              {/* type="text" + digitsOnly: number alanı maxLength'i yok sayıyor */}
              <input
                type="text"
                inputMode="numeric"
                value={yil}
                onChange={(e) => setYil(digitsOnly(e.target.value, YIL_DIGITS))}
                maxLength={YIL_DIGITS}
                className={inputCls}
              />
            </div>
            <div className="flex-1">
              <FieldLabel>KM</FieldLabel>
              <input
                type="text"
                inputMode="numeric"
                value={km}
                onChange={(e) => setKm(digitsOnly(e.target.value, KM_DIGITS))}
                maxLength={KM_DIGITS}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <FieldLabel>PAKET SEÇİMİ</FieldLabel>
            <PaketDropdown
              paketler={paketler}
              selectedId={paketId}
              onSelect={(id) => {
                setPaketId(id)
                // finans: seçilen paketin fiyatını tutar alanına ön-doldur
                if (isFinance && id) {
                  const p = paketler.find((x) => x.id === id)
                  if (p) setTutar(kurusToInput(numericStringToKurus(p.price)))
                }
              }}
              variant="form"
            />
          </div>

          {isFinance && (
            <>
              <div>
                <FieldLabel>TUTAR (₺)</FieldLabel>
                <input
                  type="text"
                  inputMode="decimal"
                  value={tutar}
                  onChange={(e) => setTutar(e.target.value)}
                  placeholder="Paket fiyatı"
                  className={inputCls}
                />
              </div>

              <div>
                <FieldLabel>ÖDEME YÖNTEMİ</FieldLabel>
                <div className="flex gap-2">
                  {(['NAKIT', 'KREDI_KARTI', 'HAVALE'] as const).map((y) => {
                    const selected = odemeYontemi === y
                    return (
                      <button
                        key={y}
                        type="button"
                        onClick={() => setOdemeYontemi(y)}
                        className="flex-1 cursor-pointer rounded-[12px] border-[1.5px] py-3 text-center text-[13px] font-semibold"
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

              {odemeYontemi === 'KREDI_KARTI' && (
                <div>
                  <FieldLabel>KOMİSYON (₺)</FieldLabel>
                  <KomisyonBankaSecici
                    baseKurus={gelirBaseKurus(
                      tutar,
                      paketler.find((p) => p.id === paketId)?.price ?? null,
                    )}
                    komisyon={komisyon}
                    onKomisyon={setKomisyon}
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={komisyon}
                    onChange={(e) => setKomisyon(e.target.value)}
                    placeholder="İsteğe bağlı"
                    className={inputCls}
                  />
                  <p className="mt-[6px] text-xs leading-relaxed text-faint">
                    Onaylandığında komisyon kasadan ayrı bir gider olarak düşülür.
                  </p>
                </div>
              )}
            </>
          )}

          <div>
            <FieldLabel>TARİH</FieldLabel>
            <input
              type="date"
              value={tarih}
              onChange={(e) => setTarih(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <FieldLabel>SAAT</FieldLabel>
            <div className="flex gap-[10px]">
              <SaatDropdown
                value={baslangicSaati}
                onChange={setBaslangicSaati}
                placeholder="Başlangıç saati"
              />
              <SaatDropdown
                value={bitisSaati}
                onChange={setBitisSaati}
                placeholder="Bitiş saati"
              />
            </div>
            {baslangicSaati && bitisSaati && (
              <p className="mt-[6px] text-xs leading-relaxed text-faint">
                Saati gelince kayıt otomatik Aktif, bitişte Tamamlandı olur.
              </p>
            )}
          </div>

          <div>
            <FieldLabel>FOTOĞRAFLAR</FieldLabel>
            <div className="flex flex-wrap gap-[10px]">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Fotoğraf ekle"
                className="flex h-[76px] w-[76px] shrink-0 cursor-pointer items-center justify-center rounded-[14px] border-[1.5px] border-dashed border-[#C8C8C8]"
              >
                <PlusDashedIcon />
              </button>
              {photos.map((p) => (
                <div key={p.url} className="relative h-[76px] w-[76px] shrink-0">
                  <div className="h-full w-full overflow-hidden rounded-[14px] border-[1.5px] border-inputline bg-inputfill">
                    <img src={p.url} alt="" className="h-full w-full object-cover" />
                  </div>
                  <button
                    type="button"
                    onClick={() => removePhoto(p.url)}
                    aria-label="Fotoğrafı kaldır"
                    className="absolute -right-[6px] -top-[6px] flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-full bg-ink shadow-[0_2px_6px_rgba(0,0,0,0.25)]"
                  >
                    <XIcon />
                  </button>
                </div>
              ))}
              {photos.length === 0 && (
                <div className="flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-[14px] border-[1.5px] border-inputline bg-inputfill">
                  <PhotoPlaceholderIcon size={22} />
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </div>

          <div>
            <FieldLabel>NOTLAR</FieldLabel>
            <textarea
              value={notlar}
              onChange={(e) => setNotlar(e.target.value)}
              maxLength={KAYIT_MAX.notlar}
              className={`${inputCls} min-h-24 resize-none`}
            />
          </div>

          <div>
            <FieldLabel>DURUM</FieldLabel>
            <div className="flex gap-2">
              {DURUM_ORDER.map((d) => {
                const selected = durum === d
                const seg = DURUM_SEGMENT_META[d]
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDurum(d)}
                    className="flex-1 cursor-pointer rounded-[12px] border-[1.5px] py-3 text-center text-[13px] font-semibold"
                    style={{
                      background: selected ? seg.bg : '#EEEEEE',
                      borderColor: selected ? seg.border : '#E2E2E2',
                      color: selected ? 'var(--seg-fg-on)' : 'var(--seg-fg)',
                    }}
                  >
                    {DURUM_META[d].label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {error && <p className="mt-4 text-center text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={createKayit.isPending}
          className="pressable mt-5 w-full cursor-pointer rounded-[14px] bg-ink py-[18px] text-base font-semibold text-white disabled:opacity-60"
        >
          {createKayit.isPending ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </form>
      <div className="h-10" />
    </div>
  )
}
