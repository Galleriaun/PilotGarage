import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../app/providers/AuthProvider'
import { Splash } from '../../app/guards'
import { MIN_PASSWORD_LENGTH } from '../../lib/validation'
import { EyeIcon } from './EyeIcon'

/**
 * Landing page of the password-recovery e-mail link. Supabase opens this
 * with a recovery session already established; without one the link is
 * invalid/expired.
 */
export default function ResetPassword() {
  const navigate = useNavigate()
  const { session, loading } = useAuth()
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [showPw2, setShowPw2] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // şifre güncellendi → onay pop-up'ı (Tamam → çıkış + giriş ekranı)
  const [done, setDone] = useState(false)
  const [leaving, setLeaving] = useState(false)

  if (loading) return <Splash />

  if (!session && !done) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col items-center justify-center px-[30px] text-center">
        <h1 className="mb-3 text-[24px] font-bold tracking-[-0.4px] text-ink">
          Bağlantı geçersiz
        </h1>
        <p className="mb-8 text-[15px] text-muted">
          Şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş.
        </p>
        <Link to="/giris" className="text-[15px] font-semibold text-ink underline">
          Giriş yap
        </Link>
      </div>
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError('')
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError('Şifre en az 8 karakter olmalı.')
      return
    }
    if (password !== password2) {
      setError('Şifreler eşleşmiyor.')
      return
    }
    setSubmitting(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSubmitting(false)
    if (updateError) {
      setError('Şifre güncellenemedi. Tekrar deneyin.')
      return
    }
    setDone(true)
  }

  // Tamam: kurtarma oturumunu kapat, giriş ekranına dön (yeni şifreyle giriş)
  async function onDone() {
    if (leaving) return
    setLeaving(true)
    try {
      await supabase.auth.signOut()
    } catch {
      // oturum zaten düşmüş olabilir — giriş ekranına gitmeye engel değil
    }
    void navigate('/giris', { replace: true })
  }

  const inputCls =
    'w-full rounded-[14px] border-none bg-field py-[17px] pl-[18px] pr-[50px] text-base text-ink outline-none placeholder:text-faint'

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center px-[30px] pb-12 screen-forward">
      <h1 className="mb-9 text-center text-[28px] font-bold leading-[1.15] tracking-[-0.5px] text-ink">
        Yeni şifre belirle
      </h1>
      <form noValidate onSubmit={(e) => void onSubmit(e)} className="flex flex-col">
        <div className="mb-5 flex flex-col gap-[10px]">
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Yeni şifre"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? 'Şifreyi gizle' : 'Şifreyi göster'}
              className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer opacity-45"
            >
              <EyeIcon />
            </button>
          </div>
          <div className="relative">
            <input
              type={showPw2 ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Şifreyi doğrula"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              required
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => setShowPw2((v) => !v)}
              aria-label={showPw2 ? 'Şifreyi gizle' : 'Şifreyi göster'}
              className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer opacity-45"
            >
              <EyeIcon />
            </button>
          </div>
        </div>
        {error && <p className="mb-3 text-center text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="pressable w-full cursor-pointer rounded-[14px] border-none bg-ink py-[18px] text-base font-semibold text-white disabled:opacity-60"
        >
          {submitting ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </form>

      {/* Başarı pop-up'ı — tek Tamam butonu, giriş ekranına götürür */}
      {done && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-8">
          <div className="modal-pop w-full max-w-[300px] rounded-[20px] bg-white px-[22px] py-6 text-center shadow-[0_20px_50px_rgba(0,0,0,0.25)]">
            <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-success">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            <div className="mb-2 text-[17px] font-bold text-ink">Şifre güncellendi</div>
            <p className="mb-5 text-sm leading-relaxed text-muted">
              Şifreniz başarıyla değiştirildi. Yeni şifrenizle giriş yapabilirsiniz.
            </p>
            <button
              type="button"
              onClick={() => void onDone()}
              disabled={leaving}
              className="w-full cursor-pointer rounded-[12px] bg-ink py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {leaving ? '…' : 'Tamam'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
