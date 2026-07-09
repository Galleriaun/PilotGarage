import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useNavigate, useParams } from 'react-router'
import { formatTL, numericStringToKurus, parseTLToKurus } from '../../lib/money'
import { formatRelativeDate } from '../../lib/dates'
import { BackChevron } from '../auth/EyeIcon'
import type { IslemTur } from '../finans/types'
import { CalendarIcon } from '../kayit/icons'
import { useAddHareket, useCariIsletme, useYansitHareket } from './api'
import { bakiyeTag, cariBakiyeKurus } from './Isletmeler'
import { Avatar, FormModal, modalFieldLabel, modalInputCls } from './shared'

/** "2026-07-09" -> "09.07" — the takvim pill's compact range label. */
function ddmm(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}.${m}`
}

function PlusInkIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#111"
      strokeWidth="2.8"
      strokeLinecap="round"
      className="shrink-0"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

export default function IsletmeDetay() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data: isletme, isPending, isError } = useCariIsletme(id)
  const addHareket = useAddHareket()
  const yansit = useYansitHareket()

  const [modal, setModal] = useState<{ open: boolean; tur: IslemTur; tutar: string; note: string }>(
    { open: false, tur: 'GELIR', tutar: '', note: '' },
  )
  const [error, setError] = useState('')
  const [yansitError, setYansitError] = useState('')
  const [yansitBusyId, setYansitBusyId] = useState<string | null>(null)

  const [yansitilmamis, setYansitilmamis] = useState(false)
  const [range, setRange] = useState<{ start: string; end: string } | null>(null)
  const [dateModal, setDateModal] = useState<{ open: boolean; start: string; end: string }>({
    open: false,
    start: '',
    end: '',
  })

  if (isPending) {
    return (
      <div className="flex justify-center py-20 screen-forward">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-divider border-t-ink" />
      </div>
    )
  }
  if (isError || !isletme) {
    return (
      <div className="px-6 py-16 text-center screen-forward">
        <p className="mb-4 text-sm text-danger">İşletme yüklenemedi.</p>
        <button
          type="button"
          onClick={() => void navigate('/yonetim/isletmeler')}
          className="cursor-pointer text-[15px] font-semibold text-ink underline"
        >
          Geri dön
        </button>
      </div>
    )
  }

  const bakiye = cariBakiyeKurus(isletme)
  const tag = bakiyeTag(bakiye)
  let gelirTotal = 0
  let giderTotal = 0
  for (const h of isletme.hareketler) {
    const kurus = numericStringToKurus(String(h.tutar))
    if (h.tur === 'GELIR') gelirTotal += kurus
    else giderTotal += kurus
  }

  // filters narrow the HAREKETLER list only — the cari özet stays whole-account
  const filtersActive = yansitilmamis || range !== null
  const hareketler = isletme.hareketler.filter(
    (h) =>
      (!yansitilmamis || h.kasa_durumu === 'YOK') &&
      (!range || (h.tarih >= range.start && h.tarih <= range.end)),
  )

  async function onSaveHareket() {
    setError('')
    const kurus = parseTLToKurus(modal.tutar)
    if (kurus === null || kurus <= 0) {
      setError('Geçerli bir tutar girin.')
      return
    }
    try {
      await addHareket.mutateAsync({
        cariIsletmeId: id,
        tur: modal.tur,
        kurus,
        note: modal.note.trim(),
      })
      setModal((m) => ({ ...m, open: false }))
    } catch {
      setError('Kaydedilemedi. Tekrar deneyin.')
    }
  }

  async function onYansit(hareketId: string) {
    setYansitError('')
    setYansitBusyId(hareketId)
    try {
      await yansit.mutateAsync({ hareketId })
    } catch {
      setYansitError('Kasaya yansıtılamadı. Tekrar deneyin.')
    } finally {
      setYansitBusyId(null)
    }
  }

  return (
    <div className="screen-forward">
      <div className="px-6 pt-4">
        <button
          type="button"
          onClick={() => void navigate('/yonetim/isletmeler')}
          className="inline-flex cursor-pointer items-center gap-1 py-[6px]"
        >
          <BackChevron />
          <span className="text-[15px] font-medium text-ink">Geri</span>
        </button>
      </div>

      <div className="flex items-center gap-[14px] px-6 pt-3">
        <Avatar name={isletme.name} size={60} />
        <div className="min-w-0">
          <h1 className="truncate text-[22px] font-bold tracking-[-0.3px] text-ink">
            {isletme.name}
          </h1>
          <div className="mt-[2px] truncate text-sm text-muted">{isletme.note || '—'}</div>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-6 pt-[22px]">
        {/* Cari hesap özeti */}
        <div className="rounded-[18px] border border-[#EDEDED] bg-white p-[18px] shadow-[0_1px_2px_rgba(0,0,0,0.03),0_4px_12px_rgba(0,0,0,0.04)]">
          <div className="mb-3 text-[11px] font-bold tracking-[0.6px] text-faint">CARİ HESAP</div>
          <div className="mb-[2px] text-[13px] text-muted">{tag.label}</div>
          <div
            className="text-[25px] font-bold tracking-[-0.5px]"
            style={{ color: bakiye === 0 ? '#111' : tag.color }}
          >
            {formatTL(Math.abs(bakiye))}
          </div>
          <div className="my-4 h-px bg-divider" />
          <div className="flex gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-[5px] text-xs text-muted">Toplam gelir</div>
              <div className="text-lg font-bold text-success">{formatTL(gelirTotal)}</div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-[5px] text-xs text-muted">Toplam gider</div>
              <div className="text-lg font-bold text-danger">{formatTL(giderTotal)}</div>
            </div>
          </div>
        </div>

        {/* Gelir Ekle / Gider Ekle */}
        <div className="flex gap-[10px]">
          {(['GELIR', 'GIDER'] as const).map((tur) => (
            <button
              key={tur}
              type="button"
              onClick={() => {
                setError('')
                setModal({ open: true, tur, tutar: '', note: '' })
              }}
              className="pressable flex flex-1 cursor-pointer items-center justify-center gap-[6px] whitespace-nowrap rounded-[13px] bg-card px-1 py-[13px]"
            >
              <PlusInkIcon />
              <span className="text-[13.5px] font-semibold text-ink">
                {tur === 'GELIR' ? 'Gelir Ekle' : 'Gider Ekle'}
              </span>
            </button>
          ))}
        </div>

        {/* Hareketler */}
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[11px] font-bold tracking-[0.6px] text-faint">HAREKETLER</div>
            <div className="flex gap-[6px]">
              <button
                type="button"
                onClick={() => setYansitilmamis((v) => !v)}
                className="cursor-pointer whitespace-nowrap rounded-[16px] px-3 py-[6px] text-xs font-semibold"
                style={{
                  background: yansitilmamis ? '#111' : '#F2F2F2',
                  color: yansitilmamis ? '#fff' : '#888',
                }}
              >
                Yansıtılmamış
              </button>
              <button
                type="button"
                onClick={() =>
                  setDateModal({ open: true, start: range?.start ?? '', end: range?.end ?? '' })
                }
                aria-label="Tarih aralığı seç"
                className="flex cursor-pointer items-center gap-[5px] whitespace-nowrap rounded-[16px] px-[10px] py-[6px] text-xs font-semibold"
                style={{
                  background: range ? '#111' : '#F2F2F2',
                  color: range ? '#fff' : '#888',
                }}
              >
                <CalendarIcon size={13} color={range ? '#fff' : '#888'} />
                {range && (
                  <span>
                    {ddmm(range.start)} – {ddmm(range.end)}
                  </span>
                )}
              </button>
            </div>
          </div>
          {yansitError && <p className="mb-2 text-center text-[13px] text-danger">{yansitError}</p>}
          {isletme.hareketler.length === 0 ? (
            <div className="rounded-[14px] bg-card p-[18px] text-center text-[13px] text-muted">
              Henüz hareket eklenmedi.
            </div>
          ) : hareketler.length === 0 && filtersActive ? (
            <div className="rounded-[14px] bg-card p-[18px] text-center text-[13px] text-muted">
              Bu filtrelerle eşleşen hareket yok.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {hareketler.map((h) => {
                const kurus = numericStringToKurus(String(h.tutar))
                return (
                  <div key={h.id} className="rounded-[14px] bg-card px-[15px] py-[13px]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-ink">
                          {h.note || (h.tur === 'GELIR' ? 'Gelir' : 'Gider')}
                        </div>
                        <div className="mt-[2px] text-xs text-muted">
                          {formatRelativeDate(h.tarih)}
                        </div>
                      </div>
                      <div
                        className="shrink-0 text-[15px] font-bold"
                        style={{ color: h.tur === 'GELIR' ? '#15803D' : '#C62828' }}
                      >
                        {h.tur === 'GELIR' ? '+' : '-'}
                        {formatTL(kurus)}
                      </div>
                    </div>
                    {h.kasa_durumu === 'YOK' && (
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => void onYansit(h.id)}
                          disabled={yansitBusyId === h.id}
                          className="cursor-pointer rounded-[9px] bg-ink px-3 py-[7px] text-xs font-semibold text-white disabled:opacity-60"
                        >
                          {yansitBusyId === h.id ? 'Gönderiliyor…' : 'Kasaya Yansıt'}
                        </button>
                      </div>
                    )}
                    {h.kasa_durumu === 'BEKLIYOR' && (
                      <div className="mt-2 flex justify-end">
                        <span className="rounded-[8px] bg-[#FFF7ED] px-3 py-[6px] text-xs font-semibold text-[#B45309]">
                          Onay bekliyor
                        </span>
                      </div>
                    )}
                    {h.kasa_durumu === 'YANSIDI' && (
                      <div className="mt-2 flex justify-end">
                        <span className="rounded-[8px] bg-success-soft px-3 py-[6px] text-xs font-semibold text-success">
                          ✓ Kasaya yansıdı
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      <div className="h-10" />

      <FormModal
        open={modal.open}
        title={modal.tur === 'GELIR' ? 'Gelir Ekle' : 'Gider Ekle'}
        error={error}
        busy={addHareket.isPending}
        confirmColor={modal.tur === 'GELIR' ? '#15803D' : '#C62828'}
        onConfirm={() => void onSaveHareket()}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
      >
        <div>
          <div className={modalFieldLabel}>TUTAR (₺)</div>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={modal.tutar}
            onChange={(e) => setModal((m) => ({ ...m, tutar: e.target.value }))}
            className={modalInputCls}
          />
        </div>
        <div>
          <div className={modalFieldLabel}>AÇIKLAMA</div>
          <input
            type="text"
            value={modal.note}
            onChange={(e) => setModal((m) => ({ ...m, note: e.target.value }))}
            className={modalInputCls}
          />
        </div>
      </FormModal>

      {/* Tarih aralığı modal */}
      <Dialog.Root
        open={dateModal.open}
        onOpenChange={(next) => {
          if (!next) setDateModal((m) => ({ ...m, open: false }))
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="modal-backdrop fixed inset-0 z-50 bg-black/45" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-64px)] max-w-[300px] -translate-x-1/2 -translate-y-1/2 outline-none">
            <div className="modal-pop rounded-[20px] bg-white px-[22px] py-6 shadow-[0_20px_50px_rgba(0,0,0,0.25)]">
              <Dialog.Title className="mb-4 text-[17px] font-bold text-ink">
                Tarih Aralığı Seç
              </Dialog.Title>
              <Dialog.Description className="sr-only">
                Hareketleri tarih aralığına göre filtreler.
              </Dialog.Description>
              <div className="mb-5 flex flex-col gap-3">
                <div>
                  <div className={modalFieldLabel}>BAŞLANGIÇ</div>
                  <input
                    type="date"
                    value={dateModal.start}
                    onChange={(e) => setDateModal((m) => ({ ...m, start: e.target.value }))}
                    className={modalInputCls}
                  />
                </div>
                <div>
                  <div className={modalFieldLabel}>BİTİŞ</div>
                  <input
                    type="date"
                    value={dateModal.end}
                    onChange={(e) => setDateModal((m) => ({ ...m, end: e.target.value }))}
                    className={modalInputCls}
                  />
                </div>
              </div>
              {range && (
                <button
                  type="button"
                  onClick={() => {
                    setRange(null)
                    setDateModal((m) => ({ ...m, open: false }))
                  }}
                  className="mb-2 w-full cursor-pointer rounded-[12px] bg-field py-3 text-sm font-semibold text-danger"
                >
                  Filtreyi Temizle
                </button>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDateModal((m) => ({ ...m, open: false }))}
                  className="flex-1 cursor-pointer rounded-[12px] bg-field py-3 text-sm font-semibold text-ink"
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (dateModal.start && dateModal.end && dateModal.start <= dateModal.end) {
                      setRange({ start: dateModal.start, end: dateModal.end })
                      setDateModal((m) => ({ ...m, open: false }))
                    }
                  }}
                  className="flex-1 cursor-pointer rounded-[12px] bg-ink py-3 text-sm font-semibold text-white"
                >
                  Onayla
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
