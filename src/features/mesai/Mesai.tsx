import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useBusiness } from '../../app/providers/BusinessProvider'
import { formatCreatedStamp } from '../../lib/dates'
import { BackChevron } from '../auth/EyeIcon'
import {
  checkMesaiIp,
  mesaiGirisCikis,
  mesaiSuAnkiIp,
  useInvalidateMesai,
  useMyMesai,
} from './api'

type StepState = 'run' | 'ok' | 'err'
interface Step {
  text: string
  state: StepState
  /** true = konum adımı: çalışırken canlı hassasiyet (±m) alt satırda gösterilir */
  live?: boolean
}

/** Bu hassasiyette (±m) bir sabitleme geofence için güvenilir sayılır. */
const GOOD_ACCURACY_M = 50
/** Bundan kötüsü "yaklaşık" sayılır (Wi-Fi/baz istasyonu tahmini) — yine de
 *  gönderilir; mesafeye sunucu karar verir. Adım satırında işaretlenir. */
const MAX_ACCURACY_M = 100
/**
 * İyi bir sabitleme için beklenecek süre; sonra eldeki en iyisi kullanılır.
 * Soğuk başlayan bir GPS çipi kapalı alanda 15 sn'de çoğu kez kilitlenemiyordu;
 * ısıtma (aşağıdaki warm-up) çoğu denemede beklemeyi zaten sıfırladığı için
 * bu pencereyi uzatmanın algılanan maliyeti düşük.
 */
const WAIT_MS = 25000
/**
 * İlk sabitlemeden sonra bu süre boyunca DAHA İYİ bir sabitleme gelmezse
 * beklemeyi kes ve eldekiyle devam et. Kaba (Wi-Fi/baz istasyonu) tahminler
 * her saniye birebir aynı değerle tekrarlar — cihaz hassas konum vermeyecekse
 * 25 sn bekletmenin anlamı yok; iyileşme durduğunda erken pes edilir.
 */
const STALL_MS = 6000
/** Isıtmadan gelen sabitleme bu yaştan eskiyse artık güvenilmez. */
const FRESH_MS = 60000

/**
 * Konumu, HASSASİYETİ kabul edilebilir olana kadar bekleyerek alır.
 *
 * getCurrentPosition tek atış yapar: GPS kilitlenemediğinde (kapalı alan)
 * tarayıcı sessizce Wi-Fi/baz istasyonu tahminine düşer ve ±200 m'lik bir
 * konumu geçerliymiş gibi döndürür — kullanıcı binadayken "212 m uzakta"
 * denmesinin sebebi buydu. watchPosition ile sabitlemeler iyileştikçe
 * dinlenir, GOOD_ACCURACY_M'e ulaşan ilk sabitleme kullanılır; süre dolarsa
 * eldeki en iyisi döner (hassasiyeti run() ayrıca denetler).
 *
 * onProgress, her yeni "en iyi" sabitlemede çağrılır — kullanıcı ölü bir
 * spinner yerine hassasiyetin iyileştiğini görür (±212 m → ±40 m).
 */
function getPosition(onProgress?: (accuracy: number) => void): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    let best: GeolocationPosition | null = null
    let settled = false
    let stallTimer: ReturnType<typeof setTimeout> | undefined

    const stop = () => {
      settled = true
      navigator.geolocation.clearWatch(watchId)
      clearTimeout(timer)
      clearTimeout(stallTimer)
    }

    const timer = setTimeout(() => {
      if (settled) return
      stop()
      if (best) resolve(best)
      else reject({ code: 3, message: 'timeout' } as GeolocationPositionError)
    }, WAIT_MS)

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (settled) return
        if (!best || pos.coords.accuracy < best.coords.accuracy) {
          best = pos
          onProgress?.(Math.round(pos.coords.accuracy))
          // İyileşme durursa (kaba tahmin aynı değerle tekrarlıyorsa) tam
          // süreyi bekletme — eldeki en iyiyle erken dön.
          clearTimeout(stallTimer)
          stallTimer = setTimeout(() => {
            if (settled) return
            stop()
            resolve(best as GeolocationPosition)
          }, STALL_MS)
        }
        if (pos.coords.accuracy <= GOOD_ACCURACY_M) {
          stop()
          resolve(pos)
        }
      },
      (err) => {
        if (settled) return
        // hata gelse de elimizde bir sabitleme varsa onu kullan
        stop()
        if (best) resolve(best)
        else reject(err)
      },
      { enableHighAccuracy: true, timeout: WAIT_MS, maximumAge: 0 },
    )
  })
}

/**
 * Supabase RPC errors are PostgrestError objects, NOT Error instances — so
 * `err instanceof Error` misses them and the server's raised Turkish message
 * (e.g. "Konumunuz limitin dışında (300 m). İşletmeye yaklaşın.") gets lost.
 * Read `.message` off whatever shape we got.
 */
function rpcErrorText(err: unknown, fallback: string): string {
  const m = (err as { message?: unknown } | null)?.message
  return typeof m === 'string' && m.trim() !== '' ? m : fallback
}

function geoErrorText(err: unknown): string {
  const code = (err as GeolocationPositionError | undefined)?.code
  if (code === 1)
    return 'Konum izni kapalı. Ayarlar → Gizlilik ve Güvenlik → Konum Servisleri açık olmalı; ardından Safari Web Siteleri "Sor / Kullanırken" olmalı.'
  if (code === 2)
    return 'Konum alınamadı (sinyal yok). Kapalı alanda GPS zayıf olabilir; Wi-Fi açık olmalı ve tekrar deneyin.'
  if (code === 3) return 'Konum zaman aşımına uğradı — tekrar deneyin.'
  return 'Konum alınamadı veya izin reddedildi.'
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
  // true = konum izni cihazda kapalı/engelli → Ayarlar adımlarını göster
  const [blocked, setBlocked] = useState(false)
  // Isıtmadan gelen en iyi güncel sabitleme (ekran açıkken arka planda toplanır)
  const warmRef = useRef<GeolocationPosition | null>(null)
  // ±m — ısıtmanın durumu: butonun altında "GPS hazır" rozetini besler
  const [warmAcc, setWarmAcc] = useState<number | null>(null)
  // ±m — akış sırasında canlı hassasiyet: spinner yerine iyileşmeyi göster
  const [liveAcc, setLiveAcc] = useState<number | null>(null)

  // Best-effort ön kontrol: Permissions API destekleniyorsa (iOS'ta her zaman
  // değil) izin 'denied' ise panel daha dokunmadan görünür; asıl güvenilir
  // sinyal yine de aşağıdaki code === 1 hatasıdır.
  useEffect(() => {
    let live = true
    const perms = navigator.permissions
    if (!perms?.query) return
    perms
      .query({ name: 'geolocation' as PermissionName })
      .then((s) => {
        if (live) setBlocked(s.state === 'denied')
        s.onchange = () => setBlocked(s.state === 'denied')
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  /**
   * GPS ısıtma: ekran açıkken çip arka planda kilitlenmeye başlasın, böylece
   * kullanıcı dokunduğunda sabitleme çoktan hazır olur (soğuk başlangıçta
   * kapalı alanda kilitlenme 10-20 sn sürebiliyor — bekleyişin asıl sebebi bu).
   *
   * Yalnızca izin ZATEN verilmişse başlatılır. 'prompt' durumunda izin kutusunu
   * bir dokunuş olmadan açmak iOS'ta sessiz redde yol açar ve kullanıcı hiç
   * beklemediği bir kutuyu reddedebilir; o yüzden ilk izin isteği her zaman
   * run() içinde, dokunuş canlıyken yapılır. Permissions API'si olmayan
   * tarayıcılarda (iOS Safari) ısıtma yok — davranış eskisi gibi.
   */
  useEffect(() => {
    if (!('geolocation' in navigator)) return
    const perms = navigator.permissions
    if (!perms?.query) return

    let live = true
    let watchId: number | null = null
    let granted = false

    const stop = () => {
      if (watchId === null) return
      navigator.geolocation.clearWatch(watchId)
      watchId = null
    }

    const start = () => {
      if (!live || !granted || watchId !== null || document.hidden) return
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (!live) return
          // Eldekini yalnızca hem taze hem daha hassassa koru; aksi halde
          // yenisini al (bayat bir "iyi" sabitleme, taze bir kabadan kötüdür).
          const prev = warmRef.current
          const prevWins =
            prev !== null &&
            Date.now() - prev.timestamp <= FRESH_MS &&
            prev.coords.accuracy < pos.coords.accuracy
          if (!prevWins) {
            warmRef.current = pos
            setWarmAcc(Math.round(pos.coords.accuracy))
          }
        },
        () => {
          // ısıtma best-effort: sessizce vazgeç, asıl istek run() içinde
        },
        { enableHighAccuracy: true, maximumAge: 0 },
      )
    }

    // Ekran arka plandayken yüksek hassasiyetli GPS'i açık tutmak pili boşuna
    // yakar; görünür olunca yeniden ısıt (dönüşte sabitleme zaten tazelenir).
    const onVisibility = () => {
      if (document.hidden) stop()
      else start()
    }
    document.addEventListener('visibilitychange', onVisibility)

    perms
      .query({ name: 'geolocation' as PermissionName })
      .then((s) => {
        granted = s.state === 'granted'
        if (granted) start()
        // izin akış sırasında verilirse sonraki dokunuş için ısıtmayı başlat
        s.addEventListener('change', () => {
          granted = s.state === 'granted'
          if (granted) start()
          else stop()
        })
      })
      .catch(() => {})

    return () => {
      live = false
      document.removeEventListener('visibilitychange', onVisibility)
      stop()
    }
  }, [])

  const acik = kayitlar[0]?.tip === 'GIRIS'
  const tip: 'GIRIS' | 'CIKIS' = acik ? 'CIKIS' : 'GIRIS'
  const sonGiris = kayitlar.find((k) => k.tip === 'GIRIS')

  function push(step: Step) {
    setSteps((s) => [...s, step])
  }
  function replaceLast(state: StepState, text?: string) {
    setSteps((s) => {
      const last = s[s.length - 1]
      // last'ı yay: `live` gibi işaretler durum değişince düşmesin
      return [...s.slice(0, -1), { ...last, text: text ?? last.text, state }]
    })
  }

  async function run() {
    if (busy || !businessId) return

    // iOS only shows the geolocation prompt while the tap gesture is still
    // "live". getPosition MUST be the very first thing the handler does — even
    // a React state update before it can consume the gesture and then the
    // prompt silently never appears. So we fire it before any setState /
    // network work; its result is ignored if the office-network (static IP)
    // check succeeds first.
    //
    // Isıtma taze ve yeterince hassas bir sabitleme yakaladıysa yeni bir
    // watch başlatmaya gerek yok: kullanıcı hiç beklemez.
    const warm = warmRef.current
    const warmUsable =
      warm !== null &&
      Date.now() - warm.timestamp <= FRESH_MS &&
      warm.coords.accuracy <= GOOD_ACCURACY_M
        ? warm
        : null
    const posPromise = warmUsable
      ? Promise.resolve(warmUsable)
      : 'geolocation' in navigator
        ? getPosition(setLiveAcc)
        : null
    posPromise?.catch(() => {})

    setBusy(true)
    setSteps([])
    setBlocked(false)
    setLiveAcc(warmUsable ? Math.round(warmUsable.coords.accuracy) : null)

    try {
      push({ text: 'Ofis ağı (statik IP) kontrol ediliyor', state: 'run' })
      // IP'yi de paralel çek: ağ eşleşmezse ekranda görünür — yönetici,
      // tanımlı IP ile personelin gerçek IP'sini tek bakışta karşılaştırır
      const [ipOk, ip] = await Promise.all([checkMesaiIp(businessId), mesaiSuAnkiIp()])
      if (ipOk) {
        replaceLast('ok', 'Ofis ağında olduğunuz doğrulandı')
        await mesaiGirisCikis(businessId, tip, null, null)
        push({ text: tip === 'GIRIS' ? 'Giriş kaydedildi' : 'Çıkış kaydedildi', state: 'ok' })
        invalidate()
        return
      }
      replaceLast(
        'ok',
        ip ? `Ofis ağı bulunamadı (IP: ${ip}), konum kullanılacak` : 'Ofis ağı bulunamadı, konum kullanılacak',
      )

      if (!posPromise) {
        push({ text: 'Bu cihaz konum desteklemiyor', state: 'err' })
        return
      }

      push({
        text: warmUsable ? 'Konum hazır' : 'Konum alınıyor (izin isterse onaylayın)',
        state: 'run',
        live: true,
      })
      let pos: GeolocationPosition
      try {
        pos = await posPromise
      } catch (err) {
        // code 1 = izin engelli: tek satır hata yerine Ayarlar adım panelini aç
        if ((err as GeolocationPositionError | undefined)?.code === 1) {
          setBlocked(true)
          replaceLast('err', 'Konum izni kapalı')
          return
        }
        // Deneme sırasında hiç sabitleme gelmedi (zaman aşımı/sinyal yok) ama
        // ısıtma yakın zamanda bir sabitleme yakalamıştı — kaba da olsa onu
        // kullan. Kaba sabitlemeler artık gönderildiğine göre, eldeki taze bir
        // tahmini çöpe atıp "zaman aşımı" demek personeli boşuna kilitler.
        const yedek = warmRef.current
        if (yedek !== null && Date.now() - yedek.timestamp <= FRESH_MS) {
          pos = yedek
        } else {
          replaceLast('err', geoErrorText(err))
          return
        }
      }

      // Kaba (Wi-Fi/baz istasyonu) sabitleme de artık GÖNDERİLİR (owner kararı
      // 2026-07-16): hassas konum vermeyen cihazı istemcide engellemek personeli
      // tamamen kilitliyordu. Mesafe kontrolü zaten sunucuda — yaklaşık konum
      // yarıçapın dışına düşerse sunucu Türkçe mesajıyla reddeder.
      const dogruluk = Math.round(pos.coords.accuracy)
      replaceLast(
        'ok',
        `Konum alındı (±${dogruluk} m${dogruluk > MAX_ACCURACY_M ? ' — yaklaşık' : ''})`,
      )

      push({ text: 'İşletmeye uzaklık kontrol ediliyor', state: 'run' })
      try {
        const r = await mesaiGirisCikis(businessId, tip, pos.coords.latitude, pos.coords.longitude)
        replaceLast('ok', `İşletmeye ${r.mesafe_m ?? '—'} m — uygun`)
        push({ text: tip === 'GIRIS' ? 'Giriş kaydedildi' : 'Çıkış kaydedildi', state: 'ok' })
        invalidate()
      } catch (err) {
        // sunucunun mesajını göster (ör. "Konumunuz limitin dışında (… m)")
        replaceLast('err', rpcErrorText(err, 'İşlem yapılamadı'))
      }
    } catch (err) {
      push({ text: rpcErrorText(err, 'Bir hata oluştu'), state: 'err' })
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

        {/* Isıtmanın durumu: dokunmadan önce GPS'in hazır olduğunu göster.
            Yalnızca izin verilmiş cihazlarda ısıtma çalışır, o yüzden bu rozet
            yoksa akış eskisi gibi dokunuşta konum ister. */}
        {!busy && warmAcc !== null && (
          <div className="mt-[10px] flex items-center justify-center gap-[6px]">
            <span
              className="h-[6px] w-[6px] rounded-full"
              style={{
                background:
                  warmAcc <= GOOD_ACCURACY_M ? 'var(--color-success)' : 'var(--color-faint)',
              }}
            />
            <span
              className="text-[12px] font-medium"
              style={{
                color: warmAcc <= GOOD_ACCURACY_M ? 'var(--color-success)' : 'var(--color-faint)',
              }}
            >
              {warmAcc <= GOOD_ACCURACY_M
                ? `GPS hazır (±${warmAcc} m)`
                : `GPS hazırlanıyor (±${warmAcc} m)`}
            </span>
          </div>
        )}
      </div>

      {/* Konum izni engelliyse Ayarlar adımları (web uygulaması Ayarlar'ı
          kendisi açamaz — adımlar elle uygulanır) */}
      {blocked && (
        <div className="mx-6 mt-4 rounded-[18px] border border-[#F5C6C6] bg-[#FEF3F2] px-4 py-4">
          <div className="mb-1 flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C62828" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4.5 8-11a8 8 0 10-16 0c0 6.5 8 11 8 11z" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="15.5" x2="12.01" y2="15.5" />
            </svg>
            <span className="text-[14px] font-bold text-[#C62828]">Konum izni kapalı</span>
          </div>
          <p className="mb-3 text-[12.5px] leading-relaxed text-[#8a3a3a]">
            Konum tarayıcı/uygulama için kapalı. Açmak için telefon ayarlarından şu adımları
            izleyin, sonra bu ekrana dönüp tekrar deneyin:
          </p>
          <ol className="flex flex-col gap-2">
            {[
              'Ayarlar uygulamasını açın',
              'Gizlilik ve Güvenlik → Konum Servisleri (açık olmalı)',
              'Listeden PilotGarage (veya Safari Web Siteleri) → “Sor” ya da “Uygulamayı Kullanırken”',
              'Bu ekrana dönüp tekrar “Giriş Yap”a dokunun',
            ].map((t, i) => (
              <li key={i} className="flex items-start gap-[10px]">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#C62828] text-[11px] font-bold text-white">
                  {i + 1}
                </span>
                <span className="text-[12.5px] leading-relaxed text-ink">{t}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Doğrulama adımları — akış sırasında */}
      {steps.length > 0 && (
        <div className="mx-6 mt-4 rounded-[18px] bg-card px-4 py-4">
          <div className="flex flex-col gap-[14px]">
            {steps.map((s, i) => (
              <div key={i} className="flex items-start gap-3">
                <StepIcon state={s.state} />
                <div className="min-w-0 flex-1">
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
                  {/* Canlı hassasiyet: beklerken ölü spinner yerine ±m'nin
                      düştüğü görünür, yani "çalışıyor" hissi verir */}
                  {s.live && s.state === 'run' && liveAcc !== null && (
                    <div className="mt-[3px] text-[12px] font-medium text-faint">
                      ±{liveAcc} m{liveAcc > GOOD_ACCURACY_M ? ' — iyileştiriliyor…' : ''}
                    </div>
                  )}
                </div>
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
