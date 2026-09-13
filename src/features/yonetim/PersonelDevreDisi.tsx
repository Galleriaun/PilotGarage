import { useNavigate } from 'react-router'
import { useAuth } from '../../app/providers/AuthProvider'
import { useBusiness } from '../../app/providers/BusinessProvider'
import { useAktifIzinProfilleri, useMembers } from './api'
import { MemberRow } from './MemberRow'
import { ScreenHeader, UsersIcon } from './shared'

/** Devre dışı kullanıcılar — Personel ekranından ayrıldı (owner 2026-09-13). */
export default function PersonelDevreDisi() {
  const navigate = useNavigate()
  const { profile: me } = useAuth()
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id ?? ''
  const isYonetici = me?.role === 'YONETICI'

  // Personel ekranıyla aynı sorgular (aynı query key → önbellekten gelir)
  const { data: members = [], isPending, isError } = useMembers(businessId)
  const { data: izindekiler = new Set<string>() } = useAktifIzinProfilleri(businessId)
  const devreDisi = members.filter((m) => m.profile.status === 'DISABLED')

  return (
    <div className="screen-forward">
      <ScreenHeader
        title="Devre Dışı"
        icon={<UsersIcon color="#888" />}
        iconBg="#F2F2F2"
        backTo="/yonetim/personel"
      />

      {isPending ? (
        <div className="flex justify-center py-14">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-divider border-t-ink" />
        </div>
      ) : isError ? (
        <div
          className="px-6 py-12 text-center text-sm font-semibold"
          style={{ color: 'var(--danger-on-soft)' }}
        >
          Personel yüklenemedi.
        </div>
      ) : devreDisi.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <div className="mb-[14px] flex h-[52px] w-[52px] items-center justify-center rounded-[16px] bg-field">
            <UsersIcon color="#ADADAD" size={24} />
          </div>
          <div className="mb-1 text-[15px] font-bold text-ink">Devre dışı kullanıcı yok</div>
          <div className="text-[13px] text-muted">
            Devre dışı bırakılan kullanıcılar burada görünür.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-[10px] px-6">
          {devreDisi.map((m) => (
            <MemberRow
              key={m.profile_id}
              member={m}
              izinde={izindekiler.has(m.profile_id)}
              maasGizli={!isYonetici}
              onOpen={() => void navigate(`/yonetim/personel/${m.profile_id}`)}
            />
          ))}
        </div>
      )}
      <div className="h-10" />
    </div>
  )
}
