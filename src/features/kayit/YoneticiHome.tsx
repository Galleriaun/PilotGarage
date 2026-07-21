import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useBusiness } from '../../app/providers/BusinessProvider'
import { formatCreatedStamp, formatRelativeDate } from '../../lib/dates'
import { useKayitlar, usePhotoUrls } from './api'
import { EmptyState, KayitThumb, SearchAddBar, StatusPill, saatLabel } from './components'
import { DURUM_META, DURUM_ORDER } from './durum'
import { GearIcon, SwapIcon } from './icons'
import { BellButton, TrashHeaderButton } from '../settings/HeaderButtons'
import type { Kayit, KayitDurum } from './types'

type Filter = 'ALL' | 'ONAYLANMAMIS' | KayitDurum

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'ALL', label: 'Tümü' },
  { key: 'AKTIF', label: 'Aktif' },
  { key: 'BEKLENEN', label: 'Beklenen' },
  { key: 'TAMAMLANDI', label: 'Tamamlandı' },
  { key: 'ONAYLANMAMIS', label: 'Onaylanmamış' },
]

/** Geliri henüz onaylanmamış kayıt — kart rozetiyle AYNI kural (tek kaynak,
 *  böylece "Onaylanmadı" rozetli her kart filtrede de görünür). */
function isOnaylanmamis(k: Kayit): boolean {
  return !k.gelirler.some((g) => g.durum === 'ONAYLANDI')
}

function cardTitle(k: Kayit): string {
  return k.musteri_adi ? `${k.plaka} — ${k.musteri_adi}` : k.plaka
}

function aracLabel(k: Kayit): string {
  return `${k.marka} ${k.model}`.trim()
}

const dotCls = 'h-[4px] w-[4px] shrink-0 rounded-full'

/** Mockup's card meta rows: tarih • araç • paket chip / • creator • created. */
export function KayitCardMeta({ k, showPaket = true }: { k: Kayit; showPaket?: boolean }) {
  const arac = aracLabel(k)
  return (
    <>
      <div className="mt-[2px] flex min-w-0 items-center gap-[6px] text-xs text-muted">
        <span className="whitespace-nowrap">{formatRelativeDate(k.tarih)}</span>
        {k.baslangic_saati && k.bitis_saati && (
          <span className="whitespace-nowrap">
            {saatLabel(k.baslangic_saati)}–{saatLabel(k.bitis_saati)}
          </span>
        )}
        {arac && (
          <>
            <span className="shrink-0">-</span>
            <span className="truncate">{arac}</span>
          </>
        )}
        {showPaket && k.paket && (
          <span className="shrink-0 rounded-[6px] bg-[#E4E4E4] px-[7px] py-[2px] text-[10.5px] font-semibold text-[#555]">
            {k.paket.name}
          </span>
        )}
      </div>
      <div className="mt-[4px] flex min-w-0 items-center gap-[10px] text-[11px] text-faint">
        {k.creator && (
          <span className="flex min-w-0 items-center gap-[5px]">
            <span className={dotCls} style={{ background: '#C4C4C4' }} />
            <span className="truncate">{k.creator.full_name}</span>
          </span>
        )}
        <span className="flex shrink-0 items-center gap-[5px]">
          <span className={dotCls} style={{ background: '#C4C4C4' }} />
          {formatCreatedStamp(k.created_at)}
        </span>
      </div>
    </>
  )
}

export default function YoneticiHome() {
  const navigate = useNavigate()
  const { activeBusiness, businesses } = useBusiness()
  const businessId = activeBusiness?.id ?? ''
  const { data: kayitlar = [], isPending, isError } = useKayitlar(businessId)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('ALL')

  const searched = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR')
    if (!q) return kayitlar
    return kayitlar.filter(
      (k) =>
        k.plaka.toLocaleLowerCase('tr-TR').includes(q) ||
        k.musteri_adi.toLocaleLowerCase('tr-TR').includes(q),
    )
  }, [kayitlar, search])

  const groups = useMemo(() => {
    // Onaylanmamış: durum grupları korunur, içlerinde yalnızca geliri
    // onaylanmamış kayıtlar kalır
    const list = filter === 'ONAYLANMAMIS' ? searched.filter(isOnaylanmamis) : searched
    return DURUM_ORDER.filter(
      (d) => filter === 'ALL' || filter === 'ONAYLANMAMIS' || filter === d,
    ).map((durum) => ({
      durum,
      meta: DURUM_META[durum],
      items: list.filter((k) => k.durum === durum),
    }))
  }, [searched, filter])
  const visibleGroups = groups.filter((g) => g.items.length > 0)

  const thumbPaths = useMemo(
    () =>
      searched
        .map((k) => k.fotograflar[0]?.storage_path)
        .filter((p): p is string => Boolean(p)),
    [searched],
  )
  const { data: photoUrls = {} } = usePhotoUrls(thumbPaths)

  const aktifCount = kayitlar.filter((k) => k.durum === 'AKTIF').length
  const beklenenCount = kayitlar.filter((k) => k.durum === 'BEKLENEN').length

  return (
    <div className="screen-forward">
      {/* Header — desktop has the top bar instead */}
      <div className="flex items-center gap-[10px] px-6 pt-[14px] md:hidden">
        <span className="text-[19px] font-bold text-ink">{activeBusiness?.name ?? ''}</span>
        {businesses.length > 1 && (
          <button
            type="button"
            onClick={() => void navigate('/isletme-sec')}
            aria-label="İşletme değiştir"
            className="pressable flex h-8 w-8 cursor-pointer items-center justify-center rounded-[10px] bg-field"
          >
            <SwapIcon size={14} />
          </button>
        )}
        <div className="flex-1" />
        <TrashHeaderButton />
        <BellButton />
        <button
          type="button"
          aria-label="Ayarlar"
          onClick={() => void navigate('/ayarlar')}
          className="flex h-8 w-8 cursor-pointer items-center justify-center"
        >
          <GearIcon />
        </button>
      </div>

      {/* Stats */}
      <div className="flex gap-[10px] px-6 pt-[14px] md:grid md:grid-cols-3">
        <div className="flex-1 rounded-[16px] bg-card px-[14px] py-[18px] md:flex md:items-center md:gap-[10px] md:py-2">
          <div className="text-[26px] font-bold tracking-[-0.5px] text-ink">{kayitlar.length}</div>
          <div className="mt-1 text-[13px] text-muted md:mt-0">Toplam Kayıt</div>
        </div>
        {/* md:contents lifts the two pills into the grid as equal cells */}
        <div className="flex flex-1 flex-col gap-[10px] md:contents">
          <div className="flex flex-1 items-center gap-[10px] rounded-[10px] bg-danger px-[14px] py-2">
            <div className="text-[26px] font-bold tracking-[-0.5px] text-white">{aktifCount}</div>
            <div className="text-[13px] text-white/65">Aktif Kayıt</div>
          </div>
          <div className="flex flex-1 items-center gap-[10px] rounded-[10px] bg-[#3A3A3A] px-[14px] py-2">
            <div className="text-[26px] font-bold tracking-[-0.5px] text-white">
              {beklenenCount}
            </div>
            <div className="text-[13px] text-white/65">Bekleyen Kayıt</div>
          </div>
        </div>
      </div>

      {/* Arama + Ekle */}
      <div className="px-6 pt-[18px]">
        <SearchAddBar
          value={search}
          onChange={setSearch}
          onAdd={() => void navigate('/kayit/yeni')}
          variant="white"
        />
      </div>

      {/* Durum filtreleri */}
      <div className="flex gap-2 overflow-x-auto px-6 pt-[14px]">
        {FILTERS.map((f) => {
          const selected = filter === f.key
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              // shrink-0: 5 çip dar ekranda sığmıyor — küçülüp kırpılmak
              // yerine satır yatay kaysın (kapsayıcıda overflow-x-auto var)
              className="shrink-0 cursor-pointer whitespace-nowrap rounded-[20px] px-[14px] py-2 text-[13px] font-semibold"
              style={{
                background: selected ? 'var(--seg-on)' : 'var(--seg)',
                color: selected ? 'var(--seg-fg-on)' : 'var(--seg-fg)',
              }}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {isPending ? (
        <div className="flex justify-center py-14">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-divider border-t-ink" />
        </div>
      ) : isError ? (
        <p className="px-6 py-10 text-center text-sm text-danger">
          Kayıtlar yüklenemedi. İnternet bağlantınızı kontrol edin.
        </p>
      ) : visibleGroups.length === 0 ? (
        kayitlar.length === 0 && !search && filter === 'ALL' ? (
          <EmptyState title="Henüz kayıt yok" subtitle="İlk aracı eklemek için Ekle'ye dokunun." />
        ) : (
          <EmptyState title="Kayıt bulunamadı" subtitle="Bu filtreyle eşleşen kayıt yok." />
        )
      ) : (
        visibleGroups.map((group) => (
          <div key={group.durum}>
            <div className="px-6 pt-[14px]">
              <span className="text-[15px] font-bold tracking-[-0.3px] text-ink">
                {group.meta.label}
              </span>
              <span className="ml-1 text-[13px] font-semibold text-faint">
                {group.items.length}
              </span>
            </div>
            <div className="flex flex-col gap-3 px-6 pt-[10px]">
              {group.items.map((k) => {
                const firstPath = k.fotograflar[0]?.storage_path
                return (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => void navigate(`/kayit/${k.id}`)}
                    className="pressable flex w-full cursor-pointer items-center gap-[14px] rounded-[16px] bg-card px-4 py-[18px] text-left"
                  >
                    <KayitThumb url={firstPath ? (photoUrls[firstPath] ?? null) : null} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-ink">{cardTitle(k)}</div>
                      <KayitCardMeta k={k} showPaket={false} />
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-[5px]">
                      <StatusPill durum={k.durum} />
                      {isOnaylanmamis(k) ? (
                        <span className="rounded-[6px] bg-[#FEF9C3] px-2 py-[3px] text-[11px] font-semibold text-[#A16207]">
                          Onaylanmadı
                        </span>
                      ) : (
                        <span className="rounded-[6px] bg-success-soft px-2 py-[3px] text-[11px] font-semibold text-success">
                          Onaylandı
                        </span>
                      )}
                      {k.paket && (
                        <span className="rounded-[6px] bg-[#E4E4E4] px-2 py-[3px] text-[10.5px] font-semibold text-[#555]">
                          {k.paket.name}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))
      )}
      <div className="h-6" />
    </div>
  )
}
