import { useState } from 'react'
import { useBusiness } from '../../app/providers/BusinessProvider'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import SettingsCard, {
  cardInputCls,
  cardRowCls,
  fieldLabelCls,
  LoadError,
} from '../../components/ui/SettingsCard'
import { formatTL, kurusToInput, numericStringToKurus, parseTLToKurus } from '../../lib/money'
import { useKategoriler } from '../finans/api'
import type { IslemTur, Kategori } from '../finans/types'
import {
  useAddKategori,
  useAddPrimPaket,
  useDeactivateKategori,
  useDeletePrimPaket,
  usePrimPaketleri,
  useUpdateBusinessName,
  useUpdatePrimPaket,
} from './api'
import type { PrimPaket } from './types'
import { FormModal, GearSmIcon, modalFieldLabel, modalInputCls, PencilIcon, ScreenHeader } from './shared'
import MesaiKonumSection from '../mesai/MesaiKonumSection'

/** Satır içi sil butonu — prim paketleri ve kategoriler aynı ikonu kullanıyor. */
function TrashSmall({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-[26px] w-[26px] shrink-0 cursor-pointer items-center justify-center rounded-[8px] bg-danger-soft"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#C62828" strokeWidth="2.4" strokeLinecap="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  )
}

/** Prim paketleri (050): ad + tutar; Prim Ver seçicisini besler. Yönetici-only. */
function PrimPaketSection({ businessId }: { businessId: string }) {
  const { data: paketler = [], error: loadError } = usePrimPaketleri(businessId)
  const addPaket = useAddPrimPaket()
  const updatePaket = useUpdatePrimPaket()
  const deletePaket = useDeletePrimPaket()

  const empty = { open: false, id: null as string | null, name: '', tutar: '' }
  const [modal, setModal] = useState(empty)
  const [deleting, setDeleting] = useState<PrimPaket | null>(null)
  const [error, setError] = useState('')

  function openAdd() {
    setError('')
    setModal({ open: true, id: null, name: '', tutar: '' })
  }
  function openEdit(p: PrimPaket) {
    setError('')
    setModal({ open: true, id: p.id, name: p.name, tutar: kurusToInput(numericStringToKurus(String(p.tutar))) })
  }

  async function onSave() {
    setError('')
    const name = modal.name.trim()
    if (!name) {
      setError('Paket adı girin.')
      return
    }
    const kurus = parseTLToKurus(modal.tutar)
    if (kurus === null || kurus <= 0) {
      setError('Geçerli bir tutar girin.')
      return
    }
    try {
      if (modal.id) await updatePaket.mutateAsync({ id: modal.id, name, tutarKurus: kurus })
      else await addPaket.mutateAsync({ businessId, name, tutarKurus: kurus })
      setModal(empty)
    } catch {
      setError('Kaydedilemedi. Tekrar deneyin.')
    }
  }

  async function onDelete() {
    if (!deleting) return
    try {
      await deletePaket.mutateAsync({ id: deleting.id })
    } finally {
      setDeleting(null)
    }
  }

  return (
    <SettingsCard
      title="Prim Paketleri"
      summary={loadError ? 'Yüklenemedi' : paketler.length > 0 ? `${paketler.length} paket` : 'Yok'}
    >
      {/* Hata, boş-durum metniyle KARIŞTIRILMAMALI: "Henüz prim paketi yok"
          yükleme hatasında da yazardı ve silinmiş veri gibi görünürdü. */}
      {loadError && (
        <div className="mb-2">
          <LoadError error={loadError} what="Prim paketleri" />
        </div>
      )}
      <div className="mb-2 flex flex-col gap-[6px]">
        {paketler.map((p) => (
          <div key={p.id} className={cardRowCls}>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{p.name}</span>
            <span className="shrink-0 text-sm font-bold text-ink">
              {formatTL(numericStringToKurus(String(p.tutar)))}
            </span>
            <button
              type="button"
              onClick={() => openEdit(p)}
              aria-label={`${p.name} paketini düzenle`}
              className="flex h-[26px] w-[26px] shrink-0 cursor-pointer items-center justify-center rounded-[8px] bg-card"
            >
              <PencilIcon size={13} />
            </button>
            <TrashSmall label={`${p.name} paketini sil`} onClick={() => setDeleting(p)} />
          </div>
        ))}
        {paketler.length === 0 && !loadError && (
          <div className="rounded-[12px] bg-field px-3 py-[11px] text-[13px] text-muted">
            Henüz prim paketi yok.
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={openAdd}
        className="w-full cursor-pointer rounded-[12px] bg-ink py-[11px] text-[13.5px] font-semibold text-white"
      >
        + Prim paketi ekle
      </button>

      <FormModal
        open={modal.open}
        title={modal.id ? 'Prim Paketini Düzenle' : 'Prim Paketi Ekle'}
        error={error}
        busy={addPaket.isPending || updatePaket.isPending}
        onConfirm={() => void onSave()}
        onClose={() => setModal(empty)}
      >
        <div>
          <div className={modalFieldLabel}>PAKET ADI</div>
          <input
            type="text"
            placeholder="Örn. Bayram Primi"
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
      </FormModal>

      <ConfirmDialog
        open={deleting !== null}
        title={`"${deleting?.name ?? ''}" paketini sil?`}
        message="Bu işlem geri alınamaz. Geçmiş prim işlemleri etkilenmez."
        confirmLabel="Sil"
        danger
        busy={deletePaket.isPending}
        onConfirm={() => void onDelete()}
        onCancel={() => setDeleting(null)}
      />
    </SettingsCard>
  )
}

/**
 * Tek kart, içinde Gelir/Gider geçişi (İstekler ekranındaki segment deseni).
 * Eskiden iki ayrı bölümdü; ikisi de uzun listeler olduğu için sayfa iki
 * katına çıkıyordu.
 */
function KategorilerSection({
  businessId,
  kategoriler,
  loadError,
  onRequestDelete,
}: {
  businessId: string
  kategoriler: Kategori[]
  loadError: unknown
  onRequestDelete: (k: Kategori) => void
}) {
  const addKategori = useAddKategori()
  const [tur, setTur] = useState<IslemTur>('GELIR')
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  const gelir = kategoriler.filter((k) => k.tur === 'GELIR')
  const gider = kategoriler.filter((k) => k.tur === 'GIDER')
  const shown = tur === 'GELIR' ? gelir : gider

  function switchTur(next: IslemTur) {
    if (next === tur) return
    setTur(next)
    // Gelir için yazılmış bir ad, sekme değişince sessizce Gider'e eklenmesin.
    setValue('')
    setError('')
  }

  async function onAdd() {
    const label = value.trim()
    setError('')
    if (!label) return
    if (shown.some((k) => k.label.toLocaleLowerCase('tr-TR') === label.toLocaleLowerCase('tr-TR'))) {
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
    <SettingsCard
      title="Kategoriler"
      summary={
        loadError != null ? 'Yüklenemedi' : `${gelir.length} gelir · ${gider.length} gider`
      }
    >
      {/* `loadError != null` BOOLEAN olmalı: prop tipi `unknown` olduğu için
          düz `loadError && …` false dalında `unknown` döndürür ve React onu
          render edemez (TS2322). */}
      {loadError != null && (
        <div className="mb-3">
          <LoadError error={loadError} what="Kategoriler" />
        </div>
      )}
      <div className="mb-3 flex gap-2">
        {(['GELIR', 'GIDER'] as IslemTur[]).map((t) => {
          const selected = tur === t
          return (
            <button
              key={t}
              type="button"
              onClick={() => switchTur(t)}
              className="flex-1 cursor-pointer rounded-[12px] py-[9px] text-center text-[13px] font-semibold"
              style={{
                background: selected ? 'var(--seg-on)' : 'var(--seg)',
                color: selected ? 'var(--seg-fg-on)' : 'var(--seg-fg)',
              }}
            >
              {t === 'GELIR' ? `Gelir (${gelir.length})` : `Gider (${gider.length})`}
            </button>
          )
        })}
      </div>

      <div className="mb-2 flex flex-col gap-[6px]">
        {shown.map((k) => (
          <div key={k.id} className={cardRowCls}>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{k.label}</span>
            <TrashSmall
              label={`${k.label} kategorisini sil`}
              onClick={() => onRequestDelete(k)}
            />
          </div>
        ))}
        {shown.length === 0 && loadError == null && (
          <div className="rounded-[12px] bg-field px-3 py-[11px] text-[13px] text-muted">
            Henüz kategori yok.
          </div>
        )}
      </div>

      {error && <p className="mb-2 text-[13px] text-danger">{error}</p>}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder={tur === 'GELIR' ? 'Yeni gelir kategorisi' : 'Yeni gider kategorisi'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void onAdd()
          }}
          className={`min-w-0 flex-1 ${cardInputCls}`}
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
    </SettingsCard>
  )
}

export default function IsletmeAyarlari() {
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id ?? ''
  const { data: kategoriler = [], error: kategoriError } = useKategoriler(businessId)
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

  return (
    <div className="screen-forward">
      {/* Masaüstünde ScreenHeader DA sarmalayıcının içinde: kendi px-6'sını sabit
          taşıyor, yalnızca gövde ortalansaydı başlık solda kalırdı. */}
      <div className="mx-auto w-full md:max-w-[760px]">
        <ScreenHeader title="İşletme Ayarları" icon={<GearSmIcon />} iconBg="#F2F2F2" backTo="/yonetim" />

        <div className="flex flex-col gap-3 px-6">
          <SettingsCard title="İşletme" collapsible={false}>
            <div className={fieldLabelCls}>İŞLETME ADI</div>
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
                className="mt-3 w-full cursor-pointer rounded-[12px] bg-ink py-[11px] text-sm font-semibold text-white disabled:opacity-60"
              >
                {updateName.isPending ? 'Kaydediliyor…' : nameSaved && !nameDirty ? 'Kaydedildi ✓' : 'İsmi Kaydet'}
              </button>
            )}
          </SettingsCard>

          <KategorilerSection
            businessId={businessId}
            kategoriler={kategoriler}
            loadError={kategoriError}
            onRequestDelete={setDeleting}
          />

          {/* Prim paketleri (050) */}
          <PrimPaketSection businessId={businessId} />

          <MesaiKonumSection businessId={businessId} />
        </div>
        <div className="h-10" />
      </div>

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
