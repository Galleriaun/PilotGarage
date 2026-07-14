import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useBusiness } from '../../app/providers/BusinessProvider'
import { formatCreatedStamp } from '../../lib/dates'
import { BackChevron } from '../auth/EyeIcon'
import {
  checkMesaiIp,
  mesaiGirisCikis,
  useInvalidateMesai,
  useMyMesai,
} from './api'

type StepState = 'run' | 'ok' | 'err'
interface Step {
  text: string
  state: StepState
}

/** Browser geolocation as a promise. */
function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    })
  })
}

function geoErrorText(err: unknown): string {
  const code = (err as GeolocationPositionError | undefined)?.code
  if (code === 1)
    return 'Konum izni reddedildi — telefon ayarlarından tarayıcıya/uygulamaya konum izni verin'
  if (code === 2) return 'Konum belirlenemedi — GPS sinyali alınamıyor'
  if (code === 3) return 'Konum alınamadı (zaman aşımı) — tekrar deneyin'
  return 'Konum alınamadı veya izin reddedildi'
}

function StepIcon({ state }: { state: StepState }) {
  if (state === 'run') {
    return (
      <span className="flex h-5 w-5 items-center justify-center">
        <span className="h-[14px] w-[14px] animate-spin rounded-full border-2 border-divider border-t-ink" />
      </span>
    )
  }
  if (state === 'ok') {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    )
  }
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-danger">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </span>
  )
}

export default function Mesai() {
  const navigate = useNavigate()
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id ?? ''
  const { data: kayitlar = [] } = useMyMesai(businessId)
  const invalidate = useInvalidateMesai()

  const [steps, setSteps] = useState<Step[]>([])
  const [busy, setBusy] = useState(false)

  const acik = kayitlar[0]?.tip === 'GIRIS'
  const tip: 'GIRIS' | 'CIKIS' = acik ? 'CIKIS' : 'GIRIS'
  const sonGiris = kayitlar.find((k) => k.tip === 'GIRIS')

  function push(step: Step) {
    setSteps((s) => [...s, step])
  }
  function replaceLast(state: StepState, text?: string) {
    setSteps((s) => {
      const last = s[s.length - 1]
      return [...s.slice(0, -1), { text: text ?? last.text, state }]
    })
  }

  async function run() {
    if (busy || !businessId) return
    setBusy(true)
    setSteps([])

    // The permission prompt only appears while the tap gesture is still
    // "live" (iOS home-screen PWAs enforce this strictly). Waiting for the
    // IP check's network round-trip kills the gesture and geolocation is
    // then rejected without ever asking — so the position request starts
    // immediately on tap and its result is ignored if the office network
    // check succeeds first.
    const posPromise = 'geolocation' in navigator ? getPosition() : null
    posPromise?.catch(() => {})

    try {
      push({ text: 'Ofis ağı (statik IP) kontrol ediliyor', state: 'run' })
      const ipOk = await checkMesaiIp(businessId)
      if (ipOk) {
        replaceLast('ok', 'Ofis ağında olduğunuz doğrulandı')
        await mesaiGirisCikis(businessId, tip, null, null)
        push({ text: tip === 'GIRIS' ? 'Giriş kaydedildi' : 'Çıkış kaydedildi', state: 'ok' })
        invalidate()
        return
      }
      replaceLast('ok', 'Ofis ağı bulunamadı, konum kullanılacak')

      if (!posPromise) {
        push({ text: 'Bu cihaz konum desteklemiyor', state: 'err' })
        return
      }

      push({ text: 'Konum alınıyor (izin isterse onaylayın)', state: 'run' })
      let pos: GeolocationPosition
      try {
        pos = await posPromise
      } catch (err) {
        replaceLast('err', geoErrorText(err))
        return
      }
      replaceLast('ok', 'Konum alındı')

      push({ text: 'İşletmeye uzaklık kontrol ediliyor', state: 'run' })
      try {
        const r = await mesaiGirisCikis(businessId, tip, pos.coords.latitude, pos.coords.longitude)
        replaceLast('ok', `İşletmeye ${r.mesafe_m ?? '—'} m — uygun`)
        push({ text: tip === 'GIRIS' ? 'Giriş kaydedildi' : 'Çıkış kaydedildi', state: 'ok' })
        invalidate()
      } catch (err) {
        replaceLast('err', err instanceof Error ? err.message : 'İşlem yapılamadı')
      }
    } catch (err) {
      push({ text: err instanceof Error ? err.message : 'Bir hata oluştu', state: 'err' })
    } finally {
      setBusy(false)
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

      <div className="px-6 pt-3">
        <h1 className="text-[26px] font-bold tracking-[-0.4px] text-ink">Mesai</h1>
        <p className="mt-1 text-[14px] text-muted">Giriş ve çıkışınızı buradan kaydedin</p>
      </div>

      {/* Durum kartı */}
      <div className="mx-6 mt-5">
        <div
          className="rounded-[22px] px-5 py-6"
          style={{
            background: acik
              ? 'linear-gradient(150deg,#166534,#0f3d20)'
              : 'linear-gradient(150deg,#1C1C1E,#0A0A0A)',
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="h-[9px] w-[9px] rounded-full"
              style={{ background: acik ? '#4ADE80' : '#9a9aa1' }}
            />
            <span className="text-xs font-semibold tracking-[0.4px] text-white/55">
              {acik ? 'MESAİDESİNİZ' : 'MESAİDE DEĞİLSİNİZ'}
            </span>
          </div>
          <div className="mt-2 text-[22px] font-bold tracking-[-0.4px] text-white">
            {acik ? 'Şu an aktif mesai' : 'Mesai başlatılmadı'}
          </div>
          <div className="mt-1 text-[13px] text-white/50">
            {acik && sonGiris
              ? `Giriş: ${formatCreatedStamp(sonGiris.created_at)}`
              : 'Giriş yaparak mesainizi başlatın'}
          </div>
        </div>
      </div>

      {/* Aksiyon */}
      <div className="px-6 pt-4">
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className="pressable flex w-full cursor-pointer items-center justify-center gap-2 rounded-[16px] py-[18px] text-[17px] font-bold text-white disabled:opacity-60"
          style={{ background: acik ? '#C62828' : '#15803D' }}
        >
          {busy ? (
            <span className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              {acik ? (
                <>
                  <path d="M16 17l5-5-5-5" /><path d="M21 12H9" />
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                </>
              ) : (
                <>
                  <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" />
                  <path d="M10 17l5-5-5-5" /><path d="M15 12H3" />
                </>
              )}
            </svg>
          )}
          {busy ? 'Kontrol ediliyor…' : acik ? 'Çıkış Yap' : 'Giriş Yap'}
        </button>
      </div>

      {/* Doğrulama adımları — akış sırasında */}
      {steps.length > 0 && (
        <div className="mx-6 mt-4 rounded-[18px] bg-card px-4 py-4">
          <div className="flex flex-col gap-[14px]">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-3">
                <StepIcon state={s.state} />
                <span
                  className="text-[13.5px] font-medium"
                  style={{
                    color:
                      s.state === 'err'
                        ? 'var(--color-danger)'
                        : s.state === 'ok'
                          ? 'var(--color-ink)'
                          : 'var(--color-muted)',
                  }}
                >
                  {s.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Son hareketler */}
      {kayitlar.length > 0 && (
        <div className="px-6 pt-7">
          <div className="mb-2 text-[11px] font-bold tracking-[0.6px] text-faint">
            SON HAREKETLER
          </div>
          <div className="flex flex-col gap-2">
            {kayitlar.slice(0, 10).map((k) => (
              <div
                key={k.id}
                className="flex items-center gap-3 rounded-[14px] bg-card px-4 py-3"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: k.tip === 'GIRIS' ? '#15803D' : '#C62828' }}
                />
                <div className="min-w-0 flex-1">
                  <div
                    className="text-sm font-bold"
                    style={{ color: k.tip === 'GIRIS' ? '#15803D' : '#C62828' }}
                  >
                    {k.tip === 'GIRIS' ? 'Giriş' : 'Çıkış'}
                  </div>
                  <div className="mt-[1px] text-[11px] text-muted">
                    {k.kaynak === 'IP' ? 'Ofis ağı' : `Konum · ${k.mesafe_m ?? '—'} m`}
                  </div>
                </div>
                <div className="shrink-0 text-[13px] font-semibold text-soft">
                  {formatCreatedStamp(k.created_at)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="h-10" />
    </div>
  )
}
