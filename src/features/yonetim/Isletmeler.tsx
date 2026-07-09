import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useBusiness } from '../../app/providers/BusinessProvider'
import { formatTL, numericStringToKurus } from '../../lib/money'
import { useCariIsletmeler, useCreateCari, useUpdateCari } from './api'
import type { CariIsletme } from './types'
import {
  Avatar,
  BuildingIcon,
  FormModal,
  PencilIcon,
  ScreenHeader,
  modalFieldLabel,
  modalInputCls,
} from './shared'

export function cariBakiyeKurus(ci: CariIsletme): number {
  let total = 0
  for (const h of ci.hareketler) {
    const kurus = numericStringToKurus(String(h.tutar))
    total += h.tur === 'GELIR' ? kurus : -kurus
  }
  return total
}

export function bakiyeTag(bakiye: number): { label: string; color: string } {
  if (bakiye > 0) return { label: 'Alacağınız', color: '#15803D' }
  if (bakiye < 0) return { label: 'Borcunuz', color: '#C62828' }
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
  isletme: CariIsletme | null
  name: string
  note: string
}

const CLOSED: ModalState = { open: false, isletme: null, name: '', note: '' }

export default function Isletmeler() {
  const navigate = useNavigate()
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id ?? ''
  const { data: isletmeler = [], isPending } = useCariIsletmeler(businessId)
  const createCari = useCreateCari()
  const updateCari = useUpdateCari()

  const [modal, setModal] = useState<ModalState>(CLOSED)
  const [error, setError] = useState('')
  const busy = createCari.isPending || updateCari.isPending

  async function onSave() {
    setError('')
    if (!modal.name.trim()) {
      setError('İşletme adı girin.')
      return
    }
    try {
      if (modal.isletme) {
        await updateCari.mutateAsync({
          id: modal.isletme.id,
          name: modal.name.trim(),
          note: modal.note.trim(),
        })
      } else {
        await createCari.mutateAsync({
          businessId,
          name: modal.name.trim(),
          note: modal.note.trim(),
        })
      }
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
          setModal({ open: true, isletme: null, name: '', note: '' })
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
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="İşletmeyi düzenle"
                  onClick={(e) => {
                    e.stopPropagation()
                    setError('')
                    setModal({ open: true, isletme: ci, name: ci.name, note: ci.note })
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation()
                      setError('')
                      setModal({ open: true, isletme: ci, name: ci.name, note: ci.note })
                    }
                  }}
                  className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[9px] bg-avatar"
                >
                  <PencilIcon size={14} />
                </span>
                <ChevronRightSm />
              </button>
            )
          })}
        </div>
      )}
      <div className="h-10" />

      <FormModal
        open={modal.open}
        title={modal.isletme ? 'İşletmeyi düzenle' : 'Yeni işletme'}
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
      </FormModal>
    </div>
  )
}
