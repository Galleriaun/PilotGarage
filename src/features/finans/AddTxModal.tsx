import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { parseTLToKurus } from '../../lib/money'
import type { OdemeYontemi } from '../../lib/types'
import { ChevronDownIcon } from '../kayit/icons'
import { useAddIslem, useKategoriler } from './api'
import { ODEME_YONTEMI_LABELS, type IslemTur, type TekrarSiklik } from './types'

const fieldLabelCls = 'mb-[6px] text-[11px] font-bold uppercase tracking-[0.6px] text-faint'
const inputCls =
  'w-full rounded-[12px] border-none bg-field px-[14px] py-[13px] text-[15px] text-ink outline-none placeholder:text-faint'

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#111"
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

const SIKLIK_OPTIONS: { key: TekrarSiklik; label: string }[] = [
  { key: 'HAFTALIK', label: 'Haftalık' },
  { key: 'AYLIK', label: 'Aylık' },
  { key: 'YILLIK', label: 'Yıllık' },
]

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
  const [tekrarlanan, setTekrarlanan] = useState(false)
  const [siklik, setSiklik] = useState<TekrarSiklik>('AYLIK')
  const [error, setError] = useState('')

  const options = kategoriler.filter((k) => k.tur === tur)
  const selectedKategori = options.find((k) => k.id === kategoriId) ?? null

  function reset() {
    setAmount('')
    setBaslik('')
    setKategoriId(null)
    setKategoriOpen(false)
    setOdemeYontemi(null)
    setTekrarlanan(false)
    setSiklik('AYLIK')
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
    try {
      await addIslem.mutateAsync({
        businessId,
        tur,
        kurus,
        baslik: baslik.trim() || (tur === 'GELIR' ? 'Gelir' : 'Gider'),
        kategoriId,
        odemeYontemi,
        tekrar: tekrarlanan ? siklik : null,
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
                            style={{ background: selected ? '#F2F2F2' : 'transparent' }}
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
                  {(['NAKIT', 'KREDI_KARTI'] as const).map((y) => {
                    const selected = odemeYontemi === y
                    return (
                      <button
                        key={y}
                        type="button"
                        onClick={() => setOdemeYontemi(y)}
                        className="flex-1 cursor-pointer rounded-[12px] border-[1.5px] py-[11px] text-center text-[13px] font-semibold"
                        style={{
                          background: selected ? '#111' : '#F2F2F2',
                          borderColor: selected ? '#111' : '#F2F2F2',
                          color: selected ? '#fff' : '#888',
                        }}
                      >
                        {ODEME_YONTEMI_LABELS[y]}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <div className={fieldLabelCls}>TEKRAR</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTekrarlanan(false)}
                    className="flex-1 cursor-pointer rounded-[12px] py-[11px] text-center text-[13px] font-semibold"
                    style={{
                      background: !tekrarlanan ? '#111' : '#F2F2F2',
                      color: !tekrarlanan ? '#fff' : '#888',
                    }}
                  >
                    Bir Kez
                  </button>
                  <button
                    type="button"
                    onClick={() => setTekrarlanan(true)}
                    className="flex-1 cursor-pointer rounded-[12px] py-[11px] text-center text-[13px] font-semibold"
                    style={{
                      background: tekrarlanan ? '#111' : '#F2F2F2',
                      color: tekrarlanan ? '#fff' : '#888',
                    }}
                  >
                    Tekrarlanan
                  </button>
                </div>
                {tekrarlanan && (
                  <div className="menu-in mt-2 flex gap-2">
                    {SIKLIK_OPTIONS.map((s) => {
                      const selected = siklik === s.key
                      return (
                        <button
                          key={s.key}
                          type="button"
                          onClick={() => setSiklik(s.key)}
                          className="flex-1 cursor-pointer rounded-[10px] py-2 text-center text-xs font-semibold"
                          style={{
                            background: selected ? '#3A3A3A' : '#F2F2F2',
                            color: selected ? '#fff' : '#888',
                          }}
                        >
                          {s.label}
                        </button>
                      )
                    })}
                  </div>
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
