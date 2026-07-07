import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../app/providers/AuthProvider'
import { Splash } from '../../app/guards'
import { BackChevron, EyeIcon } from './EyeIcon'

export default function SignUp() {
  const { session, loading } = useAuth()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  if (loading) return <Splash />
  if (session) return <Navigate to="/" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (fullName.trim().length < 2) {
      setError('Ad Soyad girin.')
      return
    }
    if (password.length < 8) {
      setError('Şifre en az 8 karakter olmalı.')
      return
    }
    setSubmitting(true)
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
      },
    })
    setSubmitting(false)
    if (signUpError) {
      setError('Kayıt başarısız. E-posta kullanımda olabilir — giriş yapmayı deneyin.')
      return
    }
    if (!data.session) {
      setDone(true) // email confirmation required
    }
    // if confirmation is disabled, session arrives -> <Navigate> redirects
    // and the pending gate takes over
  }

  if (done) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center px-[30px] pb-10 text-center screen-forward">
        <h1 className="mb-3 text-[26px] font-bold tracking-[-0.4px] text-ink">
          E-postanı doğrula
        </h1>
        <p className="mb-8 text-[15px] leading-relaxed text-muted">
          Doğrulama bağlantısı <span className="font-semibold text-ink">{email.trim()}</span>{' '}
          adresine gönderildi. Bağlantıya tıkladıktan sonra giriş yapabilirsin.
        </p>
        <Link to="/giris" className="text-[15px] font-semibold text-ink underline">
          Giriş yap
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col screen-forward">
      <div className="shrink-0 px-[30px] pt-4">
        <Link to="/giris" className="inline-flex items-center gap-1 py-[6px]">
          <BackChevron />
          <span className="text-[15px] font-medium text-ink">Geri</span>
        </Link>
      </div>
      <div className="flex flex-1 flex-col justify-center px-[30px] pb-10">
        <h1 className="mb-7 text-center text-[30px] font-bold leading-[1.15] tracking-[-0.5px] text-ink">
          Kayıt ol
        </h1>
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col">
          <div className="mb-6 flex flex-col gap-[10px]">
            <input
              type="text"
              autoComplete="name"
              placeholder="Ad Soyad"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="w-full rounded-[14px] border-none bg-field px-[18px] py-[17px] text-base text-ink outline-none placeholder:text-faint"
            />
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
                autoComplete="new-password"
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
                className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer opacity-40"
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
            {submitting ? 'Kayıt yapılıyor…' : 'Kayıt Ol'}
          </button>
        </form>
        <div className="mt-5 text-center">
          <span className="text-[15px] text-muted">Zaten hesabınız var mı? </span>
          <Link to="/giris" className="text-[15px] font-semibold text-ink underline">
            Giriş yap
          </Link>
        </div>
      </div>
    </div>
  )
}
