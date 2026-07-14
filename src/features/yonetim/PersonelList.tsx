import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useAuth } from '../../app/providers/AuthProvider'
import { useBusiness } from '../../app/providers/BusinessProvider'
import { formatTL, numericStringToKurus, parseTLToKurus } from '../../lib/money'
import type { Profile, Role } from '../../lib/types'
import { useApproveSignup, useBekleyenIstekTurleri, useMembers, usePendingProfiles } from './api'
import { ROLE_LABELS, ROLE_OPTIONS, type IstekTur } from './types'
import {
  Avatar,
  FormModal,
  GunDropdown,
  ScreenHeader,
  UsersIcon,
  modalFieldLabel,
  modalInputCls,
} from './shared'

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

function ApproveSignupModal({
  profile,
  onClose,
}: {
  profile: Profile
  onClose: () => void
}) {
  const { businesses, activeBusiness } = useBusiness()
  const approveSignup = useApproveSignup()
  const [role, setRole] = useState<Role | null>(null)
  const [businessIds, setBusinessIds] = useState<string[]>(
    activeBusiness ? [activeBusiness.id] : [],
  )
  const [maas, setMaas] = useState('')
  const [gun, setGun] = useState<number | null>(0)
  const [error, setError] = useState('')

  function toggleBusiness(id: string) {
    setBusinessIds((cur) => (cur.includes(id) ? cur.filter((b) => b !== id) : [...cur, id]))
  }

  async function onApprove() {
    setError('')
    if (!role) {
      setError('Rol seçin.')
      return
    }
    if (role !== 'YONETICI' && businessIds.length === 0) {
      setError('En az bir işletme seçin.')
      return
    }
    const maasKurus = maas.trim() ? parseTLToKurus(maas) : 0
    if (maasKurus === null || maasKurus < 0) {
      setError('Geçerli bir maaş girin (boş bırakılabilir).')
      return
    }
    try {
      await approveSignup.mutateAsync({
        profileId: profile.id,
        role,
        businessIds,
        maasKurus,
        odemeGunu: gun ?? 0,
      })
      onClose()
    } catch {
      setError('Onaylanamadı. Tekrar deneyin.')
    }
  }

  return (
    <FormModal
      open
      title={`${profile.full_name || 'Kullanıcı'} — onayla`}
      error={error}
      busy={approveSignup.isPending}
      confirmLabel="Onayla"
      onConfirm={() => void onApprove()}
      onClose={onClose}
    >
      <div>
        <div className={modalFieldLabel}>ROL</div>
        <div className="flex flex-col gap-2">
          {ROLE_OPTIONS.map((opt) => {
            const selected = role === opt.role
            return (
              <button
                key={opt.role}
                type="button"
                onClick={() => setRole(opt.role)}
                className="flex cursor-pointer items-center gap-3 rounded-[14px] border-[1.5px] px-4 py-3 text-left"
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
      </div>

      {role !== 'YONETICI' && (
        <>
          <div>
            <div className={modalFieldLabel}>İŞLETME ERİŞİMİ</div>
            <div className="flex gap-2">
              {businesses.map((b) => {
                const selected = businessIds.includes(b.id)
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => toggleBusiness(b.id)}
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
          <div>
            <div className={modalFieldLabel}>AYLIK MAAŞ (₺) — İSTEĞE BAĞLI</div>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={maas}
              onChange={(e) => setMaas(e.target.value)}
              className={modalInputCls}
            />
          </div>
          <div>
            <div className={modalFieldLabel}>OTOMATİK ÖDEME GÜNÜ</div>
            <GunDropdown value={gun} onChange={setGun} allowManual />
          </div>
        </>
      )}
    </FormModal>
  )
}

export default function PersonelList() {
  const navigate = useNavigate()
  const { profile: me } = useAuth()
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id ?? ''
  const isYonetici = me?.role === 'YONETICI'

  const { data: members = [], isPending } = useMembers(businessId)
  const { data: pendingProfiles = [] } = usePendingProfiles(isYonetici)
  // red dot on the İstekler button when any istek is waiting (037)
  const { data: bekleyenIstek = new Set<IstekTur>() } = useBekleyenIstekTurleri(businessId)
  const [approving, setApproving] = useState<Profile | null>(null)

  // "Personel X işletmesine taşındı" — set when İşletme Erişimi removed this
  // business (PersonelDetay navigates here with the destination name)
  const location = useLocation()
  const movedTo = (location.state as { movedTo?: string } | null)?.movedTo
  const [toast, setToast] = useState<string | null>(
    movedTo ? `Personel ${movedTo} işletmesine taşındı.` : null,
  )
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  return (
    <div className="screen-forward">
      <ScreenHeader
        title="Personel"
        icon={<UsersIcon />}
        iconBg="#F0FDF4"
        backTo="/yonetim"
        right={
          <button
            type="button"
            onClick={() => void navigate('/yonetim/istekler')}
            className="pressable relative flex shrink-0 cursor-pointer items-center gap-[6px] rounded-[12px] bg-field px-[16px] py-[10px]"
          >
            <span className="text-[15px] font-semibold text-ink">İstekler</span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-ink"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            {bekleyenIstek.size > 0 && (
              <span className="absolute -right-[3px] -top-[3px] h-[11px] w-[11px] rounded-full border-2 border-white bg-[#E53935]" />
            )}
          </button>
        }
      />

      {toast && (
        <div className="menu-in mx-6 mb-4 rounded-[14px] bg-success-soft px-4 py-3 text-center text-[13px] font-semibold text-success">
          {toast}
        </div>
      )}

      {/* Onay bekleyen kayıtlar — Yönetici only */}
      {isYonetici && pendingProfiles.length > 0 && (
        <div className="px-6 pb-5">
          <div className="mb-2 text-[11px] font-bold tracking-[0.6px] text-faint">
            ONAY BEKLEYENLER
          </div>
          <div className="flex flex-col gap-[10px]">
            {pendingProfiles.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-[16px] bg-card px-4 py-[14px]">
                <Avatar name={p.full_name || '?'} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-bold text-ink">
                    {p.full_name || 'İsimsiz kullanıcı'}
                  </div>
                  <div className="mt-[2px] text-[13px] text-warn">Onay bekliyor</div>
                </div>
                <button
                  type="button"
                  onClick={() => setApproving(p)}
                  className="shrink-0 cursor-pointer rounded-[10px] bg-ink px-4 py-2 text-[13px] font-semibold text-white"
                >
                  Onayla
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {isPending ? (
        <div className="flex justify-center py-14">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-divider border-t-ink" />
        </div>
      ) : members.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <div className="mb-[14px] flex h-[52px] w-[52px] items-center justify-center rounded-[16px] bg-field">
            <UsersIcon color="#ADADAD" size={24} />
          </div>
          <div className="mb-1 text-[15px] font-bold text-ink">Henüz personel yok</div>
          <div className="text-[13px] text-muted">
            Kayıt olan kullanıcılar onaylandığında burada görünür.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-[10px] px-6">
          {members.map((m) => (
            <button
              key={m.profile_id}
              type="button"
              onClick={() => void navigate(`/yonetim/personel/${m.profile_id}`)}
              className="pressable flex w-full cursor-pointer items-center gap-3 rounded-[16px] bg-card px-4 py-[14px] text-left"
            >
              <Avatar name={m.profile.full_name || '?'} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-bold text-ink">
                  {m.profile.full_name || 'İsimsiz'}
                </div>
                <div className="mt-[2px] text-[13px] text-muted">
                  {m.profile.status === 'DISABLED'
                    ? 'Devre dışı'
                    : m.profile.role
                      ? ROLE_LABELS[m.profile.role]
                      : '—'}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-bold text-ink">
                  {formatTL(numericStringToKurus(String(m.maas)))}
                </div>
                <div className="mt-[2px] text-[11.5px] text-muted">
                  {m.odeme_gunu > 0 ? `Her ayın ${m.odeme_gunu}.` : 'Elle ödeme'}
                </div>
              </div>
              <ChevronRightSm />
            </button>
          ))}
        </div>
      )}
      <div className="h-10" />

      {approving && <ApproveSignupModal profile={approving} onClose={() => setApproving(null)} />}
    </div>
  )
}
