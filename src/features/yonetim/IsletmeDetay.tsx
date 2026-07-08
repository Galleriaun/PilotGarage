import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { formatTL, numericStringToKurus, parseTLToKurus } from '../../lib/money'
import { formatRelativeDate } from '../../lib/dates'
import { BackChevron } from '../auth/EyeIcon'
import type { IslemTur } from '../finans/types'
import { useAddHareket, useCariIsletme, useYansitHareket } from './api'
import { bakiyeTag, cariBakiyeKurus } from './Isletmeler'
import { Avatar, FormModal, modalFieldLabel, modalInputCls } from './shared'

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
          <div className="mb-2 text-[11px] font-bold tracking-[0.6px] text-faint">HAREKETLER</div>
          {yansitError && <p className="mb-2 text-center text-[13px] text-danger">{yansitError}</p>}
          {isletme.hareketler.length === 0 ? (
            <div className="rounded-[14px] bg-card p-[18px] text-center text-[13px] text-muted">
              Henüz hareket eklenmedi.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {isletme.hareketler.map((h) => {
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
                      <button
                        type="button"
                        onClick={() => void onYansit(h.id)}
                        disabled={yansitBusyId === h.id}
                        className="mt-[10px] w-full cursor-pointer rounded-[10px] bg-ink py-[9px] text-center disabled:opacity-60"
                      >
                        <span className="text-[12.5px] font-semibold text-white">
                          {yansitBusyId === h.id ? 'Gönderiliyor…' : 'Kasaya Yansıt'}
                        </span>
                      </button>
                    )}
                    {h.kasa_durumu === 'BEKLIYOR' && (
                      <div className="mt-[10px] rounded-[10px] bg-[#FFF7ED] py-2 text-center">
                        <span className="text-xs font-semibold text-[#B45309]">Onay bekliyor</span>
                      </div>
                    )}
                    {h.kasa_durumu === 'YANSIDI' && (
                      <div className="mt-[10px] rounded-[10px] bg-success-soft py-2 text-center">
                        <span className="text-xs font-semibold text-success">✓ Kasaya yansıdı</span>
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
    </div>
  )
}
