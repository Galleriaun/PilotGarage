import { useState } from 'react'
import { useBusiness } from '../../app/providers/BusinessProvider'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { formatRelativeDate } from '../../lib/dates'
import { formatTL, parseTLToKurus, numericStringToKurus } from '../../lib/money'
import { ChevronDownIcon } from '../kayit/icons'
import { useKategoriler, useSabitGiderler, useTekrarKurallari } from '../finans/api'
import type { Kategori, SabitGider, TekrarKural, TekrarSiklik } from '../finans/types'
import {
  useCreateSabitGider,
  useDeleteSabitGider,
  useDeleteTekrarKural,
  useStopTekrarKural,
  useUpdateSabitGider,
} from './api'
import {
  CalendarBoxIcon,
  FormModal,
  GunDropdown,
  PencilIcon,
  ScreenHeader,
  TrashIcon,
  modalFieldLabel,
  modalInputCls,
} from './shared'

interface ModalState {
  open: boolean
  gider: SabitGider | null
  name: string
  tutar: string
  gun: number | null
  kategoriId: string | null
}

const CLOSED: ModalState = {
  open: false,
  gider: null,
  name: '',
  tutar: '',
  gun: null,
  kategoriId: null,
}

const SIKLIK_LABELS: Record<TekrarSiklik, string> = {
  HAFTALIK: 'Haftalık',
  AYLIK: 'Aylık',
  YILLIK: 'Yıllık',
}

/** Soft-stop glyph — the rule is stopped, not deleted (history preserved). */
function StopIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#C62828" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <rect x="9" y="9" width="6" height="6" rx="1" fill="#C62828" stroke="none" />
    </svg>
  )
}

/** Kategori picker in the GunDropdown style (expandable button). */
function KategoriDropdown({
  kategoriler,
  value,
  onChange,
}: {
  kategoriler: Kategori[]
  value: string | null
  onChange: (id: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const label = value
    ? (kategoriler.find((k) => k.id === value)?.label ?? 'Kategori')
    : 'Kategori seç'
  const options: { id: string | null; label: string }[] = [
    { id: null, label: 'Yok' },
    ...kategoriler.map((k) => ({ id: k.id, label: k.label })),
  ]

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between rounded-[12px] bg-field px-[14px] py-[13px]"
      >
        <span
          className="text-[15px] font-medium"
          style={{ color: value === null ? '#ADADAD' : '#111' }}
        >
          {label}
        </span>
        <ChevronDownIcon size={12} color="#888" rotated={open} />
      </button>
      {open && (
        <div className="menu-in mt-[6px] max-h-[220px] overflow-y-auto rounded-[14px] bg-card p-[6px]">
          {options.map((o) => {
            const selected = value === o.id
            return (
              <button
                key={o.id ?? 'yok'}
                type="button"
                onClick={() => {
                  onChange(o.id)
                  setOpen(false)
                }}
                className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-[10px] px-3 py-[11px] text-left text-[15px] font-semibold text-ink"
                style={{ background: selected ? 'var(--seg)' : 'transparent' }}
              >
                {o.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function SabitGiderler() {
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id ?? ''
  const { data: giderler = [], isPending } = useSabitGiderler(businessId)
  const { data: kurallar = [] } = useTekrarKurallari(businessId)
  const { data: kategoriler = [] } = useKategoriler(businessId)
  const giderKategorileri = kategoriler.filter((k) => k.tur === 'GIDER')
  const createGider = useCreateSabitGider()
  const updateGider = useUpdateSabitGider()
  const deleteGider = useDeleteSabitGider()
  const stopKural = useStopTekrarKural()
  const deleteKural = useDeleteTekrarKural()

  const [modal, setModal] = useState<ModalState>(CLOSED)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState<SabitGider | null>(null)
  const [stopping, setStopping] = useState<TekrarKural | null>(null)
  const [deletingKural, setDeletingKural] = useState<TekrarKural | null>(null)

  const busy = createGider.isPending || updateGider.isPending

  // Recurring GİDER rules (Gelir/Gider Ekle "Tekrar") belong with the sabit
  // giderler; GELİR rules get their own section below.
  const giderKurallar = kurallar.filter((k) => k.tur === 'GIDER')
  const gelirKurallar = kurallar.filter((k) => k.tur === 'GELIR')

  function kuralRow(k: TekrarKural) {
    return (
      <div key={k.id} className="flex items-center gap-3 rounded-[16px] bg-card px-4 py-[14px]">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold text-ink">{k.baslik}</div>
          <div className="mt-[2px] text-[13px] text-muted">
            {SIKLIK_LABELS[k.siklik]} · Sonraki: {formatRelativeDate(k.next_run)}
          </div>
        </div>
        <div
          className="shrink-0 text-[15px] font-bold"
          style={{ color: k.tur === 'GELIR' ? '#15803D' : '#C62828' }}
        >
          {k.tur === 'GELIR' ? '+' : '-'}
          {formatTL(numericStringToKurus(String(k.tutar)))}
        </div>
        <button
          type="button"
          onClick={() => setStopping(k)}
          aria-label="Durdur"
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[9px] bg-danger-soft"
        >
          <StopIcon />
        </button>
        <button
          type="button"
          onClick={() => setDeletingKural(k)}
          aria-label="Sil"
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[9px] bg-danger-soft"
        >
          <TrashIcon size={14} />
        </button>
      </div>
    )
  }

  async function onSave() {
    setError('')
    if (!modal.name.trim()) {
      setError('Ad girin.')
      return
    }
    const kurus = parseTLToKurus(modal.tutar)
    if (kurus === null || kurus <= 0) {
      setError('Geçerli bir tutar girin.')
      return
    }
    if (modal.gun === null || modal.gun < 1 || modal.gun > 28) {
      setError('Ödeme günü seçin (1–28).')
      return
    }
    try {
      if (modal.gider) {
        await updateGider.mutateAsync({
          id: modal.gider.id,
          name: modal.name.trim(),
          kurus,
          odemeGunu: modal.gun,
          kategoriId: modal.kategoriId,
        })
      } else {
        await createGider.mutateAsync({
          businessId,
          name: modal.name.trim(),
          kurus,
          odemeGunu: modal.gun,
          kategoriId: modal.kategoriId,
        })
      }
      setModal(CLOSED)
    } catch {
      setError('Kaydedilemedi. Tekrar deneyin.')
    }
  }

  async function onDelete() {
    if (!deleting) return
    try {
      await deleteGider.mutateAsync({ id: deleting.id })
    } finally {
      setDeleting(null)
    }
  }

  async function onStop() {
    if (!stopping) return
    try {
      await stopKural.mutateAsync({ id: stopping.id })
    } finally {
      setStopping(null)
    }
  }

  async function onDeleteKural() {
    if (!deletingKural) return
    try {
      await deleteKural.mutateAsync({ id: deletingKural.id })
    } finally {
      setDeletingKural(null)
    }
  }

  return (
    <div className="screen-forward">
      <ScreenHeader
        title="Sabit Giderler"
        icon={<CalendarBoxIcon />}
        iconBg="#FFF7ED"
        backTo="/yonetim"
        onAdd={() => {
          setError('')
          setModal({ ...CLOSED, open: true })
        }}
      />

      {isPending ? (
        <div className="flex justify-center py-14">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-divider border-t-ink" />
        </div>
      ) : giderler.length === 0 && giderKurallar.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <div className="mb-[14px] flex h-[52px] w-[52px] items-center justify-center rounded-[16px] bg-field">
            <CalendarBoxIcon color="#ADADAD" size={24} />
          </div>
          <div className="mb-1 text-[15px] font-bold text-ink">Henüz sabit gider yok</div>
          <div className="text-[13px] text-muted">
            Sağ üstteki &quot;Ekle&quot; ile ilk sabit gideri ekleyin.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-[10px] px-6">
          {giderler.map((sg) => (
            <div key={sg.id} className="flex items-center gap-3 rounded-[16px] bg-card px-4 py-[14px]">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-bold text-ink">{sg.name}</div>
                <div className="mt-[2px] truncate text-[13px] text-muted">
                  Her ayın {sg.odeme_gunu}. günü
                  {sg.kategori_id &&
                    ` · ${kategoriler.find((k) => k.id === sg.kategori_id)?.label ?? ''}`}
                </div>
              </div>
              <div className="shrink-0 text-[15px] font-bold text-ink">
                {formatTL(numericStringToKurus(String(sg.tutar)))}
              </div>
              <button
                type="button"
                onClick={() => {
                  setError('')
                  setModal({
                    open: true,
                    gider: sg,
                    name: sg.name,
                    tutar: String(numericStringToKurus(String(sg.tutar)) / 100),
                    gun: sg.odeme_gunu,
                    kategoriId: sg.kategori_id,
                  })
                }}
                aria-label="Düzenle"
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[9px] bg-avatar"
              >
                <PencilIcon size={14} />
              </button>
              <button
                type="button"
                onClick={() => setDeleting(sg)}
                aria-label="Sil"
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[9px] bg-danger-soft"
              >
                <TrashIcon size={14} />
              </button>
            </div>
          ))}
          {giderKurallar.map(kuralRow)}
        </div>
      )}

      {gelirKurallar.length > 0 && (
        <>
          <div className="px-6 pb-3 pt-8 text-[13px] font-bold uppercase tracking-[0.6px] text-faint">
            Tekrarlanan Gelirler
          </div>
          <div className="flex flex-col gap-[10px] px-6">{gelirKurallar.map(kuralRow)}</div>
        </>
      )}
      <div className="h-10" />

      <FormModal
        open={modal.open}
        title={modal.gider ? 'Sabit gideri düzenle' : 'Yeni sabit gider'}
        error={error}
        busy={busy}
        onConfirm={() => void onSave()}
        onClose={() => setModal(CLOSED)}
      >
        <div>
          <div className={modalFieldLabel}>AD</div>
          <input
            type="text"
            placeholder="Örn. Kira"
            value={modal.name}
            onChange={(e) => setModal((m) => ({ ...m, name: e.target.value }))}
            className={modalInputCls}
          />
        </div>
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
          <div className={modalFieldLabel}>ÖDEME GÜNÜ (1-28)</div>
          <GunDropdown value={modal.gun} onChange={(gun) => setModal((m) => ({ ...m, gun }))} />
        </div>
        {giderKategorileri.length > 0 && (
          <div>
            <div className={modalFieldLabel}>KATEGORİ</div>
            <KategoriDropdown
              kategoriler={giderKategorileri}
              value={modal.kategoriId}
              onChange={(kategoriId) => setModal((m) => ({ ...m, kategoriId }))}
            />
          </div>
        )}
      </FormModal>

      <ConfirmDialog
        open={deleting !== null}
        title={`"${deleting?.name ?? ''}" sabit giderini sil?`}
        message="Bu işlem geri alınamaz. Bekleyen/onaylanmış işlemler etkilenmez."
        confirmLabel="Sil"
        danger
        busy={deleteGider.isPending}
        onConfirm={() => void onDelete()}
        onCancel={() => setDeleting(null)}
      />

      <ConfirmDialog
        open={stopping !== null}
        title={`"${stopping?.baslik ?? ''}" tekrarını durdur?`}
        message="Yeni dönem işlemi oluşturulmaz. Bekleyen ve onaylanmış işlemler etkilenmez."
        confirmLabel="Durdur"
        danger
        busy={stopKural.isPending}
        onConfirm={() => void onStop()}
        onCancel={() => setStopping(null)}
      />

      <ConfirmDialog
        open={deletingKural !== null}
        title={`"${deletingKural?.baslik ?? ''}" tekrarını sil?`}
        message="Bu işlem geri alınamaz. Bekleyen ve onaylanmış işlemler etkilenmez."
        confirmLabel="Sil"
        danger
        busy={deleteKural.isPending}
        onConfirm={() => void onDeleteKural()}
        onCancel={() => setDeletingKural(null)}
      />
    </div>
  )
}
