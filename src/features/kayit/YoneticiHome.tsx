import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useBusiness } from '../../app/providers/BusinessProvider'
import { formatRelativeDate } from '../../lib/dates'
import AccountMenu from '../../components/ui/AccountMenu'
import { useKayitlar, usePhotoUrls } from './api'
import { EmptyState, KayitThumb, SearchAddBar, StatusPill } from './components'
import { DURUM_META, DURUM_ORDER } from './durum'
import { BellOutlineIcon, GearIcon, SwapIcon } from './icons'
import type { Kayit, KayitDurum } from './types'

type Filter = 'ALL' | KayitDurum

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'ALL', label: 'Tümü' },
  { key: 'AKTIF', label: 'Aktif' },
  { key: 'BEKLENEN', label: 'Beklenen' },
  { key: 'TAMAMLANDI', label: 'Tamamlandı' },
]

function cardTitle(k: Kayit): string {
  const arac = `${k.marka} ${k.model}`.trim()
  return arac ? `${k.plaka} — ${arac}` : k.plaka
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

  const groups = useMemo(
    () =>
      DURUM_ORDER.filter((d) => filter === 'ALL' || filter === d).map((durum) => ({
        durum,
        meta: DURUM_META[durum],
        items: searched.filter((k) => k.durum === durum),
      })),
    [searched, filter],
  )
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
      {/* Header */}
      <div className="flex items-center gap-[10px] px-6 pt-[14px]">
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
        <button
          type="button"
          aria-label="Bildirimler (yakında)"
          className="flex h-8 w-8 cursor-pointer items-center justify-center"
        >
          <BellOutlineIcon />
        </button>
        <AccountMenu side="bottom">
          <button
            type="button"
            aria-label="Ayarlar"
            className="flex h-8 w-8 cursor-pointer items-center justify-center"
          >
            <GearIcon />
          </button>
        </AccountMenu>
      </div>

      {/* Stats */}
      <div className="flex gap-[10px] px-6 pt-[14px]">
        <div className="flex-1 rounded-[16px] bg-card px-[14px] py-[18px]">
          <div className="text-[26px] font-bold tracking-[-0.5px] text-ink">{kayitlar.length}</div>
          <div className="mt-1 text-[13px] text-muted">Toplam Kayıt</div>
        </div>
        <div className="flex flex-1 flex-col gap-[10px]">
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
              className="cursor-pointer whitespace-nowrap rounded-[20px] px-[14px] py-2 text-[13px] font-semibold"
              style={{
                background: selected ? '#111' : '#F2F2F2',
                color: selected ? '#fff' : '#888',
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
                      <div className="mt-[2px] truncate text-xs text-muted">
                        {[k.musteri_adi, formatRelativeDate(k.tarih)].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <StatusPill durum={k.durum} />
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
