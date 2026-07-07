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
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (loading) return <Splash />

  if (!session) {
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
    setError('')
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError('Şifre en az 8 karakter olmalı.')
      return
    }
    setSubmitting(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSubmitting(false)
    if (updateError) {
      setError('Şifre güncellenemedi. Tekrar deneyin.')
      return
    }
    void navigate('/', { replace: true })
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center px-[30px] pb-12 screen-forward">
      <h1 className="mb-9 text-center text-[28px] font-bold leading-[1.15] tracking-[-0.5px] text-ink">
        Yeni şifre belirle
      </h1>
      <form noValidate onSubmit={(e) => void onSubmit(e)} className="flex flex-col">
        <div className="relative mb-5">
          <input
            type={showPw ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Yeni şifre"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-[14px] border-none bg-field py-[17px] pl-[18px] pr-[50px] text-base text-ink outline-none placeholder:text-faint"
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
        {error && <p className="mb-3 text-center text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="pressable w-full cursor-pointer rounded-[14px] border-none bg-ink py-[18px] text-base font-semibold text-white disabled:opacity-60"
        >
          {submitting ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </form>
    </div>
  )
}
