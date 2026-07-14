import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useBusiness } from '../../app/providers/BusinessProvider'
import { formatTL, numericStringToKurus } from '../../lib/money'
import { isTelGenelComplete, normalizeTelGenel } from '../kayit/telefon'
import { useCariIsletmeler, useCreateCari } from './api'
import type { CariIsletme } from './types'
import {
  Avatar,
  BuildingIcon,
  FormModal,
  ScreenHeader,
  modalFieldLabel,
  modalInputCls,
} from './shared'

/**
 * Toplanmamış alacak (032 borç/ödeme modeli): Σ borç (GELIR) − Σ toplanan
 * (kasa_durumu ≠ YOK — hem toplanan borçlar hem ödeme hareketleri).
 * Reddedilen tahsilat YOK'a döner ve borç bakiyeye geri gelir.
 */
export function cariBakiyeKurus(ci: CariIsletme): number {
  let total = 0
  for (const h of ci.hareketler) {
    const kurus = numericStringToKurus(String(h.tutar))
    if (h.tur === 'GELIR') total += kurus
    if (h.kasa_durumu !== 'YOK') total -= kurus
  }
  return total
}

export function bakiyeTag(bakiye: number): { label: string; color: string } {
  if (bakiye > 0) return { label: 'Alacağınız', color: '#15803D' }
  if (bakiye < 0) return { label: 'Fazla tahsilat', color: '#B45309' }
  return { label: 'Hesap kapalı', color: '#888888' }
}

function ChevronRightSm() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#ADADAD"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

interface ModalState {
  open: boolean
  name: string
  note: string
  telefon: string // ulusal 10 hane; +90 sabit (036)
}

const CLOSED: ModalState = { open: false, name: '', note: '', telefon: '' }

export default function Isletmeler() {
  const navigate = useNavigate()
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id ?? ''
  const { data: isletmeler = [], isPending } = useCariIsletmeler(businessId)
  const createCari = useCreateCari()

  const [modal, setModal] = useState<ModalState>(CLOSED)
  const [error, setError] = useState('')
  const busy = createCari.isPending

  async function onSave() {
    setError('')
    if (!modal.name.trim()) {
      setError('İşletme adı girin.')
      return
    }
    if (modal.telefon && !isTelGenelComplete(modal.telefon)) {
      setError('Telefon numarası eksik — 10 hane girin.')
      return
    }
    try {
      await createCari.mutateAsync({
        businessId,
        name: modal.name.trim(),
        note: modal.note.trim(),
        telefon: modal.telefon,
      })
      setModal(CLOSED)
    } catch {
      setError('Kaydedilemedi. Tekrar deneyin.')
    }
  }

  return (
    <div className="screen-forward">
      <ScreenHeader
        title="İşletmeler"
        icon={<BuildingIcon />}
        iconBg="#EEF4FF"
        backTo="/yonetim"
        onAdd={() => {
          setError('')
          setModal({ open: true, name: '', note: '', telefon: '' })
        }}
      />

      {isPending ? (
        <div className="flex justify-center py-14">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-divider border-t-ink" />
        </div>
      ) : isletmeler.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <div className="mb-[14px] flex h-[52px] w-[52px] items-center justify-center rounded-[16px] bg-field">
            <BuildingIcon color="#ADADAD" size={24} />
          </div>
          <div className="mb-1 text-[15px] font-bold text-ink">Henüz işletme yok</div>
          <div className="text-[13px] text-muted">
            Sağ üstteki &quot;Ekle&quot; ile ilk işletmeyi ekleyin.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-[10px] px-6">
          {isletmeler.map((ci) => {
            const bakiye = cariBakiyeKurus(ci)
            const tag = bakiyeTag(bakiye)
            return (
              <button
                key={ci.id}
                type="button"
                onClick={() => void navigate(`/yonetim/isletmeler/${ci.id}`)}
                className="pressable flex w-full cursor-pointer items-center gap-3 rounded-[16px] bg-card px-4 py-[14px] text-left"
              >
                <Avatar name={ci.name} rounded="square" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-bold text-ink">{ci.name}</div>
                  <div className="mt-[2px] truncate text-[13px] text-muted">{ci.note || '—'}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-bold" style={{ color: tag.color }}>
                    {formatTL(Math.abs(bakiye))}
                  </div>
                  <div className="mt-[2px] text-[11.5px] text-muted">{tag.label}</div>
                </div>
                <ChevronRightSm />
              </button>
            )
          })}
        </div>
      )}
      <div className="h-10" />

      <FormModal
        open={modal.open}
        title="Yeni işletme"
        error={error}
        busy={busy}
        onConfirm={() => void onSave()}
        onClose={() => setModal(CLOSED)}
      >
        <div>
          <div className={modalFieldLabel}>İŞLETME ADI</div>
          <input
            type="text"
            placeholder="Örn. Aktif Lastik Ltd."
            value={modal.name}
            onChange={(e) => setModal((m) => ({ ...m, name: e.target.value }))}
            className={modalInputCls}
          />
        </div>
        <div>
          <div className={modalFieldLabel}>NOT</div>
          <input
            type="text"
            placeholder="Örn. Lastik ve parça tedarikçisi"
            value={modal.note}
            onChange={(e) => setModal((m) => ({ ...m, note: e.target.value }))}
            className={modalInputCls}
          />
        </div>
        <div>
          <div className={modalFieldLabel}>TELEFON</div>
          <div className="flex items-center rounded-[12px] bg-field px-[14px] py-[13px]">
            <span className="shrink-0 text-[15px] font-semibold text-muted">+90</span>
            <input
              type="tel"
              inputMode="numeric"
              placeholder="___ ___ __ __"
              value={modal.telefon}
              onChange={(e) =>
                setModal((m) => ({ ...m, telefon: normalizeTelGenel(e.target.value) }))
              }
              maxLength={10}
              className="w-full min-w-0 border-none bg-transparent pl-2 text-[15px] text-ink outline-none placeholder:text-faint"
            />
          </div>
        </div>
      </FormModal>
    </div>
  )
}
