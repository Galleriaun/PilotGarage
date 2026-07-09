import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAuth } from '../../app/providers/AuthProvider'
import { useBusiness } from '../../app/providers/BusinessProvider'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import FloatingSavePopup from '../../components/ui/FloatingSavePopup'
import { istanbulTodayISO, formatRelativeDate, TR_MONTHS_FULL } from '../../lib/dates'
import { formatTL, numericStringToKurus, parseTLToKurus } from '../../lib/money'
import type { Role } from '../../lib/types'
import { BackChevron } from '../auth/EyeIcon'
import {
  useGiveAvans,
  useMember,
  useMemberBusinessIds,
  usePayMaas,
  usePersonelOdemeler,
  useSetBusinessAccess,
  useSetRole,
  useSetStatus,
  useUpdateMemberPay,
} from './api'
import { ROLE_LABELS, ROLE_OPTIONS } from './types'
import {
  Avatar,
  FormModal,
  GunDropdown,
  PencilIcon,
  modalFieldLabel,
  modalInputCls,
} from './shared'

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
  const { data: savedBusinessIds = [] } = useMemberBusinessIds(id, isYonetici)

  const setRole = useSetRole()
  const updatePay = useUpdateMemberPay()
  const setBusinessAccess = useSetBusinessAccess()
  const giveAvans = useGiveAvans()
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
  const [confirmMaas, setConfirmMaas] = useState(false)
  const [confirmStatus, setConfirmStatus] = useState(false)
  const [error, setError] = useState('')
  const [saveError, setSaveError] = useState('')

  const today = istanbulTodayISO()
  const monthPrefix = today.slice(0, 7)
  const monthLabel = `${(TR_MONTHS_FULL[Number(today.slice(5, 7)) - 1] ?? '').toLocaleUpperCase('tr-TR')} ${today.slice(0, 4)}`

  const avanslar = useMemo(() => odemeler.filter((o) => o.tur === 'AVANS'), [odemeler])
  const maaslar = useMemo(() => odemeler.filter((o) => o.tur === 'MAAS'), [odemeler])
  const monthAvansKurus = useMemo(
    () =>
      avanslar
        .filter((a) => a.tarih.startsWith(monthPrefix))
        .reduce((sum, a) => sum + numericStringToKurus(String(a.tutar)), 0),
    [avanslar, monthPrefix],
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

  const anyModalOpen = roleModalOpen || avansModal.open || confirmMaas || confirmStatus
  const saveBusy = setRole.isPending || updatePay.isPending || setBusinessAccess.isPending

  const kalanKurus = current.maasKurus - monthAvansKurus
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
      // access to this business revoked -> back to the roster
      if (businessIdsChanged && !current.businessIds.includes(businessId)) {
        void navigate('/yonetim/personel')
      }
    } catch {
      setSaveError('Kaydedilemedi. Tekrar deneyin.')
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
        <div className="min-w-0">
          <h1 className="truncate text-[22px] font-bold tracking-[-0.3px] text-ink">
            {member.profile.full_name || 'İsimsiz'}
          </h1>
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
      </div>

      <div className="flex flex-col gap-4 px-6 pt-[22px]">
        {/* Aylık özet */}
        <div className="rounded-[18px] border border-[#EDEDED] bg-white p-[18px] shadow-[0_1px_2px_rgba(0,0,0,0.03),0_4px_12px_rgba(0,0,0,0.04)]">
          <div className="mb-3 text-[11px] font-bold tracking-[0.6px] text-faint">{monthLabel}</div>
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
                {formatTL(monthAvansKurus, { decimals: 2 })}
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
                          background: selected ? '#111' : '#F2F2F2',
                          borderColor: selected ? '#111' : '#F2F2F2',
                          color: selected ? '#fff' : '#888',
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
          {avanslar.length === 0 ? (
            <div className="rounded-[14px] bg-card p-[18px] text-center text-[13px] text-muted">
              Henüz avans verilmedi.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {avanslar.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-3 rounded-[14px] bg-card px-[15px] py-[13px]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink">
                      {a.note || 'Avans'}
                    </div>
                    <div className="mt-[2px] text-xs text-muted">{formatRelativeDate(a.tarih)}</div>
                  </div>
                  <div className="shrink-0 text-[15px] font-bold text-danger">
                    -{formatTL(numericStringToKurus(String(a.tutar)))}
                  </div>
                </div>
              ))}
            </div>
          )}
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
          {maaslar.length === 0 ? (
            <div className="rounded-[14px] bg-card p-[18px] text-center text-[13px] text-muted">
              Henüz maaş ödemesi yapılmadı.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {maaslar.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-3 rounded-[14px] bg-card px-[15px] py-[13px]"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink">Maaş Ödemesi</div>
                    <div className="mt-[2px] text-xs text-muted">{formatRelativeDate(m.tarih)}</div>
                  </div>
                  <div className="shrink-0 text-[15px] font-bold text-success">
                    +{formatTL(numericStringToKurus(String(m.tutar)))}
                  </div>
                </div>
              ))}
            </div>
          )}
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
                      borderColor: selected ? '#111' : '#EDEDED',
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
        <p className="text-xs leading-relaxed text-faint">
          Avans onay beklemeden kasaya gider olarak işlenir.
        </p>
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
