import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { parseTLToKurus } from '../../lib/money'
import type { OdemeYontemi } from '../../lib/types'
import { ChevronDownIcon } from '../kayit/icons'
import { GunDropdown } from '../yonetim/shared'
import { useAddIslem, useKategoriler } from './api'
import { ODEME_YONTEMI_LABELS, type IslemTur } from './types'

const fieldLabelCls = 'mb-[6px] text-[11px] font-bold uppercase tracking-[0.6px] text-faint'
const inputCls =
  'w-full rounded-[12px] border-none bg-field px-[14px] py-[13px] text-[15px] text-ink outline-none placeholder:text-faint'

function CheckIcon() {
  return (
    <svg
      className="text-ink"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

interface AddTxModalProps {
  open: boolean
  tur: IslemTur
  businessId: string
  onClose: () => void
}

export default function AddTxModal({ open, tur, businessId, onClose }: AddTxModalProps) {
  const { data: kategoriler = [] } = useKategoriler(businessId)
  const addIslem = useAddIslem()

  const [amount, setAmount] = useState('')
  const [baslik, setBaslik] = useState('')
  const [kategoriId, setKategoriId] = useState<string | null>(null)
  const [kategoriOpen, setKategoriOpen] = useState(false)
  const [odemeYontemi, setOdemeYontemi] = useState<OdemeYontemi | null>(null)
  const [komisyon, setKomisyon] = useState('') // KK only — separate gider on approval
  const [gun, setGun] = useState(0) // 0 = bir kez, 1–28 = her ay o gün otomatik
  const [error, setError] = useState('')

  const options = kategoriler.filter((k) => k.tur === tur)
  const selectedKategori = options.find((k) => k.id === kategoriId) ?? null

  function reset() {
    setAmount('')
    setBaslik('')
    setKategoriId(null)
    setKategoriOpen(false)
    setOdemeYontemi(null)
    setKomisyon('')
    setGun(0)
    setError('')
  }

  function close() {
    if (addIslem.isPending) return
    reset()
    onClose()
  }

  async function onSave() {
    setError('')
    const kurus = parseTLToKurus(amount)
    if (kurus === null || kurus <= 0) {
      setError('Geçerli bir tutar girin.')
      return
    }
    if (!odemeYontemi) {
      setError('Ödeme yöntemi seçin (Nakit / Kredi Kartı).')
      return
    }
    let komisyonKurus: number | null = null
    if (odemeYontemi === 'KREDI_KARTI' && komisyon.trim() !== '') {
      komisyonKurus = parseTLToKurus(komisyon)
      if (komisyonKurus === null || komisyonKurus <= 0) {
        setError('Geçerli bir komisyon girin.')
        return
      }
      if (komisyonKurus >= kurus) {
        setError('Komisyon, işlem tutarından küçük olmalıdır.')
        return
      }
    }
    try {
      await addIslem.mutateAsync({
        businessId,
        tur,
        kurus,
        baslik: baslik.trim() || (tur === 'GELIR' ? 'Gelir' : 'Gider'),
        kategoriId,
        odemeYontemi,
        odemeGunu: gun,
        komisyonKurus,
      })
      reset()
      onClose()
    } catch {
      setError('İşlem eklenemedi. Tekrar deneyin.')
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-backdrop fixed inset-0 z-50 bg-black/45" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-64px)] max-w-[320px] -translate-x-1/2 -translate-y-1/2 outline-none">
          <div className="modal-pop max-h-[90dvh] overflow-y-auto rounded-[20px] bg-white px-[22px] py-6 shadow-[0_20px_50px_rgba(0,0,0,0.25)]">
            <Dialog.Title className="mb-4 text-[17px] font-bold text-ink">
              {tur === 'GELIR' ? 'Gelir Ekle' : 'Gider Ekle'}
            </Dialog.Title>
            <Dialog.Description className="sr-only">
              Onay kuyruğuna yeni bir işlem ekler.
            </Dialog.Description>

            <div className="mb-5 flex flex-col gap-[10px]">
              <div>
                <div className={fieldLabelCls}>TUTAR (₺)</div>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={inputCls}
                />
              </div>

              <div>
                <div className={fieldLabelCls}>AÇIKLAMA</div>
                <input
                  type="text"
                  placeholder={tur === 'GELIR' ? 'Örn. Nakit ödeme' : 'Örn. Malzeme alımı'}
                  value={baslik}
                  onChange={(e) => setBaslik(e.target.value)}
                  className={inputCls}
                />
              </div>

              <div>
                <div className={fieldLabelCls}>KATEGORİ</div>
                <button
                  type="button"
                  onClick={() => setKategoriOpen((v) => !v)}
                  className="flex w-full cursor-pointer items-center justify-between rounded-[12px] bg-field px-[14px] py-[13px]"
                >
                  <span
                    className="text-[15px] font-medium"
                    style={{ color: selectedKategori ? '#111' : '#ADADAD' }}
                  >
                    {selectedKategori ? selectedKategori.label : 'Kategori seç'}
                  </span>
                  <ChevronDownIcon size={12} color="#888" rotated={kategoriOpen} />
                </button>
                {kategoriOpen && (
                  <div className="menu-in mt-[6px] rounded-[14px] bg-card p-[6px]">
                    {options.length === 0 ? (
                      <div className="px-3 py-[10px] text-sm text-muted">Kategori yok.</div>
                    ) : (
                      options.map((k) => {
                        const selected = k.id === kategoriId
                        return (
                          <button
                            key={k.id}
                            type="button"
                            onClick={() => {
                              setKategoriId(k.id)
                              setKategoriOpen(false)
                            }}
                            className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-[10px] px-3 py-[10px] text-left text-sm font-semibold text-ink"
                            style={{ background: selected ? 'var(--seg)' : 'transparent' }}
                          >
                            <span>{k.label}</span>
                            {selected && <CheckIcon />}
                          </button>
                        )
                      })
                    )}
                  </div>
                )}
              </div>

              <div>
                <div className={fieldLabelCls}>ÖDEME YÖNTEMİ</div>
                <div className="flex gap-2">
                  {(['NAKIT', 'KREDI_KARTI', 'HAVALE'] as const).map((y) => {
                    const selected = odemeYontemi === y
                    return (
                      <button
                        key={y}
                        type="button"
                        onClick={() => setOdemeYontemi(y)}
                        className="flex-1 cursor-pointer rounded-[12px] border-[1.5px] py-[11px] text-center text-[13px] font-semibold"
                        style={{
                          background: selected ? 'var(--seg-on)' : 'var(--seg)',
                          borderColor: selected ? 'var(--seg-on)' : 'var(--seg)',
                          color: selected ? 'var(--seg-fg-on)' : 'var(--seg-fg)',
                        }}
                      >
                        {ODEME_YONTEMI_LABELS[y]}
                      </button>
                    )
                  })}
                </div>
              </div>

              {odemeYontemi === 'KREDI_KARTI' && (
                <div>
                  <div className={fieldLabelCls}>KOMİSYON (₺) — İSTEĞE BAĞLI</div>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    value={komisyon}
                    onChange={(e) => setKomisyon(e.target.value)}
                    className={inputCls}
                  />
                  <p className="mt-[6px] text-xs leading-relaxed text-faint">
                    İşlem kasaya işlendiğinde komisyon ayrı bir gider olarak düşülür
                    {gun > 0 ? ' — tekrarlanan işlemde her seferinde' : ''}.
                  </p>
                </div>
              )}

              <div>
                <div className={fieldLabelCls}>TEKRAR</div>
                <GunDropdown value={gun} onChange={setGun} allowManual zeroLabel="Yok (tek sefer)" />
                {gun > 0 && (
                  <p className="mt-[6px] text-xs leading-relaxed text-faint">
                    Her ayın {gun}. günü aynı {tur === 'GELIR' ? 'gelir' : 'gider'} otomatik
                    olarak kasaya işlenir.
                  </p>
                )}
              </div>
            </div>

            {error && <p className="mb-3 text-center text-sm text-danger">{error}</p>}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={close}
                disabled={addIslem.isPending}
                className="flex-1 cursor-pointer rounded-[12px] bg-field py-3 text-sm font-semibold text-ink disabled:opacity-60"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={() => void onSave()}
                disabled={addIslem.isPending}
                className="flex-1 cursor-pointer rounded-[12px] py-3 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: tur === 'GELIR' ? '#166534' : '#991B1B' }}
              >
                {addIslem.isPending ? 'Ekleniyor…' : 'Ekle'}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
