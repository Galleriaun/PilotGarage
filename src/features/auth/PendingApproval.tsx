import { useState } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '../../app/providers/AuthProvider'

export default function PendingApproval() {
  const { profile, refreshProfile, signOut } = useAuth()
  const [checking, setChecking] = useState(false)

  // Approved in the meantime? Straight in.
  if (profile && profile.status === 'ACTIVE' && profile.role !== null) {
    return <Navigate to="/" replace />
  }

  const disabled = profile?.status === 'DISABLED'

  async function onRefresh() {
    setChecking(true)
    await refreshProfile()
    setChecking(false)
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col items-center justify-center px-[30px] pb-12 text-center screen-forward">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-field">
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#555"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </div>
      <h1 className="mb-3 text-[24px] font-bold tracking-[-0.4px] text-ink">
        {disabled ? 'Hesabınız devre dışı' : 'Hesabınız onay bekliyor'}
      </h1>
      <p className="mb-10 max-w-[300px] text-[15px] leading-relaxed text-muted">
        {disabled
          ? 'Bu hesap devre dışı bırakıldı. Detaylar için yöneticinizle iletişime geçin.'
          : 'Yönetici hesabınızı onayladığında kullanmaya başlayabilirsiniz.'}
      </p>
      {!disabled && (
        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={checking}
          className="pressable mb-4 w-full cursor-pointer rounded-[14px] bg-ink py-[16px] text-base font-semibold text-white disabled:opacity-60"
        >
          {checking ? 'Kontrol ediliyor…' : 'Durumu Yenile'}
        </button>
      )}
      <button
        type="button"
        onClick={() => void signOut()}
        className="cursor-pointer text-sm text-faint"
      >
        Çıkış yap
      </button>
    </div>
  )
}
