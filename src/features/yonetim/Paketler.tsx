import { useState } from 'react'
import { useBusiness } from '../../app/providers/BusinessProvider'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { formatTL, parseTLToKurus, numericStringToKurus } from '../../lib/money'
import { usePaketler } from '../kayit/api'
import type { Paket } from '../kayit/types'
import { useCreatePaket, useDeactivatePaket, useUpdatePaket } from './api'
import {
  FormModal,
  PencilIcon,
  ScreenHeader,
  TagIcon,
  TrashIcon,
  modalFieldLabel,
  modalInputCls,
} from './shared'

interface ModalState {
  open: boolean
  paket: Paket | null
  name: string
  price: string
}

const CLOSED: ModalState = { open: false, paket: null, name: '', price: '' }

export default function Paketler() {
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id ?? ''
  const { data: paketler = [], isPending } = usePaketler(businessId)
  const createPaket = useCreatePaket()
  const updatePaket = useUpdatePaket()
  const deactivatePaket = useDeactivatePaket()

  const [modal, setModal] = useState<ModalState>(CLOSED)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState<Paket | null>(null)

  const busy = createPaket.isPending || updatePaket.isPending

  async function onSave() {
    setError('')
    if (!modal.name.trim()) {
      setError('Paket adı girin.')
      return
    }
    const kurus = parseTLToKurus(modal.price)
    if (kurus === null || kurus <= 0) {
      setError('Geçerli bir fiyat girin.')
      return
    }
    try {
      if (modal.paket) {
        await updatePaket.mutateAsync({ id: modal.paket.id, name: modal.name.trim(), priceKurus: kurus })
      } else {
        await createPaket.mutateAsync({ businessId, name: modal.name.trim(), priceKurus: kurus })
      }
      setModal(CLOSED)
    } catch {
      setError('Kaydedilemedi. Tekrar deneyin.')
    }
  }

  async function onDelete() {
    if (!deleting) return
    try {
      await deactivatePaket.mutateAsync({ id: deleting.id })
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="screen-forward">
      <ScreenHeader
        title="Paketler"
        icon={<TagIcon color="#E30613" />}
        iconBg="#FEF3F2"
        onAdd={() => {
          setError('')
          setModal({ open: true, paket: null, name: '', price: '' })
        }}
      />

      {isPending ? (
        <div className="flex justify-center py-14">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-divider border-t-ink" />
        </div>
      ) : paketler.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <div className="mb-[14px] flex h-[52px] w-[52px] items-center justify-center rounded-[16px] bg-field">
            <TagIcon color="#ADADAD" size={24} />
          </div>
          <div className="mb-1 text-[15px] font-bold text-ink">Henüz paket yok</div>
          <div className="text-[13px] text-muted">Sağ üstteki &quot;Ekle&quot; ile ilk paketi oluşturun.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-[10px] px-6">
          {paketler.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-[16px] bg-card p-4">
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold text-ink">{p.name}</div>
                <div className="mt-[2px] text-[13px] text-muted">
                  {formatTL(numericStringToKurus(String(p.price)))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setError('')
                  setModal({
                    open: true,
                    paket: p,
                    name: p.name,
                    price: String(numericStringToKurus(String(p.price)) / 100),
                  })
                }}
                aria-label="Düzenle"
                className="flex h-[34px] w-[34px] shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-avatar"
              >
                <PencilIcon />
              </button>
              <button
                type="button"
                onClick={() => setDeleting(p)}
                aria-label="Sil"
                className="flex h-[34px] w-[34px] shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-danger-soft"
              >
                <TrashIcon />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="h-10" />

      <FormModal
        open={modal.open}
        title={modal.paket ? 'Paketi düzenle' : 'Yeni paket'}
        error={error}
        busy={busy}
        onConfirm={() => void onSave()}
        onClose={() => setModal(CLOSED)}
      >
        <div>
          <div className={modalFieldLabel}>PAKET ADI</div>
          <input
            type="text"
            value={modal.name}
            onChange={(e) => setModal((m) => ({ ...m, name: e.target.value }))}
            className={modalInputCls}
          />
        </div>
        <div>
          <div className={modalFieldLabel}>FİYAT (₺)</div>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={modal.price}
            onChange={(e) => setModal((m) => ({ ...m, price: e.target.value }))}
            className={modalInputCls}
          />
        </div>
      </FormModal>

      <ConfirmDialog
        open={deleting !== null}
        title={`"${deleting?.name ?? ''}" paketini sil?`}
        message="Bu işlem geri alınamaz. Geçmiş kayıtlar etkilenmez."
        confirmLabel="Sil"
        danger
        busy={deactivatePaket.isPending}
        onConfirm={() => void onDelete()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
