import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAuth } from '../../app/providers/AuthProvider'
import { useBusiness } from '../../app/providers/BusinessProvider'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { formatDateDots, istanbulTodayISO } from '../../lib/dates'
import { rpcErrorText } from '../../lib/errors'
import { BackChevron } from '../auth/EyeIcon'
import { useAddIzin, useAktifIzinProfilleri, useDeleteIzin, useIzinler, useMember } from './api'
import { ROLE_LABELS, type Izin } from './types'
import { Avatar, FormModal, TrashIcon, modalFieldLabel, modalInputCls } from './shared'

/** Uçlar dâhil gün sayısı — date stringleri UTC olarak ayrıştırılır (saat
 *  dilimi kaymasın; Istanbul günü zaten date kolonunda sabit). */
function gunSayisi(izin: Izin): number {
  const start = Date.parse(`${izin.baslangic}T00:00:00Z`)
  const end = Date.parse(`${izin.bitis}T00:00:00Z`)
  return Math.round((end - start) / 86_400_000) + 1
}

function IzinRow({
  izin,
  tone,
  onDelete,
}: {
  izin: Izin
  tone: 'aktif' | 'gelecek' | 'gecmis'
  onDelete?: () => void
}) {
  const gun = gunSayisi(izin)
  return (
    <div className="flex items-center gap-3 rounded-[16px] bg-card px-4 py-[14px]">
      <span
        className="h-[8px] w-[8px] shrink-0 rounded-full"
        style={{
          background:
            tone === 'aktif'
              ? 'var(--color-warn)'
              : tone === 'gelecek'
                ? 'var(--color-success)'
                : 'var(--color-faint)',
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-ink">
          {formatDateDots(izin.baslangic)} — {formatDateDots(izin.bitis)}
        </div>
        <div className="mt-[2px] text-xs text-muted">
          {gun} gün{tone === 'aktif' ? ' • Şu anda izinde' : ''}
        </div>
      </div>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="İzni sil"
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[9px] bg-danger-soft"
        >
          <TrashIcon size={14} />
        </button>
      )}
    </div>
  )
}

export default function PersonelIzinler() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { profile: me } = useAuth()
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id ?? ''

  const { data: member } = useMember(id, businessId)
  const { data: izinler = [], isPending } = useIzinler(businessId, id)
  const { data: izindekiler = new Set<string>() } = useAktifIzinProfilleri(businessId)
  const addIzin = useAddIzin()
  const deleteIzin = useDeleteIzin()

  // Kademeli yetki (048): Muhasebe yalnızca PERSONEL hedefi yönetir; Yönetici
  // herkesi. RLS aynı kuralı zorlar — burada yalnızca butonlar gizlenir.
  const targetRole = member?.profile.role ?? null
  const canWrite =
    me?.role === 'YONETICI' || (me?.role === 'MUHASEBE' && targetRole === 'PERSONEL')

  const [modalOpen, setModalOpen] = useState(false)
  const [baslangic, setBaslangic] = useState('')
  const [bitis, setBitis] = useState('')
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState<Izin | null>(null)
  const [deleteError, setDeleteError] = useState('')

  const today = istanbulTodayISO()
  const { aktif, gelecek, gecmis } = useMemo(() => {
    const aktif = izinler.filter((i) => i.baslangic <= today && i.bitis >= today)
    const gelecek = izinler
      .filter((i) => i.baslangic > today)
      .sort((a, b) => a.baslangic.localeCompare(b.baslangic))
    const gecmis = izinler.filter((i) => i.bitis < today)
    return { aktif, gelecek, gecmis }
  }, [izinler, today])

  function openModal() {
    setBaslangic('')
    setBitis('')
    setError('')
    setModalOpen(true)
  }

  async function onAdd() {
    setError('')
    if (!baslangic || !bitis) {
      setError('Başlangıç ve bitiş tarihlerini seçin.')
      return
    }
    if (bitis < baslangic) {
      setError('Bitiş, başlangıçtan önce olamaz.')
      return
    }
    try {
      await addIzin.mutateAsync({ businessId, profileId: id, baslangic, bitis })
      setModalOpen(false)
    } catch (err) {
      setError(rpcErrorText(err, 'İzin eklenemedi. Tekrar deneyin.'))
    }
  }

  async function onConfirmDelete() {
    if (!deleting) return
    setDeleteError('')
    try {
      await deleteIzin.mutateAsync(deleting.id)
      setDeleting(null)
    } catch (err) {
      setDeleteError(rpcErrorText(err, 'İzin silinemedi. Tekrar deneyin.'))
    }
  }

  const izinde = izindekiler.has(id)

  const section = (label: string, items: Izin[], tone: 'aktif' | 'gelecek' | 'gecmis') => (
    <div>
      <div className="mb-2 text-[11px] font-bold tracking-[0.6px] text-faint">{label}</div>
      {items.length === 0 ? (
        <div className="rounded-[14px] bg-card p-[14px] text-center text-[13px] text-muted">
          Yok
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((i) => (
            <IzinRow
              key={i.id}
              izin={i}
              tone={tone}
              onDelete={
                canWrite
                  ? () => {
                      setDeleteError('')
                      setDeleting(i)
                    }
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="screen-forward">
      <div className="px-6 pt-4">
        <button
          type="button"
          onClick={() => void navigate(`/yonetim/personel/${id}`)}
          className="inline-flex cursor-pointer items-center gap-1 py-[6px]"
        >
          <BackChevron />
          <span className="text-[15px] font-medium text-ink">Geri</span>
        </button>
      </div>

      {/* Kimlik — Personel Detay başlığıyla aynı desen */}
      <div className="flex items-center gap-[14px] px-6 pt-3">
        <Avatar name={member?.profile.full_name || '?'} size={60} />
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-[22px] font-bold tracking-[-0.3px] text-ink">
              {member?.profile.full_name || 'İsimsiz'}
            </h1>
            {izinde && (
              <span className="flex shrink-0 items-center gap-[5px]">
                <span className="h-[7px] w-[7px] rounded-full bg-warn" />
                <span className="text-[13px] font-semibold text-warn">İzinde</span>
              </span>
            )}
          </div>
          <div className="mt-[3px] text-sm text-muted">
            {targetRole ? ROLE_LABELS[targetRole] : '—'}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-6 pt-6">
        <h2 className="text-[19px] font-bold tracking-[-0.3px] text-ink">İzinler</h2>
        {canWrite && (
          <button
            type="button"
            onClick={openModal}
            className="pressable cursor-pointer rounded-[12px] bg-ink px-4 py-[9px] text-[13.5px] font-semibold text-white"
          >
            İzin ekle
          </button>
        )}
      </div>

      {isPending ? (
        <div className="flex justify-center py-14">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-divider border-t-ink" />
        </div>
      ) : (
        <div className="flex flex-col gap-5 px-6 pt-4">
          {section('ŞU ANDA AKTİF', aktif, 'aktif')}
          {section('GELECEK İZİNLER', gelecek, 'gelecek')}
          {section('GEÇMİŞ İZİNLER', gecmis, 'gecmis')}
        </div>
      )}
      <div className="h-10" />

      <FormModal
        open={modalOpen}
        title="Aralık seç"
        error={error}
        busy={addIzin.isPending}
        confirmLabel="Ekle"
        onConfirm={() => void onAdd()}
        onClose={() => setModalOpen(false)}
      >
        <div>
          <div className={modalFieldLabel}>BAŞLANGIÇ</div>
          <input
            type="date"
            value={baslangic}
            onChange={(e) => setBaslangic(e.target.value)}
            className={modalInputCls}
          />
        </div>
        <div>
          <div className={modalFieldLabel}>BİTİŞ</div>
          <input
            type="date"
            value={bitis}
            min={baslangic || undefined}
            onChange={(e) => setBitis(e.target.value)}
            className={modalInputCls}
          />
        </div>
      </FormModal>

      <ConfirmDialog
        open={deleting !== null}
        title="İzni sil"
        message={
          deleting
            ? `${formatDateDots(deleting.baslangic)} — ${formatDateDots(deleting.bitis)} izni silinecek.`
            : ''
        }
        confirmLabel="Sil"
        danger
        busy={deleteIzin.isPending}
        error={deleteError}
        onConfirm={() => void onConfirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
