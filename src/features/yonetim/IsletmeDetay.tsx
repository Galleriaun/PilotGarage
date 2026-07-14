import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useNavigate, useParams } from 'react-router'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { formatTL, numericStringToKurus, parseTLToKurus } from '../../lib/money'
import { formatRelativeDate } from '../../lib/dates'
import { BackChevron } from '../auth/EyeIcon'
import { CalendarIcon, PhoneIcon } from '../kayit/icons'
import { formatTelDisplay, isTelGenelComplete, normalizeTelGenel, telHref } from '../kayit/telefon'
import {
  useAddHareket,
  useCariIsletme,
  useDeleteCari,
  useDeleteHareket,
  useToplaOdeme,
  useUpdateCari,
  useYansitHareket,
} from './api'
import type { CariHareket } from './types'
import { bakiyeTag, cariBakiyeKurus } from './Isletmeler'
import {
  Avatar,
  FormModal,
  GunDropdown,
  PencilIcon,
  TrashIcon,
  modalFieldLabel,
  modalInputCls,
} from './shared'

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
      stroke="currentColor"
      strokeWidth="2.8"
      strokeLinecap="round"
      className="shrink-0 text-ink"
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
  const toplaOdeme = useToplaOdeme()
  const updateCari = useUpdateCari()
  const deleteHareket = useDeleteHareket()
  const deleteCari = useDeleteCari()

  // Borç Ekle — alacak hareketi; TEKRAR = her ay otomatik borç (0 = tek sefer)
  const [borcModal, setBorcModal] = useState<{
    open: boolean
    tutar: string
    note: string
    gun: number
  }>({ open: false, tutar: '', note: '', gun: 0 })
  const [error, setError] = useState('')

  // Genel Ödeme Topla — bakiyeden düşer, kasa geliri olarak Onay'a gider
  const [odemeModal, setOdemeModal] = useState<{ open: boolean; tutar: string; note: string }>({
    open: false,
    tutar: '',
    note: '',
  })
  const [odemeError, setOdemeError] = useState('')
  const [yansitError, setYansitError] = useState('')
  const [yansitBusyId, setYansitBusyId] = useState<string | null>(null)

  const [yansitilmamis, setYansitilmamis] = useState(false)
  const [duzenli, setDuzenli] = useState(false) // scope: only rule-generated hareketler
  const [range, setRange] = useState<{ start: string; end: string } | null>(null)
  const [dateModal, setDateModal] = useState<{ open: boolean; start: string; end: string }>({
    open: false,
    start: '',
    end: '',
  })

  const [editModal, setEditModal] = useState<{
    open: boolean
    name: string
    note: string
    telefon: string // ulusal 10 hane; +90 sabit (036)
  }>({ open: false, name: '', note: '', telefon: '' })
  const [editError, setEditError] = useState('')

  const [delModal, setDelModal] = useState<{ open: boolean; text: string }>({
    open: false,
    text: '',
  })
  const [delError, setDelError] = useState('')

  const [yansitAllOpen, setYansitAllOpen] = useState(false)
  const [yansitAllBusy, setYansitAllBusy] = useState(false)
  const [yansitAllError, setYansitAllError] = useState('')

  async function onDeleteCari() {
    setDelError('')
    if (delModal.text.trim().toLowerCase() !== 'pilotgarage') {
      setDelError('Silmek için "pilotgarage" yazın.')
      return
    }
    try {
      await deleteCari.mutateAsync({ id })
      void navigate('/yonetim/isletmeler', { replace: true })
    } catch {
      setDelError('Silinemedi. Tekrar deneyin.')
    }
  }
  const [yansitConfirm, setYansitConfirm] = useState<CariHareket | null>(null)
  const [deleting, setDeleting] = useState<CariHareket | null>(null)

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
  // Toplam borç = tüm borç hareketleri; toplam tahsilat = ödeme toplanan
  // her hareket (kasa_durumu ≠ YOK). Bakiye = borç − tahsilat.
  let toplamBorc = 0
  let toplamTahsilat = 0
  for (const h of isletme.hareketler) {
    const kurus = numericStringToKurus(String(h.tutar))
    if (h.tur === 'GELIR') toplamBorc += kurus
    if (h.kasa_durumu !== 'YOK') toplamTahsilat += kurus
  }

  // filters narrow the HAREKETLER list only — the cari özet stays whole-account
  const filtersActive = yansitilmamis || duzenli || range !== null
  const hareketler = isletme.hareketler.filter(
    (h) =>
      (!yansitilmamis || h.kasa_durumu === 'YOK') &&
      // Boolean() also covers rows fetched before migration 011 (field absent)
      (!duzenli || Boolean(h.tekrar_kural_id)) &&
      (!range || (h.tarih >= range.start && h.tarih <= range.end)),
  )

  async function onSaveBorc() {
    setError('')
    const kurus = parseTLToKurus(borcModal.tutar)
    if (kurus === null || kurus <= 0) {
      setError('Geçerli bir tutar girin.')
      return
    }
    if (!isletme) return
    try {
      await addHareket.mutateAsync({
        cariIsletmeId: id,
        businessId: isletme.business_id,
        cariName: isletme.name,
        tur: 'GELIR', // borç = alacağımız
        kurus,
        note: borcModal.note.trim(),
        odemeGunu: borcModal.gun,
      })
      setBorcModal((m) => ({ ...m, open: false }))
    } catch {
      setError('Kaydedilemedi. Tekrar deneyin.')
    }
  }

  async function onToplaOdeme() {
    setOdemeError('')
    const kurus = parseTLToKurus(odemeModal.tutar)
    if (kurus === null || kurus <= 0) {
      setOdemeError('Geçerli bir tutar girin.')
      return
    }
    try {
      await toplaOdeme.mutateAsync({
        cariIsletmeId: id,
        kurus,
        note: odemeModal.note.trim(),
      })
      setOdemeModal((m) => ({ ...m, open: false }))
    } catch {
      setOdemeError('Kaydedilemedi. Tekrar deneyin.')
    }
  }

  async function onYansit(hareketId: string) {
    setYansitError('')
    setYansitBusyId(hareketId)
    try {
      await yansit.mutateAsync({ hareketId })
    } catch {
      setYansitError('Ödeme toplanamadı. Tekrar deneyin.')
    } finally {
      setYansitBusyId(null)
    }
  }

  async function onDeleteHareket() {
    if (!deleting) return
    try {
      await deleteHareket.mutateAsync({ id: deleting.id })
    } catch {
      setYansitError('Hareket silinemedi. Tekrar deneyin.')
    } finally {
      setDeleting(null)
    }
  }

  async function onConfirmYansit() {
    if (!yansitConfirm) return
    const hareketId = yansitConfirm.id
    setYansitConfirm(null)
    await onYansit(hareketId)
  }

  async function onYansitAll() {
    setYansitAllError('')
    setYansitAllBusy(true)
    let failed = 0
    for (const h of hareketler) {
      if (h.kasa_durumu !== 'YOK') continue
      try {
        await yansit.mutateAsync({ hareketId: h.id })
      } catch {
        failed += 1
      }
    }
    setYansitAllBusy(false)
    if (failed > 0) {
      setYansitAllError(`${failed} hareket için ödeme toplanamadı. Tekrar deneyin.`)
    } else {
      setYansitAllOpen(false)
    }
  }

  async function onSaveEdit() {
    setEditError('')
    if (!editModal.name.trim()) {
      setEditError('İşletme adı girin.')
      return
    }
    if (editModal.telefon && !isTelGenelComplete(editModal.telefon)) {
      setEditError('Telefon numarası eksik — 10 hane girin.')
      return
    }
    try {
      await updateCari.mutateAsync({
        id,
        name: editModal.name.trim(),
        note: editModal.note.trim(),
        telefon: editModal.telefon,
      })
      setEditModal((m) => ({ ...m, open: false }))
    } catch {
      setEditError('Kaydedilemedi. Tekrar deneyin.')
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
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[22px] font-bold tracking-[-0.3px] text-ink">
            {isletme.name}
          </h1>
          <div className="mt-[2px] truncate text-sm text-muted">{isletme.note || '—'}</div>
          {isTelGenelComplete(isletme.telefon) && (
            <div className="mt-[2px] truncate text-sm text-muted">
              {formatTelDisplay(isletme.telefon)}
            </div>
          )}
        </div>
        {isTelGenelComplete(isletme.telefon) && (
          <a
            href={telHref(isletme.telefon)}
            aria-label="İşletmeyi ara"
            className="pressable flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-success"
          >
            <PhoneIcon size={15} color="#fff" />
          </a>
        )}
        <button
          type="button"
          aria-label="İşletmeyi düzenle"
          onClick={() => {
            setEditError('')
            setEditModal({
              open: true,
              name: isletme.name,
              note: isletme.note,
              telefon: isletme.telefon,
            })
          }}
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-field"
        >
          <PencilIcon size={15} />
        </button>
        <button
          type="button"
          aria-label="İşletmeyi sil"
          onClick={() => {
            setDelError('')
            setDelModal({ open: true, text: '' })
          }}
          className="ml-2 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-danger-soft"
        >
          <TrashIcon size={15} />
        </button>
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
              <div className="mb-[5px] text-xs text-muted">Toplam borç</div>
              <div className="text-lg font-bold text-danger">{formatTL(toplamBorc)}</div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-[5px] text-xs text-muted">Toplam tahsilat</div>
              <div className="text-lg font-bold text-success">{formatTL(toplamTahsilat)}</div>
            </div>
          </div>
        </div>

        {/* Borç Ekle / Ödeme Topla */}
        <div className="flex gap-[10px]">
          <button
            type="button"
            onClick={() => {
              setError('')
              setBorcModal({ open: true, tutar: '', note: '', gun: 0 })
            }}
            className="pressable flex flex-1 cursor-pointer items-center justify-center gap-[6px] whitespace-nowrap rounded-[13px] bg-card px-1 py-[13px]"
          >
            <PlusInkIcon />
            <span className="text-[13.5px] font-semibold text-ink">Borç Ekle</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setOdemeError('')
              setOdemeModal({ open: true, tutar: '', note: '' })
            }}
            className="pressable flex flex-1 cursor-pointer items-center justify-center gap-[6px] whitespace-nowrap rounded-[13px] bg-card px-1 py-[13px]"
          >
            <PlusInkIcon />
            <span className="text-[13.5px] font-semibold text-ink">Ödeme Topla</span>
          </button>
        </div>

        {/* Hareketler */}
        <div>
          <div className="mb-2 text-[11px] font-bold tracking-[0.6px] text-faint">HAREKETLER</div>
          <div className="mb-3 flex gap-2 overflow-x-auto">
            {(
              [
                { yok: false, label: 'Tümü' },
                { yok: true, label: 'Toplanmamış' },
              ] as const
            ).map((f) => {
              const selected = yansitilmamis === f.yok
              return (
                <button
                  key={f.label}
                  type="button"
                  onClick={() => setYansitilmamis(f.yok)}
                  className="cursor-pointer whitespace-nowrap rounded-[20px] px-[14px] py-2 text-[13px] font-semibold"
                  style={{
                    background: selected ? 'var(--seg-on)' : 'var(--seg)',
                    color: selected ? '#fff' : '#888',
                  }}
                >
                  {f.label}
                </button>
              )
            })}
            <button
              type="button"
              onClick={() =>
                setDateModal({ open: true, start: range?.start ?? '', end: range?.end ?? '' })
              }
              aria-label="Tarih aralığı seç"
              className="flex cursor-pointer items-center gap-[5px] whitespace-nowrap rounded-[20px] px-3 py-2 text-[13px] font-semibold"
              style={{
                background: range ? 'var(--seg-on)' : 'var(--seg)',
                color: range ? 'var(--seg-fg-on)' : 'var(--seg-fg)',
              }}
            >
              <CalendarIcon size={14} color={range ? '#fff' : '#888'} />
              {range && (
                <span>
                  {ddmm(range.start)} – {ddmm(range.end)}
                </span>
              )}
            </button>
            {/* Düzenli: independent scope toggle — the other filters apply within it */}
            <button
              type="button"
              onClick={() => setDuzenli((v) => !v)}
              className="ml-auto cursor-pointer whitespace-nowrap rounded-[20px] px-[14px] py-2 text-[13px] font-semibold"
              style={{
                background: duzenli ? '#B45309' : '#FFF7ED',
                color: duzenli ? '#fff' : '#B45309',
              }}
            >
              Düzenli
            </button>
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
                          {h.note || (h.tur === 'GELIR' ? 'Borç' : 'Ödeme')}
                        </div>
                        <div className="mt-[2px] text-xs text-muted">
                          {formatRelativeDate(h.tarih)}
                        </div>
                      </div>
                      {/* borç = kırmızı +, ödeme = yeşil − (bakiyeden düşer) */}
                      <div
                        className="shrink-0 text-[15px] font-bold"
                        style={{ color: h.tur === 'GELIR' ? '#C62828' : '#15803D' }}
                      >
                        {h.tur === 'GELIR' ? '+' : '-'}
                        {formatTL(kurus)}
                      </div>
                    </div>
                    {h.kasa_durumu === 'YOK' && (
                      <div className="mt-2 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setDeleting(h)}
                          aria-label="Hareketi sil"
                          className="flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded-[9px] bg-danger-soft"
                        >
                          <TrashIcon size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setYansitConfirm(h)}
                          disabled={yansitBusyId === h.id}
                          className="cursor-pointer rounded-[9px] bg-ink px-3 py-[7px] text-xs font-semibold text-white disabled:opacity-60"
                        >
                          {yansitBusyId === h.id ? 'Gönderiliyor…' : 'Ödeme Topla'}
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
                          ✓ Tahsil edildi
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Tümünü Topla — visible on the Toplanmamış filter */}
          {yansitilmamis && hareketler.length > 0 && (
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={() => {
                  setYansitAllError('')
                  setYansitAllOpen(true)
                }}
                className="pressable cursor-pointer rounded-[12px] bg-ink px-5 py-[10px] text-[13px] font-semibold text-white"
              >
                Tümünü Topla ({hareketler.length})
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="h-10" />

      <FormModal
        open={borcModal.open}
        title="Borç Ekle"
        error={error}
        busy={addHareket.isPending}
        confirmColor="#C62828"
        onConfirm={() => void onSaveBorc()}
        onClose={() => setBorcModal((m) => ({ ...m, open: false }))}
      >
        <div>
          <div className={modalFieldLabel}>TUTAR (₺)</div>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={borcModal.tutar}
            onChange={(e) => setBorcModal((m) => ({ ...m, tutar: e.target.value }))}
            className={modalInputCls}
          />
        </div>
        <div>
          <div className={modalFieldLabel}>AÇIKLAMA</div>
          <input
            type="text"
            value={borcModal.note}
            onChange={(e) => setBorcModal((m) => ({ ...m, note: e.target.value }))}
            className={modalInputCls}
          />
        </div>
        <div>
          <div className={modalFieldLabel}>TEKRAR</div>
          <GunDropdown
            value={borcModal.gun}
            onChange={(gun) => setBorcModal((m) => ({ ...m, gun }))}
            allowManual
            zeroLabel="Yok (tek sefer)"
          />
          {borcModal.gun > 0 && (
            <p className="mt-[6px] text-xs leading-relaxed text-faint">
              Her ayın {borcModal.gun}. günü aynı borç cari hesaba otomatik eklenir — ödeme
              toplamak yine onayınıza bağlı kalır.
            </p>
          )}
        </div>
        <p className="text-xs leading-relaxed text-faint">
          Borç yalnızca cari hesaba işlenir; kasa etkilenmez.
        </p>
      </FormModal>

      {/* Genel Ödeme Topla — bakiyeden düşer, kasa geliri olarak Onay'a gider */}
      <FormModal
        open={odemeModal.open}
        title="Ödeme Topla"
        error={odemeError}
        busy={toplaOdeme.isPending}
        confirmLabel="Topla"
        confirmColor="#15803D"
        onConfirm={() => void onToplaOdeme()}
        onClose={() => setOdemeModal((m) => ({ ...m, open: false }))}
      >
        <div>
          <div className={modalFieldLabel}>TUTAR (₺)</div>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={odemeModal.tutar}
            onChange={(e) => setOdemeModal((m) => ({ ...m, tutar: e.target.value }))}
            className={modalInputCls}
          />
        </div>
        <div>
          <div className={modalFieldLabel}>AÇIKLAMA</div>
          <input
            type="text"
            value={odemeModal.note}
            onChange={(e) => setOdemeModal((m) => ({ ...m, note: e.target.value }))}
            className={modalInputCls}
          />
        </div>
        <p className="text-xs leading-relaxed text-faint">
          Tutar cari hesaptan düşülür ve kasa geliri olarak onay kuyruğuna gönderilir —
          kasa, Onay bölümünde onaylanana kadar etkilenmez.
        </p>
      </FormModal>

      {/* Hareket silme onayı — only YOK hareketler are deletable (RLS-enforced) */}
      <ConfirmDialog
        open={deleting !== null}
        title="Hareketi sil"
        message={
          deleting
            ? `${deleting.note || (deleting.tur === 'GELIR' ? 'Borç' : 'Ödeme')} (${
                deleting.tur === 'GELIR' ? '+' : '-'
              }${formatTL(numericStringToKurus(String(deleting.tutar)))}) silinecek. Bu işlem geri alınamaz.`
            : ''
        }
        confirmLabel="Sil"
        danger
        busy={deleteHareket.isPending}
        onConfirm={() => void onDeleteHareket()}
        onCancel={() => setDeleting(null)}
      />

      {/* Ödeme Topla onayı (tek hareket) */}
      <ConfirmDialog
        open={yansitConfirm !== null}
        title="Ödeme topla"
        message={
          yansitConfirm
            ? `${yansitConfirm.note || (yansitConfirm.tur === 'GELIR' ? 'Borç' : 'Ödeme')} (${formatTL(
                numericStringToKurus(String(yansitConfirm.tutar)),
              )}) tahsilatı onaya gönderilecek.`
            : ''
        }
        confirmLabel="Topla"
        busy={false}
        onConfirm={() => void onConfirmYansit()}
        onCancel={() => setYansitConfirm(null)}
      />

      {/* Tümünü Topla onayı — lists exactly what will hit the Onay queue */}
      <FormModal
        open={yansitAllOpen}
        title="Tümünü Topla"
        error={yansitAllError}
        busy={yansitAllBusy}
        confirmLabel="Topla"
        onConfirm={() => void onYansitAll()}
        onClose={() => setYansitAllOpen(false)}
      >
        <p className="text-[13px] leading-relaxed text-muted">
          Aşağıdaki {hareketler.length} hareket için ödeme toplanacak (onay kuyruğuna
          gönderilecek):
        </p>
        <div className="flex max-h-[260px] flex-col gap-[6px] overflow-y-auto">
          {hareketler.map((h) => (
            <div
              key={h.id}
              className="flex items-center justify-between gap-3 rounded-[10px] bg-field px-3 py-[9px]"
            >
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-ink">
                  {h.note || (h.tur === 'GELIR' ? 'Borç' : 'Ödeme')}
                </div>
                <div className="text-[11px] text-muted">{formatRelativeDate(h.tarih)}</div>
              </div>
              <div className="shrink-0 text-[13px] font-bold text-ink">
                {formatTL(numericStringToKurus(String(h.tutar)))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-faint">
          Kasa, işlemler Onay bölümünde onaylanana kadar etkilenmez.
        </p>
      </FormModal>

      {/* İşletmeyi sil modal — requires typing "pilotgarage" */}
      <FormModal
        open={delModal.open}
        title="İşletmeyi sil"
        error={delError}
        busy={deleteCari.isPending}
        confirmLabel="Sil"
        confirmColor="#C62828"
        onConfirm={() => void onDeleteCari()}
        onClose={() => setDelModal({ open: false, text: '' })}
      >
        <p className="text-[13.5px] leading-normal text-muted">
          <b className="text-ink">{isletme.name}</b> ve tüm hareketleri kalıcı olarak
          silinecek. Kasaya yansımış işlemler &quot;Silinen işletme&quot; olarak kalır. Bu
          işlem geri alınamaz.
        </p>
        <div>
          <div className={modalFieldLabel}>ONAY İÇİN &quot;pilotgarage&quot; YAZIN</div>
          <input
            type="text"
            value={delModal.text}
            onChange={(e) => setDelModal((m) => ({ ...m, text: e.target.value }))}
            placeholder="pilotgarage"
            className={modalInputCls}
          />
        </div>
      </FormModal>

      {/* İşletmeyi düzenle modal */}
      <FormModal
        open={editModal.open}
        title="İşletmeyi düzenle"
        error={editError}
        busy={updateCari.isPending}
        onConfirm={() => void onSaveEdit()}
        onClose={() => setEditModal((m) => ({ ...m, open: false }))}
      >
        <div>
          <div className={modalFieldLabel}>İŞLETME ADI</div>
          <input
            type="text"
            placeholder="Örn. Aktif Lastik Ltd."
            value={editModal.name}
            onChange={(e) => setEditModal((m) => ({ ...m, name: e.target.value }))}
            className={modalInputCls}
          />
        </div>
        <div>
          <div className={modalFieldLabel}>NOT</div>
          <input
            type="text"
            placeholder="Örn. Lastik ve parça tedarikçisi"
            value={editModal.note}
            onChange={(e) => setEditModal((m) => ({ ...m, note: e.target.value }))}
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
              value={editModal.telefon}
              onChange={(e) =>
                setEditModal((m) => ({ ...m, telefon: normalizeTelGenel(e.target.value) }))
              }
              maxLength={10}
              className="w-full min-w-0 border-none bg-transparent pl-2 text-[15px] text-ink outline-none placeholder:text-faint"
            />
          </div>
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
