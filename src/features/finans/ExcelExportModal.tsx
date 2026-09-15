import { useRef, useState, type ReactNode } from 'react'
import { rpcErrorText } from '../../lib/errors'
import { istanbulTodayISO, shiftDaysISO } from '../../lib/dates'
import type { OdemeYontemi, Role } from '../../lib/types'
import { CheckSmallIcon, ChevronDownIcon } from '../kayit/icons'
import { FormModal } from '../yonetim/shared'
import { fetchIslemlerExcel } from './api'
import {
  excelDosyaAdi,
  excelOzet,
  excelSatirlari,
  excelTarihAraligi,
  type ExcelFiltre,
  type ExcelTarihSecimi,
} from './excel'
import { excelDosyasiOlustur, excelIndir } from './excelDosya'
import { ODEME_YONTEMI_LABELS, type IslemTur, type Kategori } from './types'

/** Özgün tablo simgesi (yeşil zemin + ızgara) — Microsoft'un Excel logosu kopyalanmadı. */
export function ExcelIcon() {
  return (
    <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-[#E8F5EC]">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3.5" y="3.5" width="17" height="17" rx="3" fill="#1E7B46" />
        <path
          d="M3.5 9.2h17M3.5 14.8h17M9.2 9.2v11.3M14.8 9.2v11.3"
          stroke="#FFFFFF"
          strokeWidth="1.4"
        />
      </svg>
    </div>
  )
}

const TARIH_SECENEKLERI: { key: ExcelTarihSecimi; label: string }[] = [
  { key: 'BUGUN', label: 'Bugün' },
  { key: 'SON_7', label: 'Son 7 gün' },
  { key: 'SON_30', label: 'Son 30 gün' },
  { key: 'OZEL', label: 'Tarih seç' },
]

const TUR_SECENEKLERI: { key: IslemTur | null; label: string }[] = [
  { key: null, label: 'Tümü' },
  { key: 'GELIR', label: 'Gelir' },
  { key: 'GIDER', label: 'Gider' },
]

const YONTEMLER: OdemeYontemi[] = ['NAKIT', 'KREDI_KARTI', 'HAVALE']

function Secenek({
  label,
  secili,
  onClick,
  className = '',
}: {
  label: string
  secili: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={secili}
      onClick={onClick}
      className={`cursor-pointer rounded-[10px] px-3 py-[8px] text-[13px] font-semibold disabled:cursor-default disabled:opacity-60 ${className}`}
      style={{
        background: secili ? 'var(--seg-on)' : 'var(--seg)',
        color: secili ? 'var(--seg-fg-on)' : 'var(--seg-fg)',
      }}
    >
      {label}
    </button>
  )
}

/** Açılır menü satırı — Gelir/Gider Ekle'nin kategori menüsüyle aynı görünüm. */
function MenuSatiri({ label, secili, onClick }: { label: string; secili: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={secili}
      onClick={onClick}
      className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-[10px] px-3 py-[10px] text-left text-sm font-semibold text-ink disabled:cursor-default disabled:opacity-60"
      style={{ background: secili ? 'var(--seg)' : 'transparent' }}
    >
      <span className="min-w-0">{label}</span>
      {secili && <CheckSmallIcon />}
    </button>
  )
}

function Bolum({ baslik, istege, children }: { baslik: string; istege?: boolean; children: ReactNode }) {
  return (
    <div>
      <div className="mb-[6px] text-[11px] font-bold uppercase tracking-[0.6px] text-faint">
        {baslik}
        {istege && <span className="font-semibold normal-case tracking-normal"> · isteğe bağlı</span>}
      </div>
      {children}
    </div>
  )
}

const dateInputCls =
  'block w-full min-w-0 appearance-none rounded-[12px] border-none bg-field px-[14px] py-[12px] text-base text-ink outline-none'

/**
 * Finans → Excel İndir. İki adım: "Excel Oluştur" (çek + dosya üret) → "İndir"
 * (yeni bir dokunuş — iOS share() için şart). Herhangi bir seçim değişince hazır
 * dosya ATILIR: ekrandaki süzgeçlerle uyuşmayan dosya asla indirilemez.
 */
export default function ExcelExportModal({
  open,
  businessId,
  isletmeAdi,
  role,
  olusturan,
  kategoriler,
  onClose,
}: {
  open: boolean
  businessId: string
  isletmeAdi: string
  role: Role | null
  olusturan: string
  kategoriler: Kategori[]
  onClose: () => void
}) {
  const [secim, setSecim] = useState<ExcelTarihSecimi | null>(null)
  const [ozel, setOzel] = useState({ baslangic: '', bitis: '' })
  const [tur, setTur] = useState<IslemTur | null>(null)
  const [yalnizcaKayit, setYalnizcaKayit] = useState(false)
  const [yontemler, setYontemler] = useState<OdemeYontemi[]>([])
  const [kategoriIdler, setKategoriIdler] = useState<string[]>([])
  const [kategoriAcik, setKategoriAcik] = useState(false)
  const [hazir, setHazir] = useState<{ file: File; sayi: number } | null>(null)
  const [bos, setBos] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // yürüyen bir oluşturma, seçim değişir ya da modal kapanırsa sonucunu yazmasın
  const istekRef = useRef(0)

  /** Her seçim değişikliğinde çağrılır: hazır dosya/sonuç mesajları geçersizleşir. */
  function degisti() {
    istekRef.current++
    setHazir(null)
    setBos(false)
    setBusy(false)
    setError('')
  }

  function kapat() {
    degisti()
    setSecim(null)
    setOzel({ baslangic: '', bitis: '' })
    setTur(null)
    setYalnizcaKayit(false)
    setYontemler([])
    setKategoriIdler([])
    setKategoriAcik(false)
    onClose()
  }

  function tarihSec(key: ExcelTarihSecimi) {
    degisti()
    setSecim(key)
    if (key === 'OZEL' && (ozel.baslangic === '' || ozel.bitis === '')) {
      const bugun = istanbulTodayISO()
      setOzel({ baslangic: shiftDaysISO(bugun, -29), bitis: bugun })
    }
  }

  function turSec(t: IslemTur | null) {
    degisti()
    setTur(t)
    // diğer türün kategorisi artık eşleşemez — sessizce boş dosya üretmesin
    if (t !== null) {
      setKategoriIdler((ids) => ids.filter((id) => kategoriler.find((k) => k.id === id)?.tur === t))
    }
  }

  function yontemDegistir(y: OdemeYontemi) {
    degisti()
    setYontemler((ys) => (ys.includes(y) ? ys.filter((x) => x !== y) : [...ys, y]))
  }

  function kategoriDegistir(id: string) {
    degisti()
    setKategoriIdler((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  }

  function kategorileriTemizle() {
    if (kategoriIdler.length === 0) return // değişiklik yok — hazır dosya boşuna atılmasın
    degisti()
    setKategoriIdler([])
  }

  async function onConfirm() {
    if (hazir) {
      // 2. adım: dokunuşun içinde — share() / indirme burada tetiklenir
      void excelIndir(hazir.file)
      kapat()
      return
    }
    setError('')
    setBos(false)
    if (secim === null) {
      setError('Tarih aralığı seçin.')
      return
    }
    const aralik = excelTarihAraligi(secim, ozel)
    if (!aralik) {
      setError('Geçerli bir tarih aralığı seçin (başlangıç, bitişten sonra olamaz).')
      return
    }
    const filtre: ExcelFiltre = { ...aralik, tur, yalnizcaKayit, yontemler, kategoriIdler }
    const istek = ++istekRef.current
    setBusy(true)
    try {
      const islemler = await fetchIslemlerExcel(businessId, filtre)
      if (istekRef.current !== istek) return
      const satirlar = excelSatirlari(islemler, filtre, role)
      if (satirlar.length === 0) {
        setBos(true)
        return
      }
      const file = await excelDosyasiOlustur({
        satirlar,
        ozet: excelOzet(satirlar),
        filtre,
        kategoriler,
        isletmeAdi,
        olusturan,
        dosyaAdi: excelDosyaAdi(isletmeAdi, aralik),
      })
      if (istekRef.current !== istek) return
      setHazir({ file, sayi: satirlar.length })
    } catch (err) {
      if (istekRef.current === istek) {
        setError(rpcErrorText(err, 'Excel oluşturulamadı. İnternet bağlantınızı kontrol edin.'))
      }
    } finally {
      if (istekRef.current === istek) setBusy(false)
    }
  }

  const gelirKategorileri = kategoriler.filter((k) => k.tur === 'GELIR')
  const giderKategorileri = kategoriler.filter((k) => k.tur === 'GIDER')
  const kategoriGruplari =
    tur === 'GELIR'
      ? [{ baslik: null, liste: gelirKategorileri }]
      : tur === 'GIDER'
        ? [{ baslik: null, liste: giderKategorileri }]
        : [
            { baslik: 'Gelir', liste: gelirKategorileri },
            { baslik: 'Gider', liste: giderKategorileri },
          ]
  const seciliKategoriAdlari = kategoriIdler
    .map((id) => kategoriler.find((k) => k.id === id)?.label)
    .filter((label): label is string => Boolean(label))

  return (
    <FormModal
      open={open}
      title="Excel İndir"
      error={error}
      busy={busy}
      confirmLabel={hazir ? 'İndir' : 'Excel Oluştur'}
      onConfirm={() => void onConfirm()}
      onClose={kapat}
    >
      {/* oluşturma sürerken seçimler kilitli — sonuç yazılırken süzgeç değişmesin */}
      <fieldset disabled={busy} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
        <Bolum baslik="Tarih aralığı">
          <div className="grid grid-cols-2 gap-2">
            {TARIH_SECENEKLERI.map((o) => (
              <Secenek key={o.key} label={o.label} secili={secim === o.key} onClick={() => tarihSec(o.key)} />
            ))}
          </div>
          {secim === 'OZEL' && (
            <div className="mt-2 flex flex-col gap-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-muted">Başlangıç</span>
                <input
                  type="date"
                  value={ozel.baslangic}
                  onChange={(e) => {
                    degisti()
                    setOzel((o) => ({ ...o, baslangic: e.target.value }))
                  }}
                  className={dateInputCls}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-muted">Bitiş</span>
                <input
                  type="date"
                  value={ozel.bitis}
                  onChange={(e) => {
                    degisti()
                    setOzel((o) => ({ ...o, bitis: e.target.value }))
                  }}
                  className={dateInputCls}
                />
              </label>
            </div>
          )}
        </Bolum>

        <Bolum baslik="Tür" istege>
          <div className="flex gap-2">
            {TUR_SECENEKLERI.map((o) => (
              <Secenek
                key={o.label}
                label={o.label}
                secili={tur === o.key}
                onClick={() => turSec(o.key)}
                className="flex-1 px-0"
              />
            ))}
          </div>
        </Bolum>

        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-ink">Yalnızca kayıt işlemleri</div>
            <div className="text-[11px] text-muted">Kayıttan doğan gelirler (KK komisyonu hariç)</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={yalnizcaKayit}
            aria-label="Yalnızca kayıt işlemleri"
            onClick={() => {
              degisti()
              setYalnizcaKayit((v) => !v)
            }}
            className="relative h-[26px] w-[46px] shrink-0 cursor-pointer rounded-full transition-colors disabled:cursor-default disabled:opacity-60"
            style={{ background: yalnizcaKayit ? '#111' : '#D9D9D9' }}
          >
            <span
              className="absolute top-[3px] h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-all"
              style={{ left: yalnizcaKayit ? 23 : 3 }}
            />
          </button>
        </div>

        <Bolum baslik="Ödeme yöntemi" istege>
          <div className="flex flex-wrap gap-2">
            {YONTEMLER.map((y) => (
              <Secenek
                key={y}
                label={ODEME_YONTEMI_LABELS[y]}
                secili={yontemler.includes(y)}
                onClick={() => yontemDegistir(y)}
              />
            ))}
          </div>
        </Bolum>

        {/* Açılır menü (Gelir/Gider Ekle'deki kategori seçicisiyle aynı desen) — çoklu
            seçim: satıra dokunmak seçimi değiştirir, menü açık kalır; kapatmak için
            açıcı butona yeniden dokunulur */}
        <Bolum baslik="Kategori" istege>
          <button
            type="button"
            aria-expanded={kategoriAcik}
            onClick={() => setKategoriAcik((v) => !v)}
            className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-[12px] bg-field px-[14px] py-[13px] text-left disabled:cursor-default disabled:opacity-60"
          >
            <span
              className="min-w-0 truncate text-[15px] font-medium"
              style={{ color: seciliKategoriAdlari.length > 0 ? '#111' : '#ADADAD' }}
            >
              {seciliKategoriAdlari.length > 0 ? seciliKategoriAdlari.join(', ') : 'Tüm kategoriler'}
            </span>
            <ChevronDownIcon size={12} color="#888" rotated={kategoriAcik} />
          </button>
          {kategoriAcik && (
            <div className="menu-in mt-[6px] rounded-[14px] bg-card p-[6px]">
              {kategoriGruplari.every((g) => g.liste.length === 0) ? (
                <div className="px-3 py-[10px] text-sm text-muted">Kategori yok.</div>
              ) : (
                <>
                  <MenuSatiri
                    label="Tüm kategoriler"
                    secili={kategoriIdler.length === 0}
                    onClick={kategorileriTemizle}
                  />
                  {kategoriGruplari.map(
                    (g) =>
                      g.liste.length > 0 && (
                        <div key={g.baslik ?? 'tek'}>
                          {g.baslik && (
                            <div className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.6px] text-faint">
                              {g.baslik}
                            </div>
                          )}
                          {g.liste.map((k) => (
                            <MenuSatiri
                              key={k.id}
                              label={k.label}
                              secili={kategoriIdler.includes(k.id)}
                              onClick={() => kategoriDegistir(k.id)}
                            />
                          ))}
                        </div>
                      ),
                  )}
                </>
              )}
            </div>
          )}
        </Bolum>
      </fieldset>

      {bos && (
        <p className="rounded-[12px] bg-field px-3 py-[10px] text-center text-[13px] text-soft">
          Bu filtrelerle işlem bulunamadı.
        </p>
      )}
      {hazir && (
        <div className="rounded-[12px] bg-field px-3 py-[10px]">
          <div className="text-[13px] font-semibold text-ink">{hazir.sayi} işlem hazır</div>
          <div className="mt-[2px] break-all text-[11px] text-soft">{hazir.file.name}</div>
        </div>
      )}
    </FormModal>
  )
}
