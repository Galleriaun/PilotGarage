import { useState } from 'react'
import { useBusiness } from '../../app/providers/BusinessProvider'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { useKategoriler } from '../finans/api'
import type { IslemTur, Kategori } from '../finans/types'
import {
  useAddKategori,
  useDeactivateKategori,
  useUpdateBusinessName,
} from './api'
import { GearSmIcon, ScreenHeader } from './shared'

function KategoriSection({
  title,
  tur,
  businessId,
  kategoriler,
  onRequestDelete,
}: {
  title: string
  tur: IslemTur
  businessId: string
  kategoriler: Kategori[]
  onRequestDelete: (k: Kategori) => void
}) {
  const addKategori = useAddKategori()
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  async function onAdd() {
    const label = value.trim()
    setError('')
    if (!label) return
    if (kategoriler.some((k) => k.label.toLocaleLowerCase('tr-TR') === label.toLocaleLowerCase('tr-TR'))) {
      setError('Bu kategori zaten var.')
      return
    }
    try {
      await addKategori.mutateAsync({ businessId, tur, label })
      setValue('')
    } catch {
      setError('Eklenemedi. Tekrar deneyin.')
    }
  }

  return (
    <div>
      <div className="mb-2 text-[11px] font-bold tracking-[0.6px] text-[#666]">{title}</div>
      <div className="mb-2 flex flex-col gap-[6px]">
        {kategoriler.map((k) => (
          <div
            key={k.id}
            className="flex items-center justify-between gap-3 rounded-[12px] bg-card px-3 py-[11px]"
          >
            <span className="min-w-0 truncate text-sm font-semibold text-ink">{k.label}</span>
            <button
              type="button"
              onClick={() => onRequestDelete(k)}
              aria-label={`${k.label} kategorisini sil`}
              className="flex h-[26px] w-[26px] shrink-0 cursor-pointer items-center justify-center rounded-[8px] bg-danger-soft"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#C62828" strokeWidth="2.4" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ))}
        {kategoriler.length === 0 && (
          <div className="rounded-[12px] bg-card px-3 py-[11px] text-[13px] text-muted">
            Henüz kategori yok.
          </div>
        )}
      </div>
      {error && <p className="mb-2 text-[13px] text-danger">{error}</p>}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Yeni kategori adı"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void onAdd()
          }}
          className="min-w-0 flex-1 rounded-[12px] border-none bg-field px-[14px] py-[11px] text-sm text-ink outline-none placeholder:text-faint"
        />
        <button
          type="button"
          onClick={() => void onAdd()}
          disabled={addKategori.isPending}
          className="flex shrink-0 cursor-pointer items-center rounded-[12px] bg-ink px-4 py-[11px] disabled:opacity-60"
        >
          <span className="text-[13.5px] font-semibold text-white">Ekle</span>
        </button>
      </div>
    </div>
  )
}

export default function IsletmeAyarlari() {
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id ?? ''
  const { data: kategoriler = [] } = useKategoriler(businessId)
  const updateName = useUpdateBusinessName()
  const deactivateKategori = useDeactivateKategori()

  const [name, setName] = useState(activeBusiness?.name ?? '')
  const [nameSaved, setNameSaved] = useState(false)
  const [nameError, setNameError] = useState('')
  const [deleting, setDeleting] = useState<Kategori | null>(null)

  const nameDirty = name.trim() !== '' && name.trim() !== (activeBusiness?.name ?? '')

  async function onSaveName() {
    setNameError('')
    if (!name.trim()) {
      setNameError('İşletme adı boş olamaz.')
      return
    }
    try {
      await updateName.mutateAsync({ businessId, name: name.trim() })
      setNameSaved(true)
      setTimeout(() => setNameSaved(false), 2000)
    } catch {
      setNameError('Kaydedilemedi. Tekrar deneyin.')
    }
  }

  async function onDeleteKategori() {
    if (!deleting) return
    try {
      await deactivateKategori.mutateAsync({ id: deleting.id })
    } finally {
      setDeleting(null)
    }
  }

  const gelir = kategoriler.filter((k) => k.tur === 'GELIR')
  const gider = kategoriler.filter((k) => k.tur === 'GIDER')

  return (
    <div className="screen-forward">
      <ScreenHeader title="İşletme Ayarları" icon={<GearSmIcon />} iconBg="#F2F2F2" backTo="/yonetim" />

      <div className="flex flex-col gap-4 px-6">
        {/* İşletme adı */}
        <div>
          <div className="mb-[6px] text-[11px] font-bold uppercase tracking-[0.6px] text-faint">
            İŞLETME ADI
          </div>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setNameSaved(false)
            }}
            className="w-full rounded-[12px] border-none bg-field px-[14px] py-[13px] text-[15px] text-ink outline-none"
          />
          {nameError && <p className="mt-2 text-[13px] text-danger">{nameError}</p>}
          {(nameDirty || nameSaved) && (
            <button
              type="button"
              onClick={() => void onSaveName()}
              disabled={!nameDirty || updateName.isPending}
              className="mt-2 w-full cursor-pointer rounded-[12px] bg-ink py-[11px] text-sm font-semibold text-white disabled:opacity-60"
            >
              {updateName.isPending ? 'Kaydediliyor…' : nameSaved && !nameDirty ? 'Kaydedildi ✓' : 'İsmi Kaydet'}
            </button>
          )}
        </div>

        <KategoriSection
          title="GELİR KATEGORİLERİ"
          tur="GELIR"
          businessId={businessId}
          kategoriler={gelir}
          onRequestDelete={setDeleting}
        />

        <KategoriSection
          title="GİDER KATEGORİLERİ"
          tur="GIDER"
          businessId={businessId}
          kategoriler={gider}
          onRequestDelete={setDeleting}
        />
      </div>
      <div className="h-10" />

      <ConfirmDialog
        open={deleting !== null}
        title={`"${deleting?.label ?? ''}" kategorisini sil?`}
        message="Bu işlem geri alınamaz. Geçmiş işlemler etkilenmez."
        confirmLabel="Sil"
        danger
        busy={deactivateKategori.isPending}
        onConfirm={() => void onDeleteKategori()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
