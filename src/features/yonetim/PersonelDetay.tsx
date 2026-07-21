import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAuth } from '../../app/providers/AuthProvider'
import { useBusiness } from '../../app/providers/BusinessProvider'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import FloatingSavePopup from '../../components/ui/FloatingSavePopup'
import {
  istanbulTodayISO,
  formatDateDots,
  formatRelativeDate,
  TR_MONTHS_FULL,
} from '../../lib/dates'
import { formatTL, numericStringToKurus, parseTLToKurus } from '../../lib/money'
import type { Role } from '../../lib/types'
import { BackChevron } from '../auth/EyeIcon'
import {
  useAktifIzinProfilleri,
  useGiveAvans,
  useGivePrim,
  useMember,
  useMemberBusinessIds,
  usePayMaas,
  usePersonelOdemeler,
  usePrimPaketleri,
  useSetBusinessAccess,
  useSetRole,
  useSetStatus,
  useUpdateMemberPay,
} from './api'
import { odemeOnayli, ROLE_LABELS, ROLE_OPTIONS, type PersonelOdeme } from './types'
import {
  Avatar,
  CalendarBoxIcon,
  FormModal,
  GunDropdown,
  PencilIcon,
  modalFieldLabel,
  modalInputCls,
} from './shared'

/** Pay-cycle start: the last occurrence of the otomatik ödeme günü (avans
 *  and prim count toward the cycle, not the calendar month). gun = 0 (elle
 *  ödeme) falls back to the calendar month. */
function cycleStartISO(gun: number, todayISO: string): string {
  if (gun < 1 || gun > 28) return `${todayISO.slice(0, 7)}-01`
  const [y, m, d] = todayISO.split('-').map(Number)
  const dd = String(gun).padStart(2, '0')
  if (d >= gun) return `${y}-${String(m).padStart(2, '0')}-${dd}`
  const py = m === 1 ? y - 1 : y
  const pm = m === 1 ? 12 : m - 1
  return `${py}-${String(pm).padStart(2, '0')}-${dd}`
}

/** Payment history: last 3 collapsed; "Tümünü Gör" expands to month rows
 *  (with totals) that open on tap. */
function OdemeList({
  items,
  empty,
  fallback,
  positive,
}: {
  items: PersonelOdeme[]
  empty: string
  fallback: string
  positive: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [openMonth, setOpenMonth] = useState<string | null>(null)

  if (items.length === 0) {
    return (
      <div className="rounded-[14px] bg-card p-[18px] text-center text-[13px] text-muted">
        {empty}
      </div>
    )
  }

  const row = (o: PersonelOdeme) => (
    <div
      key={o.id}
      className="flex items-center justify-between gap-3 rounded-[14px] bg-card px-[15px] py-[13px]"
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-ink">{o.note || fallback}</div>
        <div className="mt-[2px] flex items-center gap-[6px] text-xs text-muted">
          <span>{formatRelativeDate(o.tarih)}</span>
          {/* 045: kasaya işlenmemiş avans/prim — toplamlara da girmiyor */}
          {!odemeOnayli(o) && (
            <span className="shrink-0 rounded-[6px] bg-[#FEF9C3] px-2 py-[2px] text-[10.5px] font-semibold text-[#A16207]">
              Onay bekliyor
            </span>
          )}
        </div>
      </div>
      <div
        className={`shrink-0 text-[15px] font-bold ${positive ? 'text-success' : 'text-danger'}`}
        style={{ opacity: odemeOnayli(o) ? 1 : 0.45 }}
      >
        {positive ? '+' : '-'}
        {formatTL(numericStringToKurus(String(o.tutar)))}
      </div>
    </div>
  )

  if (!expanded) {
    return (
      <div className="flex flex-col gap-2">
        {items.slice(0, 3).map(row)}
        {items.length > 3 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="cursor-pointer rounded-[14px] bg-field py-[10px] text-center text-[13px] font-semibold text-ink"
          >
            Tümünü Gör ({items.length})
          </button>
        )}
      </div>
    )
  }

  const months = new Map<string, PersonelOdeme[]>()
  for (const o of items) {
    const k = o.tarih.slice(0, 7)
    months.set(k, [...(months.get(k) ?? []), o])
  }
  const keys = [...months.keys()].sort().reverse()

  return (
    <div className="flex flex-col gap-2">
      {keys.map((k) => {
        const rows = months.get(k) ?? []
        const total = rows.reduce((s, o) => s + numericStringToKurus(String(o.tutar)), 0)
        const label = `${TR_MONTHS_FULL[Number(k.slice(5, 7)) - 1] ?? ''} ${k.slice(0, 4)}`
        const open = openMonth === k
        return (
          <div key={k} className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setOpenMonth(open ? null : k)}
              className="flex cursor-pointer items-center justify-between rounded-[14px] bg-field px-[15px] py-3"
            >
              <span className="text-[13px] font-bold text-ink">
                {label} ({rows.length})
              </span>
              <span
                className={`text-[13px] font-bold ${positive ? 'text-success' : 'text-danger'}`}
              >
                {positive ? '+' : '-'}
                {formatTL(total)}
              </span>
            </button>
            {open && rows.map(row)}
          </div>
        )
      })}
      <button
        type="button"
        onClick={() => {
          setExpanded(false)
          setOpenMonth(null)
        }}
        className="cursor-pointer rounded-[14px] bg-field py-[10px] text-center text-[13px] font-semibold text-muted"
      >
        Gizle
      </button>
    </div>
  )
}

interface Draft {
  role: Role | null
  maasKurus: number
  odemeGunu: number
  businessIds: string[]
}

export default function PersonelDetay() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { profile: me } = useAuth()
  const { activeBusiness, businesses } = useBusiness()
  const businessId = activeBusiness?.id ?? ''
  const isYonetici = me?.role === 'YONETICI'
  const isSelf = me?.id === id

  const { data: member, isPending, isError } = useMember(id, businessId)
  const { data: odemeler = [] } = usePersonelOdemeler(id, businessId)
  const { data: primPaketler = [] } = usePrimPaketleri(businessId)
  const { data: savedBusinessIds = [] } = useMemberBusinessIds(id, isYonetici)
  // 048: bugün izindeyse başlıkta turuncu "İzinde" rozeti
  const { data: izindekiler = new Set<string>() } = useAktifIzinProfilleri(businessId)

  const setRole = useSetRole()
  const updatePay = useUpdateMemberPay()
  const setBusinessAccess = useSetBusinessAccess()
  const giveAvans = useGiveAvans()
  const givePrim = useGivePrim()
  const payMaas = usePayMaas()
  const setStatus = useSetStatus()

  const [draft, setDraft] = useState<Partial<Draft>>({})
  const [editOpen, setEditOpen] = useState(false)
  const [roleModalOpen, setRoleModalOpen] = useState(false)
  const [avansModal, setAvansModal] = useState<{ open: boolean; tutar: string; note: string }>({
    open: false,
    tutar: '',
    note: '',
  })
  // Prim (050): paketIds seçilirse tutar paketlerin toplamı olur (otomatik) ve
  // açıklama = seçilen paket adları; hiç paket seçilmezse elle tutar + açıklama.
  const [primModal, setPrimModal] = useState<{
    open: boolean
    tutar: string
    note: string
    paketIds: string[]
  }>({ open: false, tutar: '', note: '', paketIds: [] })
  const [confirmMaas, setConfirmMaas] = useState(false)
  const [confirmStatus, setConfirmStatus] = useState(false)
  const [error, setError] = useState('')
  const [saveError, setSaveError] = useState('')

  const today = istanbulTodayISO()
  const monthLabel = `${(TR_MONTHS_FULL[Number(today.slice(5, 7)) - 1] ?? '').toLocaleUpperCase('tr-TR')} ${today.slice(0, 4)}`

  // avans/prim count toward the current PAY CYCLE (since the last otomatik
  // ödeme günü), not the calendar month
  const gun = member?.odeme_gunu ?? 0
  const cycleStart = cycleStartISO(gun, today)

  const avanslar = useMemo(() => odemeler.filter((o) => o.tur === 'AVANS'), [odemeler])
  const primler = useMemo(() => odemeler.filter((o) => o.tur === 'PRIM'), [odemeler])
  const maaslar = useMemo(() => odemeler.filter((o) => o.tur === 'MAAS'), [odemeler])
  // 045: Onay bekleyen avans/prim toplama GİRMEZ — bu rakamlar kasadan
  // gerçekten çıkmış parayı gösterir (bekleyenler listede rozetle görünür)
  const sumCycle = (rows: typeof odemeler) =>
    rows
      .filter((o) => o.tarih >= cycleStart && odemeOnayli(o))
      .reduce((sum, o) => sum + numericStringToKurus(String(o.tutar)), 0)
  const cycleAvansKurus = sumCycle(avanslar)
  const cyclePrimKurus = sumCycle(primler)

  // Prim (050): seçili paketler + tutar/açıklama türetimi. Paket seçiliyse
  // tutar toplamdan gelir (canlı) ve açıklama = paket adları; hiç seçili
  // değilse elle tutar + serbest açıklama.
  const primSelected = primPaketler.filter((p) => primModal.paketIds.includes(p.id))
  const primPaketMode = primSelected.length > 0
  const primPaketToplamKurus = primSelected.reduce(
    (s, p) => s + numericStringToKurus(String(p.tutar)),
    0,
  )

  if (isPending) {
    return (
      <div className="flex justify-center py-20 screen-forward">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-divider border-t-ink" />
      </div>
    )
  }
  if (isError || !member) {
    return (
      <div className="px-6 py-16 text-center screen-forward">
        <p className="mb-4 text-sm text-danger">Personel yüklenemedi.</p>
        <button
          type="button"
          onClick={() => void navigate('/yonetim/personel')}
          className="cursor-pointer text-[15px] font-semibold text-ink underline"
        >
          Geri dön
        </button>
      </div>
    )
  }

  const saved: Draft = {
    role: member.profile.role,
    maasKurus: numericStringToKurus(String(member.maas)),
    odemeGunu: member.odeme_gunu,
    businessIds: savedBusinessIds,
  }
  const current: Draft = {
    role: draft.role ?? saved.role,
    maasKurus: draft.maasKurus ?? saved.maasKurus,
    odemeGunu: draft.odemeGunu ?? saved.odemeGunu,
    businessIds: draft.businessIds ?? saved.businessIds,
  }
  const businessIdsChanged =
    isYonetici &&
    (current.businessIds.length !== saved.businessIds.length ||
      current.businessIds.some((b) => !saved.businessIds.includes(b)))
  const dirty =
    current.role !== saved.role ||
    current.maasKurus !== saved.maasKurus ||
    current.odemeGunu !== saved.odemeGunu ||
    businessIdsChanged

  const anyModalOpen =
    roleModalOpen || avansModal.open || primModal.open || confirmMaas || confirmStatus
  const saveBusy = setRole.isPending || updatePay.isPending || setBusinessAccess.isPending

  const kalanKurus = current.maasKurus - cycleAvansKurus
  const disabled = member.profile.status === 'DISABLED'

  async function onSaveDraft() {
    setSaveError('')
    if (isYonetici && current.businessIds.length === 0) {
      setSaveError('En az bir işletme seçili olmalı.')
      return
    }
    try {
      if (current.role !== saved.role && isYonetici && !isSelf && current.role) {
        await setRole.mutateAsync({ profileId: id, role: current.role })
      }
      if (businessIdsChanged) {
        await setBusinessAccess.mutateAsync({ profileId: id, businessIds: current.businessIds })
      }
      if (current.maasKurus !== saved.maasKurus || current.odemeGunu !== saved.odemeGunu) {
        await updatePay.mutateAsync({
          profileId: id,
          businessId,
          maasKurus: current.maasKurus,
          odemeGunu: current.odemeGunu,
        })
      }
      setDraft({})
      setEditOpen(false)
      // access to this business revoked -> back to the roster with a note
      // naming the işletme(ler) the personel now belongs to
      if (businessIdsChanged && !current.businessIds.includes(businessId)) {
        const movedTo = businesses
          .filter((b) => current.businessIds.includes(b.id))
          .map((b) => b.name)
          .join(' ve ')
        void navigate('/yonetim/personel', { state: { movedTo } })
      }
    } catch {
      setSaveError('Kaydedilemedi. Tekrar deneyin.')
    }
  }

  async function onGivePrim() {
    setError('')
    // Paket seçiliyse tutar toplamdan + açıklama paket adları; yoksa elle giriş.
    const kurus = primPaketMode ? primPaketToplamKurus : parseTLToKurus(primModal.tutar)
    if (kurus === null || kurus <= 0) {
      setError('Geçerli bir tutar girin.')
      return
    }
    const note = primPaketMode
      ? primSelected.map((p) => p.name).join(', ')
      : primModal.note.trim()
    try {
      await givePrim.mutateAsync({ profileId: id, businessId, kurus, note })
      setPrimModal({ open: false, tutar: '', note: '', paketIds: [] })
    } catch {
      setError('Prim verilemedi. Tekrar deneyin.')
    }
  }

  async function onGiveAvans() {
    setError('')
    const kurus = parseTLToKurus(avansModal.tutar)
    if (kurus === null || kurus <= 0) {
      setError('Geçerli bir tutar girin.')
      return
    }
    try {
      await giveAvans.mutateAsync({
        profileId: id,
        businessId,
        kurus,
        note: avansModal.note.trim(),
      })
      setAvansModal({ open: false, tutar: '', note: '' })
    } catch {
      setError('Avans verilemedi. Tekrar deneyin.')
    }
  }

  async function onPayMaas() {
    try {
      await payMaas.mutateAsync({ profileId: id, businessId })
      setConfirmMaas(false)
    } catch {
      setConfirmMaas(false)
      setSaveError('Maaş ödenemedi. Tekrar deneyin.')
    }
  }

  async function onToggleStatus() {
    try {
      await setStatus.mutateAsync({
        profileId: id,
        status: disabled ? 'ACTIVE' : 'DISABLED',
      })
      setConfirmStatus(false)
    } catch {
      setConfirmStatus(false)
      setSaveError('Durum değiştirilemedi. Tekrar deneyin.')
    }
  }

  return (
    <div className="screen-forward">
      <div className="px-6 pt-4">
        <button
          type="button"
          onClick={() => void navigate('/yonetim/personel')}
          className="inline-flex cursor-pointer items-center gap-1 py-[6px]"
        >
          <BackChevron />
          <span className="text-[15px] font-medium text-ink">Geri</span>
        </button>
      </div>

      {/* Kimlik */}
      <div className="flex items-center gap-[14px] px-6 pt-3">
        <Avatar name={member.profile.full_name || '?'} size={60} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-[22px] font-bold tracking-[-0.3px] text-ink">
              {member.profile.full_name || 'İsimsiz'}
            </h1>
            {izindekiler.has(id) && (
              <span className="flex shrink-0 items-center gap-[5px]">
                <span className="h-[7px] w-[7px] rounded-full bg-warn" />
                <span className="text-[13px] font-semibold text-warn">İzinde</span>
              </span>
            )}
          </div>
          <div className="mt-[3px] flex items-center gap-2">
            <span className="text-sm text-muted">
              {disabled
                ? 'Devre dışı'
                : current.role
                  ? ROLE_LABELS[current.role]
                  : '—'}
            </span>
            {isYonetici && !isSelf && (
              <button
                type="button"
                onClick={() => setRoleModalOpen(true)}
                className="inline-flex cursor-pointer items-center gap-1 rounded-[8px] bg-field px-[10px] py-1"
              >
                <PencilIcon size={11} />
                <span className="text-xs font-semibold text-[#555]">Rol Değiştir</span>
              </button>
            )}
          </div>
        </div>
        {/* 048: kişinin izin ekranı (görüntüleme herkese; ekleme/silme
            kademeli — Muhasebe yalnızca Personel hedefte, RLS zorlar) */}
        <button
          type="button"
          onClick={() => void navigate(`/yonetim/personel/${id}/izinler`)}
          className="pressable flex shrink-0 cursor-pointer items-center gap-[7px] rounded-[12px] bg-field px-[14px] py-[10px]"
        >
          <CalendarBoxIcon size={16} color="var(--color-ink)" />
          <span className="text-[13.5px] font-semibold text-ink">Yıllık İzin</span>
        </button>
      </div>

      <div className="flex flex-col gap-4 px-6 pt-[22px]">
        {/* Aylık özet */}
        <div className="rounded-[18px] border border-[#EDEDED] bg-white p-[18px] shadow-[0_1px_2px_rgba(0,0,0,0.03),0_4px_12px_rgba(0,0,0,0.04)]">
          <div className="mb-3 text-[11px] font-bold tracking-[0.6px] text-faint">
            {gun > 0 ? `DÖNEM: ${formatDateDots(cycleStart)} →` : monthLabel}
          </div>
          <div className="mb-[2px] flex items-center justify-between">
            <span className="text-[13px] text-muted">Maaş</span>
            <button
              type="button"
              onClick={() => setEditOpen((v) => !v)}
              className="cursor-pointer text-[13px] font-bold text-success"
            >
              {editOpen ? 'Kapat' : 'Düzenle'}
            </button>
          </div>
          <div className="text-[25px] font-bold tracking-[-0.5px] text-ink">
            {formatTL(current.maasKurus, { decimals: 2 })}
          </div>
          {cyclePrimKurus > 0 && (
            <div className="mt-[2px] text-[13px] font-bold text-success">
              +{formatTL(cyclePrimKurus)} prim
            </div>
          )}
          <div className="mt-1 text-xs text-muted">
            {current.odemeGunu > 0
              ? `Otomatik ödeme: ayın ${current.odemeGunu}'i`
              : 'Otomatik ödeme: kapalı'}
          </div>
          <div className="my-4 h-px bg-divider" />
          <div className="flex gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-[5px] text-xs text-muted">Verilen avans</div>
              <div className="text-lg font-bold text-warn">
                {formatTL(cycleAvansKurus, { decimals: 2 })}
              </div>
              <div className="mt-1 text-[11px] text-faint">Maaştan düşülecek</div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-[5px] text-xs text-muted">Kalan (ödenecek)</div>
              <div className="text-lg font-bold text-success">
                {formatTL(kalanKurus, { decimals: 2 })}
              </div>
            </div>
          </div>
        </div>

        {/* Düzenleme kartı */}
        {editOpen && (
          <div className="menu-in flex flex-col gap-4 rounded-[18px] border border-[#EDEDED] bg-white p-[18px] shadow-[0_1px_2px_rgba(0,0,0,0.03),0_4px_12px_rgba(0,0,0,0.04)]">
            <div>
              <div className="mb-2 text-[11px] font-bold tracking-[0.6px] text-faint">
                AYLIK MAAŞ (₺)
              </div>
              <input
                type="text"
                inputMode="decimal"
                value={current.maasKurus % 100 === 0 ? String(current.maasKurus / 100) : (current.maasKurus / 100).toFixed(2)}
                onChange={(e) => {
                  const kurus = parseTLToKurus(e.target.value)
                  setDraft((d) => ({ ...d, maasKurus: kurus ?? 0 }))
                }}
                className="w-full rounded-[12px] border-none bg-field px-[15px] py-[14px] text-base font-semibold text-ink outline-none"
              />
            </div>
            <div>
              <div className="mb-2 text-[11px] font-bold tracking-[0.6px] text-faint">
                OTOMATİK ÖDEME GÜNÜ
              </div>
              <GunDropdown
                value={current.odemeGunu}
                onChange={(gun) => setDraft((d) => ({ ...d, odemeGunu: gun }))}
                allowManual
              />
            </div>
            {isYonetici && !isSelf && (
              <div>
                <div className="mb-2 text-[11px] font-bold tracking-[0.6px] text-faint">
                  İŞLETME ERİŞİMİ
                </div>
                <div className="flex gap-2">
                  {businesses.map((b) => {
                    const selected = current.businessIds.includes(b.id)
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() =>
                          setDraft((d) => {
                            const cur = d.businessIds ?? saved.businessIds
                            return {
                              ...d,
                              businessIds: selected
                                ? cur.filter((x) => x !== b.id)
                                : [...cur, b.id],
                            }
                          })
                        }
                        className="flex-1 cursor-pointer rounded-[12px] border-[1.5px] py-[11px] text-center text-[13px] font-semibold"
                        style={{
                          background: selected ? 'var(--seg-on)' : 'var(--seg)',
                          borderColor: selected ? 'var(--seg-on)' : 'var(--seg)',
                          color: selected ? 'var(--seg-fg-on)' : 'var(--seg-fg)',
                        }}
                      >
                        {b.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Avanslar */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[11px] font-bold tracking-[0.6px] text-faint">AVANSLAR</div>
            <button
              type="button"
              onClick={() => {
                setError('')
                setAvansModal({ open: true, tutar: '', note: '' })
              }}
              className="flex cursor-pointer items-center gap-[5px] rounded-[10px] bg-ink px-3 py-[7px]"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.8" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span className="text-[13px] font-semibold text-white">Avans Ver</span>
            </button>
          </div>
          <OdemeList
            items={avanslar}
            empty="Henüz avans verilmedi."
            fallback="Avans"
            positive={false}
          />
        </div>

        {/* Primler */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[11px] font-bold tracking-[0.6px] text-faint">PRİMLER</div>
            <button
              type="button"
              onClick={() => {
                setError('')
                setPrimModal({ open: true, tutar: '', note: '', paketIds: [] })
              }}
              className="flex cursor-pointer items-center gap-[5px] rounded-[10px] bg-success px-3 py-[7px]"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.8" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span className="text-[13px] font-semibold text-white">Prim Ver</span>
            </button>
          </div>
          <OdemeList
            items={primler}
            empty="Henüz prim verilmedi."
            fallback="Prim"
            positive
          />
        </div>

        {/* Maaş geçmişi */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[11px] font-bold tracking-[0.6px] text-faint">MAAŞ GEÇMİŞİ</div>
            <button
              type="button"
              onClick={() => setConfirmMaas(true)}
              disabled={current.maasKurus <= 0}
              className="cursor-pointer rounded-[10px] bg-field px-3 py-[7px] text-[13px] font-semibold text-ink disabled:opacity-50"
            >
              Maaş Öde
            </button>
          </div>
          <OdemeList
            items={maaslar}
            empty="Henüz maaş ödemesi yapılmadı."
            fallback="Maaş Ödemesi"
            positive
          />
        </div>

        {saveError && <p className="text-center text-sm text-danger">{saveError}</p>}

        {/* Hesap durumu — Yönetici, kendisi hariç */}
        {isYonetici && !isSelf && (
          <div className="pb-2 text-center">
            <button
              type="button"
              onClick={() => setConfirmStatus(true)}
              className={`cursor-pointer text-sm font-semibold ${disabled ? 'text-success' : 'text-danger'}`}
            >
              {disabled ? 'Hesabı Aktifleştir' : 'Hesabı Devre Dışı Bırak'}
            </button>
          </div>
        )}
      </div>
      <div className="h-24" />

      {/* Rol seç modal */}
      {roleModalOpen && (
        <div
          className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-8"
          onClick={() => setRoleModalOpen(false)}
        >
          <div
            className="modal-pop w-full max-w-[320px] rounded-[22px] bg-white px-5 pb-5 pt-[22px] shadow-[0_20px_50px_rgba(0,0,0,0.25)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold tracking-[-0.2px] text-ink">Rol Seç</h2>
            <div className="mb-4 mt-[3px] text-[13px] text-muted">Bu kişinin rolünü değiştirin</div>
            <div className="flex flex-col gap-2">
              {ROLE_OPTIONS.map((opt) => {
                const selected = current.role === opt.role
                return (
                  <button
                    key={opt.role}
                    type="button"
                    onClick={() => {
                      setDraft((d) => ({ ...d, role: opt.role }))
                      setRoleModalOpen(false)
                    }}
                    className="flex cursor-pointer items-center gap-[13px] rounded-[14px] border-[1.5px] px-4 py-[14px] text-left"
                    style={{
                      background: selected ? '#FAFAFA' : '#fff',
                      borderColor: selected ? 'var(--seg-on)' : 'var(--color-divider)',
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-bold text-ink">{opt.label}</div>
                      <div className="mt-[2px] text-xs text-muted">{opt.desc}</div>
                    </div>
                    {selected && (
                      <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-ink">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
            {/* Yönetici gets both businesses automatically */}
            {current.role !== 'YONETICI' && (
              <>
                <div className="mb-2 mt-4 text-[11px] font-bold tracking-[0.6px] text-faint">
                  İŞLETME ERİŞİMİ
                </div>
                <div className="flex gap-2">
                  {businesses.map((b) => {
                    const selected = current.businessIds.includes(b.id)
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() =>
                          setDraft((d) => {
                            const cur = d.businessIds ?? saved.businessIds
                            return {
                              ...d,
                              businessIds: selected
                                ? cur.filter((x) => x !== b.id)
                                : [...cur, b.id],
                            }
                          })
                        }
                        className="flex-1 cursor-pointer rounded-[12px] border-[1.5px] py-[11px] text-center text-[13px] font-semibold"
                        style={{
                          background: selected ? 'var(--seg-on)' : 'var(--seg)',
                          borderColor: selected ? 'var(--seg-on)' : 'var(--seg)',
                          color: selected ? 'var(--seg-fg-on)' : 'var(--seg-fg)',
                        }}
                      >
                        {b.name}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Avans modal */}
      <FormModal
        open={avansModal.open}
        title="Avans Ver"
        error={error}
        busy={giveAvans.isPending}
        confirmLabel="Ver"
        onConfirm={() => void onGiveAvans()}
        onClose={() => setAvansModal({ open: false, tutar: '', note: '' })}
      >
        <div>
          <div className={modalFieldLabel}>TUTAR (₺)</div>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={avansModal.tutar}
            onChange={(e) => setAvansModal((m) => ({ ...m, tutar: e.target.value }))}
            className={modalInputCls}
          />
        </div>
        <div>
          <div className={modalFieldLabel}>AÇIKLAMA</div>
          <input
            type="text"
            value={avansModal.note}
            onChange={(e) => setAvansModal((m) => ({ ...m, note: e.target.value }))}
            className={modalInputCls}
          />
        </div>
      </FormModal>

      {/* Prim modal */}
      <FormModal
        open={primModal.open}
        title="Prim Ver"
        error={error}
        busy={givePrim.isPending}
        confirmLabel="Ver"
        onConfirm={() => void onGivePrim()}
        onClose={() => setPrimModal({ open: false, tutar: '', note: '', paketIds: [] })}
      >
        {/* Paket seçici (050) — tutarın ÜSTÜNDE. Seçilenlerin tutarı canlı
            toplanır; hiç paket tanımlı değilse bu blok hiç görünmez. */}
        {primPaketler.length > 0 && (
          <div>
            <div className={modalFieldLabel}>PRİM PAKETLERİ</div>
            <div className="flex flex-wrap gap-2">
              {primPaketler.map((p) => {
                const selected = primModal.paketIds.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      setPrimModal((m) => ({
                        ...m,
                        paketIds: selected
                          ? m.paketIds.filter((x) => x !== p.id)
                          : [...m.paketIds, p.id],
                      }))
                    }
                    className="cursor-pointer rounded-[12px] border-[1.5px] px-3 py-2 text-[13px] font-semibold"
                    style={{
                      background: selected ? 'var(--seg-on)' : 'var(--seg)',
                      borderColor: selected ? 'var(--seg-on)' : 'var(--color-inputline)',
                      color: selected ? 'var(--seg-fg-on)' : 'var(--seg-fg)',
                    }}
                  >
                    {p.name} · {formatTL(numericStringToKurus(String(p.tutar)))}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div>
          <div className={modalFieldLabel}>TUTAR (₺)</div>
          {primPaketMode ? (
            // Paket seçiliyken tutar otomatik = paketlerin toplamı (salt okunur)
            <div className={`${modalInputCls} flex items-center justify-between`}>
              <span className="font-bold text-ink">{formatTL(primPaketToplamKurus)}</span>
              <span className="text-[11px] font-semibold text-faint">
                {primSelected.length} paket
              </span>
            </div>
          ) : (
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={primModal.tutar}
              onChange={(e) => setPrimModal((m) => ({ ...m, tutar: e.target.value }))}
              className={modalInputCls}
            />
          )}
        </div>

        {/* Açıklama yalnızca paket seçilmediğinde — paket seçiliyse işleme
            paket adları yazılır (050) */}
        {!primPaketMode && (
          <div>
            <div className={modalFieldLabel}>AÇIKLAMA</div>
            <input
              type="text"
              value={primModal.note}
              onChange={(e) => setPrimModal((m) => ({ ...m, note: e.target.value }))}
              className={modalInputCls}
            />
          </div>
        )}
      </FormModal>

      {/* Maaş öde onayı */}
      <ConfirmDialog
        open={confirmMaas}
        title="Maaş ödemesi"
        message={`${member.profile.full_name || 'Bu kişi'} için ${formatTL(saved.maasKurus)} maaş ödemesi yapılsın mı? Tutar onay beklemeden kasaya gider olarak işlenir.`}
        confirmLabel="Öde"
        busy={payMaas.isPending}
        onConfirm={() => void onPayMaas()}
        onCancel={() => setConfirmMaas(false)}
      />

      {/* Hesap durumu onayı */}
      <ConfirmDialog
        open={confirmStatus}
        title={disabled ? 'Hesabı aktifleştir' : 'Hesabı devre dışı bırak'}
        message={
          disabled
            ? `${member.profile.full_name || 'Bu kişi'} yeniden giriş yapabilecek.`
            : `${member.profile.full_name || 'Bu kişi'} uygulamaya erişemeyecek. İstediğinizde geri açabilirsiniz.`
        }
        confirmLabel={disabled ? 'Aktifleştir' : 'Devre Dışı Bırak'}
        danger={!disabled}
        busy={setStatus.isPending}
        onConfirm={() => void onToggleStatus()}
        onCancel={() => setConfirmStatus(false)}
      />

      {/* Kaydedilmemiş değişiklik — hidden while any modal is open */}
      {dirty && !anyModalOpen && (
        <FloatingSavePopup
          busy={saveBusy}
          onSave={() => void onSaveDraft()}
          onDiscard={() => {
            setDraft({})
            setSaveError('')
          }}
        />
      )}
    </div>
  )
}
