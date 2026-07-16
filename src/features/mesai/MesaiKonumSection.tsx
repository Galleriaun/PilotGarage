import { useEffect, useState } from 'react'
import { mesaiSuAnkiIp, useMesaiKonum, useSaveMesaiKonum } from './api'

/** Mesai konum/IP config card for İşletme Ayarları (finance). */
export default function MesaiKonumSection({ businessId }: { businessId: string }) {
  const { data: konum } = useMesaiKonum(businessId)
  const save = useSaveMesaiKonum()

  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [yaricap, setYaricap] = useState('300')
  const [ipler, setIpler] = useState('')
  const [msg, setMsg] = useState('')
  const [geoMsg, setGeoMsg] = useState('')
  // bu cihazın sunucu tarafından görülen IP'si — tek dokunuşla listeye eklenir
  const [myIp, setMyIp] = useState('')

  useEffect(() => {
    let live = true
    void mesaiSuAnkiIp().then((ip) => {
      if (live) setMyIp(ip)
    })
    return () => {
      live = false
    }
  }, [])

  // hydrate once when the query resolves
  useEffect(() => {
    if (!konum) return
    setLat(konum.konum_lat != null ? String(konum.konum_lat) : '')
    setLng(konum.konum_lng != null ? String(konum.konum_lng) : '')
    setYaricap(String(konum.konum_yaricap_m ?? 300))
    setIpler((konum.statik_ipler ?? []).join(', '))
  }, [konum])

  const ipListesi = ipler
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const myIpEkli = myIp !== '' && ipListesi.includes(myIp)

  function addMyIp() {
    if (!myIp || myIpEkli) return
    setIpler(ipListesi.concat(myIp).join(', '))
  }

  function useMyLocation() {
    setGeoMsg('')
    if (!('geolocation' in navigator)) {
      setGeoMsg('Tarayıcı konum desteklemiyor.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6))
        setLng(pos.coords.longitude.toFixed(6))
        setGeoMsg('Konum alındı.')
      },
      () => setGeoMsg('Konum alınamadı veya izin reddedildi.'),
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  async function onSave() {
    setMsg('')
    const latN = lat.trim() ? Number(lat) : null
    const lngN = lng.trim() ? Number(lng) : null
    const yaricapN = Number(yaricap)
    if ((latN !== null && Number.isNaN(latN)) || (lngN !== null && Number.isNaN(lngN))) {
      setMsg('Geçerli bir konum girin.')
      return
    }
    if ((latN === null) !== (lngN === null)) {
      setMsg('Enlem ve boylamı birlikte girin.')
      return
    }
    if (!Number.isInteger(yaricapN) || yaricapN < 10 || yaricapN > 100000) {
      setMsg('Yarıçap 10–100000 m arasında olmalı.')
      return
    }
    const list = ipler
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    try {
      await save.mutateAsync({
        businessId,
        konum_lat: latN,
        konum_lng: lngN,
        konum_yaricap_m: yaricapN,
        statik_ipler: list,
      })
      setMsg('Kaydedildi ✓')
      setTimeout(() => setMsg(''), 2000)
    } catch {
      setMsg('Kaydedilemedi. Tekrar deneyin.')
    }
  }

  const inputCls =
    'w-full rounded-[12px] border-none bg-field px-[14px] py-[11px] text-sm text-ink outline-none placeholder:text-faint'

  return (
    <div>
      <div className="mb-2 text-[11px] font-bold tracking-[0.6px] text-[#666]">
        MESAI — KONUM & IP
      </div>
      <p className="mb-3 text-[12px] leading-relaxed text-muted">
        Personelin giriş/çıkış yapabilmesi için işletme konumunu ve izin verilen mesafeyi ayarlayın.
        İsteğe bağlı olarak ofis internetinin statik IP'sini ekleyin (o ağdaki personel konumsuz geçer).
      </p>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="decimal"
            placeholder="Enlem (lat)"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            className={inputCls}
          />
          <input
            type="text"
            inputMode="decimal"
            placeholder="Boylam (lng)"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            className={inputCls}
          />
        </div>
        <button
          type="button"
          onClick={useMyLocation}
          className="cursor-pointer rounded-[12px] bg-card py-[11px] text-sm font-semibold text-ink"
        >
          Bulunduğum konumu kullan
        </button>
        {geoMsg && <p className="text-[12px] text-muted">{geoMsg}</p>}

        <div>
          <div className="mb-[6px] mt-1 text-[11px] font-bold tracking-[0.5px] text-faint">
            İZİN VERİLEN MESAFE (metre)
          </div>
          <input
            type="number"
            inputMode="numeric"
            value={yaricap}
            onChange={(e) => setYaricap(e.target.value)}
            className={inputCls}
          />
        </div>

        <div>
          <div className="mb-[6px] mt-1 text-[11px] font-bold tracking-[0.5px] text-faint">
            OFİS AĞI IP'LERİ (virgülle ayırın, isteğe bağlı)
          </div>
          <input
            type="text"
            placeholder="örn. 88.240.1.10, 88.240.1.11"
            value={ipler}
            onChange={(e) => setIpler(e.target.value)}
            className={inputCls}
          />
          {/* Tek dokunuşla ofis ağı kaydı: ofis Wi-Fi'sindeyken bu cihazın
              IP'si eklenir — personel o ağdayken giriş/çıkış GPS gerektirmez */}
          {myIp && (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-[12px] bg-card px-3 py-[9px]">
              <span className="min-w-0 truncate text-[12.5px] text-muted">
                Bu ağın IP'si: <span className="font-semibold text-ink">{myIp}</span>
              </span>
              {myIpEkli ? (
                <span className="shrink-0 text-[12px] font-semibold text-success">✓ Listede</span>
              ) : (
                <button
                  type="button"
                  onClick={addMyIp}
                  className="shrink-0 cursor-pointer rounded-[9px] bg-ink px-3 py-[6px] text-[12px] font-semibold text-white"
                >
                  Bu ağı ekle
                </button>
              )}
            </div>
          )}
          <p className="mt-[6px] text-[11.5px] leading-relaxed text-faint">
            Ofis Wi-Fi'sine bağlıyken "Bu ağı ekle"ye dokunup kaydedin — o ağdaki personel
            giriş/çıkışta konuma hiç ihtiyaç duymaz. İnternet sağlayıcınız IP'yi değiştirirse
            (ör. modem yeniden başlatılınca) buraya dönüp yeni IP'yi eklemeniz yeterli.
          </p>
        </div>

        {msg && (
          <p className={`text-[13px] ${msg.includes('✓') ? 'text-success' : 'text-danger'}`}>
            {msg}
          </p>
        )}
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={save.isPending}
          className="mt-1 w-full cursor-pointer rounded-[12px] bg-ink py-[11px] text-sm font-semibold text-white disabled:opacity-60"
        >
          {save.isPending ? 'Kaydediliyor…' : 'Mesai Ayarını Kaydet'}
        </button>
      </div>
    </div>
  )
}
