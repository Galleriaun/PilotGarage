import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../app/providers/AuthProvider'
import { Splash } from '../../app/guards'
import { EyeIcon } from './EyeIcon'

export default function SignIn() {
  const { session, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (loading) return <Splash />
  if (session) return <Navigate to="/" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    setSubmitting(true)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setSubmitting(false)
    if (signInError) {
      setError('E-posta veya şifre hatalı.')
    }
    // success: session updates -> the <Navigate> above redirects
  }

  async function onForgotPassword() {
    setError('')
    setInfo('')
    if (!email.trim()) {
      setError('Şifre sıfırlama için önce e-postanızı girin.')
      return
    }
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}sifre-yenile`,
    })
    if (resetError) {
      setError('Şifre sıfırlama e-postası gönderilemedi. Tekrar deneyin.')
    } else {
      setInfo('Şifre sıfırlama bağlantısı e-postanıza gönderildi.')
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center px-[30px] pb-12 screen-forward">
      <h1 className="mb-9 text-center text-[32px] font-bold leading-[1.15] tracking-[-0.5px] text-ink">
        Giriş yap
      </h1>
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col">
        <div className="mb-[10px] flex flex-col gap-[10px]">
          <input
            type="email"
            autoComplete="email"
            placeholder="E-posta"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-[14px] border-none bg-field px-[18px] py-[17px] text-base text-ink outline-none placeholder:text-faint"
          />
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Şifre"
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
        </div>
        <div className="mb-5 text-right">
          <button
            type="button"
            onClick={() => void onForgotPassword()}
            className="cursor-pointer text-sm text-muted"
          >
            Şifremi unuttum
          </button>
        </div>
        {error && <p className="mb-3 text-center text-sm text-danger">{error}</p>}
        {info && <p className="mb-3 text-center text-sm text-success">{info}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="pressable w-full cursor-pointer rounded-[14px] border-none bg-ink py-[18px] text-base font-semibold tracking-[-0.1px] text-white disabled:opacity-60"
        >
          {submitting ? 'Giriş yapılıyor…' : 'Giriş Yap'}
        </button>
      </form>
      <div className="pt-8 text-center">
        <span className="text-[15px] text-muted">Hesabınız yok mu? </span>
        <Link to="/kayit-ol" className="text-[15px] font-semibold text-ink underline">
          Kayıt ol
        </Link>
      </div>
    </div>
  )
}
