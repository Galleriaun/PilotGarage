import { useEffect, useRef, useState } from 'react'
import { KOMISYON_BP, komisyonKurusHesapla, oranLabel, type BankaSecim } from '../../lib/komisyon'
import { kurusToInput } from '../../lib/money'

/**
 * Banka seçince KOMİSYON (₺) alanını otomatik dolduran satır
 * (owner request 2026-07-20). Seçim hiçbir yere KAYDEDİLMEZ — yalnızca
 * hesaplama yardımcısıdır; kaydedilen tek şey komisyon tutarıdır.
 *
 * Varsayılan "Diğer" (oran yok, komisyon elle girilir). YapıKredi'nin iki
 * oranı olduğu için alt seçim açar (kredi kartı / banka kartı).
 *
 * Otomatik değer KULLANICIYA AİT OLANA KADAR canlı kalır: tutar değişirse
 * komisyon yeniden hesaplanır (yoksa tutarı sonradan düzelten kullanıcıda
 * eski orana ait yanlış komisyon kalırdı), ama alanı elle düzenledikten
 * sonra bir daha dokunulmaz.
 */
export default function KomisyonBankaSecici({
  baseKurus,
  komisyon,
  onKomisyon,
}: {
  /** komisyonun hesaplanacağı tutar (kuruş); null = tutar henüz belli değil */
  baseKurus: number | null
  komisyon: string
  onKomisyon: (value: string) => void
}) {
  const [banka, setBanka] = useState<BankaSecim>('DIGER')
  const [ykAcik, setYkAcik] = useState(false)
  /** en son BİZİM yazdığımız değer; alan bundan farklıysa artık kullanıcının */
  const otoRef = useRef<string | null>(null)

  function hesapla(b: BankaSecim): string {
    const bp = KOMISYON_BP[b]
    if (bp === null || baseKurus === null || baseKurus <= 0) return ''
    return kurusToInput(komisyonKurusHesapla(baseKurus, bp))
  }

  // Tutar sonradan değişirse otomatik komisyonu takip ettir (elle
  // düzenlenmişse dokunma).
  useEffect(() => {
    if (KOMISYON_BP[banka] === null) return
    if (otoRef.current === null || komisyon !== otoRef.current) return
    const next = hesapla(banka)
    if (next !== komisyon) {
      otoRef.current = next
      onKomisyon(next)
    }
    // hesapla() yalnızca banka + baseKurus'a bağlıdır; onKomisyon setState.
  }, [banka, baseKurus, komisyon])

  /** Bankaya dokunmak açık bir kullanıcı eylemidir: alanı her hâlükârda ezer. */
  function sec(b: BankaSecim) {
    setBanka(b)
    setYkAcik(false)
    const next = hesapla(b)
    otoRef.current = next
    onKomisyon(next)
  }

  const ykSecili = banka === 'YAPIKREDI_KREDI' || banka === 'YAPIKREDI_BANKA'

  return (
    <div className="mb-[10px]">
      <div className="flex gap-2">
        <SecimButton selected={ykSecili} onClick={() => setYkAcik((v) => !v)}>
          <span className="flex items-center justify-center gap-[5px]">
            YapıKredi
            <svg
              width="9"
              height="9"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transform: ykAcik ? 'rotate(180deg)' : undefined,
                transition: 'transform .18s',
              }}
            >
              <polyline points="2 4 6 8 10 4" />
            </svg>
          </span>
        </SecimButton>
        <SecimButton selected={banka === 'ZIRAAT'} onClick={() => sec('ZIRAAT')}>
          Ziraat
        </SecimButton>
        <SecimButton selected={banka === 'DIGER'} onClick={() => sec('DIGER')}>
          Diğer
        </SecimButton>
      </div>

      {ykAcik && (
        <div className="menu-in mt-[6px] rounded-[14px] bg-card p-[6px]">
          <AltSecim
            selected={banka === 'YAPIKREDI_KREDI'}
            oran={KOMISYON_BP.YAPIKREDI_KREDI!}
            onClick={() => sec('YAPIKREDI_KREDI')}
          >
            Kredi kartı
          </AltSecim>
          <AltSecim
            selected={banka === 'YAPIKREDI_BANKA'}
            oran={KOMISYON_BP.YAPIKREDI_BANKA!}
            onClick={() => sec('YAPIKREDI_BANKA')}
          >
            Banka kartı
          </AltSecim>
        </div>
      )}
    </div>
  )
}

function SecimButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 cursor-pointer rounded-[12px] border-[1.5px] py-[10px] text-center text-[12.5px] font-semibold"
      style={{
        background: selected ? 'var(--seg-on)' : 'var(--seg)',
        borderColor: selected ? 'var(--seg-on)' : 'var(--color-inputline)',
        color: selected ? 'var(--seg-fg-on)' : 'var(--seg-fg)',
      }}
    >
      {children}
    </button>
  )
}

function AltSecim({
  selected,
  oran,
  onClick,
  children,
}: {
  selected: boolean
  oran: number
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-[10px] px-3 py-[10px] text-left text-[14px] font-semibold text-ink"
      style={{ background: selected ? 'var(--seg)' : 'transparent' }}
    >
      <span>{children}</span>
      <span className="text-[12.5px] font-bold text-muted">{oranLabel(oran)}</span>
    </button>
  )
}
