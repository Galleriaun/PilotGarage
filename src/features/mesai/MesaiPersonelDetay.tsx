import { useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useLocation, useNavigate, useParams } from 'react-router'
import { useBusiness } from '../../app/providers/BusinessProvider'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { istanbulDateTimeLocal, istanbulLocalToISO } from '../../lib/dates'
import { periodRange, type PeriodKey } from '../finans/selectors'
import { BackChevron } from '../auth/EyeIcon'
import { Avatar } from '../yonetim/shared'
import {
  useMesaiKayitGuncelle,
  useMesaiKayitSil,
  useMesaiKisiKayitlari,
  useMesaiManuelEkle,
} from './api'
import { formatDuration, personSessions, PersonSessions, type Session } from './report'

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'BUGUN', label: 'Bugün' },
  { key: 'HAFTA', label: 'Bu Hafta' },
  { key: 'AY', label: 'Bu Ay' },
  { key: 'TUMU', label: 'Tümü' },
]

const fieldCls =
  'w-full rounded-[12px] border-none bg-field px-[14px] py-[12px] text-[15px] text-ink outline-none'

export default function MesaiPersonelDetay() {
  const navigate = useNavigate()
  const { personelId = '' } = useParams()
  const location = useLocation()
  const stateName = (location.state as { name?: string } | null)?.name
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id ?? ''

  const [period, setPeriod] = useState<PeriodKey>('BUGUN')
  const range = useMemo(() => periodRange(period), [period])
  const { data: kayitlar = [], isPending } = useMesaiKisiKayitlari(businessId, personelId, range)

  const { sessions, totalMin, hasOpen } = useMemo(
    () => personSessions(kayitlar, period),
    [kayitlar, period],
  )

  const name =
    stateName || kayitlar.find((k) => k.profile?.full_name)?.profile?.full_name || 'Personel'

  const mesaiEkle = useMesaiManuelEkle()
  const mesaiGuncelle = useMesaiKayitGuncelle()
  const mesaiSil = useMesaiKayitSil()
  const busy = mesaiEkle.isPending || mesaiGuncelle.isPending

  // ── Manuel ekle modal ──
  const [adding, setAdding] = useState(false)
  const [addTip, setAddTip] = useState<'GIRIS' | 'CIKIS'>('GIRIS')
  const [addZaman, setAddZaman] = useState('')
  const [addErr, setAddErr] = useState('')

  function openAdd() {
    setAddTip('GIRIS')
    setAddZaman(istanbulDateTimeLocal(new Date().toISOString()))
    setAddErr('')
    setAdding(true)
  }
  async function saveAdd() {
    setAddErr('')
    if (!addZaman) {
      setAddErr('Zaman girin.')
      return
    }
    try {
      await mesaiEkle.mutateAsync({
        businessId,
        profileId: personelId,
        tip: addTip,
        zaman: istanbulLocalToISO(addZaman),
      })
      setAdding(false)
    } catch (e) {
      setAddErr(e instanceof Error ? e.message : 'Kaydedilemedi.')
    }
  }

  // ── Düzenle modal ──
  const [editing, setEditing] = useState<Session | null>(null)
  const [editGiris, setEditGiris] = useState('')
  const [editCikis, setEditCikis] = useState('')
  const [editErr, setEditErr] = useState('')

  function openEdit(s: Session) {
    setEditGiris(istanbulDateTimeLocal(s.start))
    setEditCikis(s.end ? istanbulDateTimeLocal(s.end) : '')
    setEditErr('')
    setEditing(s)
  }
  async function saveEdit() {
    if (!editing) return
    setEditErr('')
    if (!editGiris) {
      setEditErr('Giriş saati girin.')
      return
    }
    if (editCikis && editCikis < editGiris) {
      setEditErr('Çıkış, girişten önce olamaz.')
      return
    }
    try {
      if (editGiris !== istanbulDateTimeLocal(editing.start)) {
        await mesaiGuncelle.mutateAsync({
          kayitId: editing.startId,
          zaman: istanbulLocalToISO(editGiris),
        })
      }
      if (editing.endId) {
        if (editing.end && editCikis && editCikis !== istanbulDateTimeLocal(editing.end)) {
          await mesaiGuncelle.mutateAsync({
            kayitId: editing.endId,
            zaman: istanbulLocalToISO(editCikis),
          })
        }
      } else if (editCikis) {
        await mesaiEkle.mutateAsync({
          businessId,
          profileId: personelId,
          tip: 'CIKIS',
          zaman: istanbulLocalToISO(editCikis),
        })
      }
      setEditing(null)
    } catch (e) {
      setEditErr(e instanceof Error ? e.message : 'Kaydedilemedi.')
    }
  }

  // ── Sil ──
  const [deleting, setDeleting] = useState<Session | null>(null)
  async function confirmDelete() {
    if (!deleting) return
    try {
      await mesaiSil.mutateAsync(deleting.startId)
      if (deleting.endId) await mesaiSil.mutateAsync(deleting.endId)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="screen-forward">
      <div className="px-6 pt-4">
        <button
          type="button"
          onClick={() => void navigate('/yonetim/mesai')}
          className="inline-flex cursor-pointer items-center gap-1 py-[6px]"
        >
          <BackChevron />
          <span className="text-[15px] font-medium text-ink">Mesai Kayıtları</span>
        </button>
      </div>

      {/* Personel başlık */}
      <div className="flex items-center gap-3 px-6 pt-4">
        <Avatar name={name} size={46} />
        <div className="min-w-0">
          <h1 className="truncate text-[22px] font-bold tracking-[-0.4px] text-ink">{name}</h1>
          <div className="text-[13px] text-muted">Mesai geçmişi</div>
        </div>
      </div>

      {/* Dönem filtreleri */}
      <div className="flex gap-2 overflow-x-auto px-6 pt-4">
        {PERIODS.map((p) => {
          const selected = period === p.key
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className="shrink-0 cursor-pointer whitespace-nowrap rounded-[20px] px-[14px] py-2 text-[13px] font-semibold"
              style={{
                background: selected ? 'var(--seg-on)' : 'var(--seg)',
                color: selected ? 'var(--seg-fg-on)' : 'var(--seg-fg)',
              }}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      {/* Özet */}
      <div className="mx-6 mt-4">
        <div
          className="rounded-[18px] px-5 py-4"
          style={{ background: 'linear-gradient(150deg,#1C1C1E,#0A0A0A)' }}
        >
          <div className="text-[11px] font-semibold tracking-[0.5px] text-white/50">
            TOPLAM MESAİ
          </div>
          <div className="mt-1 text-[26px] font-bold tracking-[-0.5px] text-white">
            {totalMin > 0 ? formatDuration(totalMin) : '—'}
          </div>
          <div className="mt-[2px] text-[12px] text-white/50">
            {sessions.length} oturum
            {hasOpen && <span className="text-[#4ADE80]"> · şu an mesaide</span>}
          </div>
        </div>
      </div>

      {/* Manuel ekle */}
      <div className="px-6 pt-3">
        <button
          type="button"
          onClick={openAdd}
          className="pressable flex w-full cursor-pointer items-center justify-center gap-2 rounded-[14px] border border-dashed border-divider py-3 text-[13px] font-semibold text-ink"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Manuel Kayıt Ekle
        </button>
      </div>

      {/* Oturumlar */}
      {isPending ? (
        <div className="flex justify-center py-14">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-divider border-t-ink" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="px-6 py-16 text-center text-[13px] text-muted">
          Bu dönemde mesai kaydı yok.
        </div>
      ) : (
        <div className="mx-6 mt-4 rounded-[16px] bg-card px-4 py-4">
          <PersonSessions sessions={sessions} onEdit={openEdit} onDelete={setDeleting} />
        </div>
      )}
      <div className="h-10" />

      {/* ── Manuel ekle modal ── */}
      <Dialog.Root open={adding} onOpenChange={(o) => !o && setAdding(false)}>
        <Dialog.Portal>
          <Dialog.Overlay className="modal-backdrop fixed inset-0 z-50 bg-black/45" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-48px)] max-w-[340px] -translate-x-1/2 -translate-y-1/2 outline-none">
            <div className="modal-pop rounded-[20px] bg-white px-[22px] py-6 shadow-[0_20px_50px_rgba(0,0,0,0.25)]">
              <Dialog.Title className="mb-1 text-[17px] font-bold text-ink">
                Manuel Kayıt Ekle
              </Dialog.Title>
              <Dialog.Description className="mb-4 text-[13px] text-muted">
                {name} için elle giriş veya çıkış kaydı ekleyin.
              </Dialog.Description>

              <div className="mb-3 flex gap-2">
                {(['GIRIS', 'CIKIS'] as const).map((t) => {
                  const on = addTip === t
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setAddTip(t)}
                      className="flex-1 cursor-pointer rounded-[12px] py-[10px] text-sm font-semibold"
                      style={{
                        background: on ? 'var(--seg-on)' : 'var(--seg)',
                        color: on ? 'var(--seg-fg-on)' : 'var(--seg-fg)',
                      }}
                    >
                      {t === 'GIRIS' ? 'Giriş' : 'Çıkış'}
                    </button>
                  )
                })}
              </div>

              <div className="mb-1 text-[11px] font-bold tracking-[0.5px] text-faint">TARİH & SAAT</div>
              <input
                type="datetime-local"
                value={addZaman}
                onChange={(e) => setAddZaman(e.target.value)}
                className={fieldCls}
              />

              {addErr && <p className="mt-2 text-[13px] text-danger">{addErr}</p>}

              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="flex-1 cursor-pointer rounded-[12px] bg-field py-3 text-sm font-semibold text-ink"
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={() => void saveAdd()}
                  disabled={busy}
                  className="flex-1 cursor-pointer rounded-[12px] bg-ink py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {busy ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ── Düzenle modal ── */}
      <Dialog.Root open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="modal-backdrop fixed inset-0 z-50 bg-black/45" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-48px)] max-w-[340px] -translate-x-1/2 -translate-y-1/2 outline-none">
            <div className="modal-pop rounded-[20px] bg-white px-[22px] py-6 shadow-[0_20px_50px_rgba(0,0,0,0.25)]">
              <Dialog.Title className="mb-1 text-[17px] font-bold text-ink">Kaydı Düzenle</Dialog.Title>
              <Dialog.Description className="mb-4 text-[13px] text-muted">
                Giriş ve çıkış saatlerini düzeltin.
              </Dialog.Description>

              <div className="mb-1 text-[11px] font-bold tracking-[0.5px] text-faint">GİRİŞ</div>
              <input
                type="datetime-local"
                value={editGiris}
                onChange={(e) => setEditGiris(e.target.value)}
                className={fieldCls}
              />

              <div className="mb-1 mt-3 text-[11px] font-bold tracking-[0.5px] text-faint">
                ÇIKIŞ{!editing?.endId && ' (isteğe bağlı — eklemek için doldurun)'}
              </div>
              <input
                type="datetime-local"
                value={editCikis}
                onChange={(e) => setEditCikis(e.target.value)}
                className={fieldCls}
              />

              {editErr && <p className="mt-2 text-[13px] text-danger">{editErr}</p>}

              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="flex-1 cursor-pointer rounded-[12px] bg-field py-3 text-sm font-semibold text-ink"
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={() => void saveEdit()}
                  disabled={busy}
                  className="flex-1 cursor-pointer rounded-[12px] bg-ink py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {busy ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ConfirmDialog
        open={deleting !== null}
        title="Mesai kaydını sil"
        message="Bu mesai oturumunu silmek istiyor musunuz? Çöp kutusundan geri alabilirsiniz."
        confirmLabel="Sil"
        danger
        busy={mesaiSil.isPending}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
