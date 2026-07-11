import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../../app/providers/AuthProvider'
import { disablePush, enablePush, getPushSubscription, pushSupported } from '../../lib/push'
import { isDarkMode, setDarkMode } from '../../lib/theme'
import { BackChevron } from '../auth/EyeIcon'
import { useNotifPrefs, useSaveProfile, type NotifPrefs } from './api'

const PREF_ROWS: { key: keyof NotifPrefs; label: string; desc: string }[] = [
  { key: 'kayit', label: 'Yeni kayıtlar', desc: 'Yeni araç kaydı oluşturulduğunda' },
  { key: 'onay', label: 'Onay bekleyen işlemler', desc: 'Yeni işlem onaya düştüğünde' },
  { key: 'silme', label: 'Kayıt silme istekleri', desc: 'Bir kayıt için silme istendiğinde' },
  { key: 'uyelik', label: 'Üyelik başvuruları', desc: 'Yeni kullanıcı kaydolduğunda' },
]

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className="relative h-[26px] w-[46px] shrink-0 cursor-pointer rounded-full transition-colors"
      style={{ background: on ? '#111' : '#D9D9D9' }}
    >
      <span
        className="absolute top-[3px] h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-all"
        style={{ left: on ? 23 : 3 }}
      />
    </button>
  )
}

export default function Ayarlar() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const profileId = profile?.id ?? ''
  // Personel only ever receives yeni-kayıt notifications — hide the rest
  const prefRows =
    profile?.role === 'PERSONEL' ? PREF_ROWS.filter((r) => r.key === 'kayit') : PREF_ROWS
  const { data: prefs = {} } = useNotifPrefs(profileId)
  const save = useSaveProfile()

  const [name, setName] = useState(profile?.full_name ?? '')
  const [nameMsg, setNameMsg] = useState('')
  const [dark, setDark] = useState(isDarkMode)

  const [pushOn, setPushOn] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushMsg, setPushMsg] = useState('')
  useEffect(() => {
    if (pushSupported() && Notification.permission === 'granted') {
      void getPushSubscription().then((sub) => setPushOn(Boolean(sub)))
    }
  }, [])

  async function onSaveName() {
    setNameMsg('')
    if (!name.trim()) {
      setNameMsg('Ad boş olamaz.')
      return
    }
    try {
      await save.mutateAsync({ profileId, fullName: name.trim() })
      setNameMsg('Kaydedildi.')
    } catch {
      setNameMsg('Kaydedilemedi. Tekrar deneyin.')
    }
  }

  function togglePref(key: keyof NotifPrefs) {
    const next = { ...prefs, [key]: prefs[key] === false }
    save.mutate({ profileId, notifPrefs: next })
  }

  async function togglePush() {
    setPushBusy(true)
    setPushMsg('')
    try {
      if (pushOn) {
        await disablePush()
        setPushOn(false)
      } else {
        const r = await enablePush(profileId)
        if (r === 'ok') setPushOn(true)
        else if (r === 'denied')
          setPushMsg('Bildirim izni reddedildi — tarayıcı/site ayarlarından açabilirsiniz.')
        else
          setPushMsg(
            "Bu cihaz desteklemiyor. iPhone'da önce uygulamayı ana ekrana ekleyin (iOS 16.4+).",
          )
      }
    } catch {
      setPushMsg('İşlem başarısız. Tekrar deneyin.')
    } finally {
      setPushBusy(false)
    }
  }

  return (
    <div className="screen-forward">
      <div className="px-6 pt-4">
        <button
          type="button"
          onClick={() => void navigate(-1)}
          className="inline-flex cursor-pointer items-center gap-1 py-[6px]"
        >
          <BackChevron />
          <span className="text-[15px] font-medium text-ink">Geri</span>
        </button>
      </div>

      <div className="px-6 pt-4">
        <h1 className="text-[26px] font-bold tracking-[-0.4px] text-ink">Ayarlar</h1>
      </div>

      <div className="flex flex-col gap-4 px-6 pt-5">
        {/* Hesap */}
        <div className="rounded-[18px] bg-card p-[18px]">
          <div className="mb-3 text-[11px] font-bold tracking-[0.6px] text-faint">HESAP</div>
          <div className="mb-[6px] text-[11px] font-bold tracking-[0.5px] text-faint">
            AD SOYAD
          </div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-[12px] border-none bg-white px-[14px] py-[13px] text-[15px] font-semibold text-ink outline-none"
          />
          {nameMsg && (
            <p
              className={`mt-2 text-[13px] ${nameMsg === 'Kaydedildi.' ? 'text-success' : 'text-danger'}`}
            >
              {nameMsg}
            </p>
          )}
          <button
            type="button"
            onClick={() => void onSaveName()}
            disabled={save.isPending}
            className="mt-3 w-full cursor-pointer rounded-[12px] bg-ink py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {save.isPending ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>

        {/* Görünüm */}
        <div className="rounded-[18px] bg-card p-[18px]">
          <div className="mb-3 text-[11px] font-bold tracking-[0.6px] text-faint">GÖRÜNÜM</div>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ink">Koyu mod</div>
              <div className="mt-[2px] text-xs text-muted">Karanlık tema kullan</div>
            </div>
            <Toggle
              on={dark}
              onClick={() => {
                const next = !dark
                setDarkMode(next)
                setDark(next)
              }}
            />
          </div>
        </div>

        {/* Bildirimler */}
        <div className="rounded-[18px] bg-card p-[18px]">
          <div className="mb-3 text-[11px] font-bold tracking-[0.6px] text-faint">
            BİLDİRİMLER
          </div>

          <div className="mb-1 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ink">Anlık bildirimler</div>
              <div className="mt-[2px] text-xs text-muted">
                {pushOn
                  ? 'Bu cihaza bildirim gönderilir'
                  : 'Uygulama kapalıyken de bildirim alın'}
              </div>
            </div>
            <div style={{ opacity: pushBusy ? 0.5 : 1 }}>
              <Toggle on={pushOn} onClick={() => !pushBusy && void togglePush()} />
            </div>
          </div>
          {pushMsg && <p className="mb-2 text-xs text-danger">{pushMsg}</p>}
          <div className="mb-4" />

          <div className="flex flex-col gap-4">
            {prefRows.map((r) => (
              <div key={r.key} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink">{r.label}</div>
                  <div className="mt-[2px] text-xs text-muted">{r.desc}</div>
                </div>
                <Toggle on={prefs[r.key] !== false} onClick={() => togglePref(r.key)} />
              </div>
            ))}
          </div>
        </div>

        {/* Çıkış */}
        <button
          type="button"
          onClick={() => void signOut()}
          className="w-full cursor-pointer rounded-[14px] bg-danger-soft py-4 text-[15px] font-semibold text-danger"
        >
          Çıkış Yap
        </button>
      </div>
      <div className="h-10" />
    </div>
  )
}
