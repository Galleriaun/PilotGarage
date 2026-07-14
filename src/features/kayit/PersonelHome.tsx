import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useBusiness } from '../../app/providers/BusinessProvider'
import { useKayitlar, usePhotoUrls } from './api'
import { EmptyState, KayitThumb, SearchAddBar, StatusPill } from './components'
import { SwapIcon } from './icons'
import { KayitCardMeta } from './YoneticiHome'
import { BellButton, ProfileButton } from '../settings/HeaderButtons'
import type { KayitDurum } from './types'

type Filter = 'ALL' | KayitDurum
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'ALL', label: 'Tümü' },
  { key: 'AKTIF', label: 'Aktif' },
  { key: 'BEKLENEN', label: 'Beklenen' },
  { key: 'TAMAMLANDI', label: 'Tamamlandı' },
]

export default function PersonelHome() {
  const navigate = useNavigate()
  const { activeBusiness, businesses } = useBusiness()
  const businessId = activeBusiness?.id ?? ''
  const { data: kayitlar = [], isPending, isError } = useKayitlar(businessId)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('ALL')

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR')
    return kayitlar.filter(
      (k) =>
        (filter === 'ALL' || k.durum === filter) &&
        (!q ||
          k.plaka.toLocaleLowerCase('tr-TR').includes(q) ||
          k.musteri_adi.toLocaleLowerCase('tr-TR').includes(q)),
    )
  }, [kayitlar, search, filter])

  const thumbPaths = useMemo(
    () =>
      filtered
        .map((k) => k.fotograflar[0]?.storage_path)
        .filter((p): p is string => Boolean(p)),
    [filtered],
  )
  const { data: photoUrls = {} } = usePhotoUrls(thumbPaths)

  return (
    <div className="screen-forward">
      <div className="flex items-center gap-2 px-6 pt-5">
        <span className="text-[15px] font-bold text-ink">{activeBusiness?.name ?? ''}</span>
        {businesses.length > 1 && (
          <button
            type="button"
            onClick={() => void navigate('/isletme-sec')}
            aria-label="İşletme değiştir"
            className="pressable flex h-9 w-9 cursor-pointer items-center justify-center rounded-[12px] bg-field"
          >
            <SwapIcon size={16} />
          </button>
        )}
        <div className="flex-1" />
        <BellButton />
        <ProfileButton />
      </div>

      <div className="px-6 pt-[14px]">
        <button
          type="button"
          onClick={() => void navigate('/mesai')}
          className="pressable flex w-full cursor-pointer items-center gap-3 rounded-[16px] bg-ink px-4 py-[14px] text-left"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-white/10">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 7 12 12 15 14" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-white">Mesai Giriş/Çıkış</span>
            <span className="block text-[12px] text-white/60">Gün içi mesai saatlerinizi kaydedin</span>
          </span>
          <svg width="9" height="16" viewBox="0 0 9 16" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 1 8 8 1 15" />
          </svg>
        </button>
      </div>

      <div className="px-6 pt-[14px]">
        <SearchAddBar
          value={search}
          onChange={setSearch}
          onAdd={() => void navigate('/kayit/yeni')}
          variant="gray"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto px-6 pt-[14px]">
        {FILTERS.map((f) => {
          const selected = filter === f.key
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
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

      <div className="px-6 pt-[14px]">
        <span className="text-[15px] font-bold tracking-[-0.3px] text-ink">Kayıtlar</span>
      </div>

      {isPending ? (
        <div className="flex justify-center py-14">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-divider border-t-ink" />
        </div>
      ) : isError ? (
        <p className="px-6 py-10 text-center text-sm text-danger">
          Kayıtlar yüklenemedi. İnternet bağlantınızı kontrol edin.
        </p>
      ) : filtered.length === 0 ? (
        search || filter !== 'ALL' ? (
          <EmptyState title="Kayıt bulunamadı" subtitle="Bu filtreyle eşleşen kayıt yok." />
        ) : (
          <EmptyState title="Henüz kayıt yok" subtitle="İlk aracı eklemek için Ekle'ye dokunun." />
        )
      ) : (
        <div className="flex flex-col gap-3 px-6 pt-[10px]">
          {filtered.map((k) => {
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
                  <div className="truncate text-sm font-bold text-ink">
                    {k.musteri_adi ? `${k.plaka} — ${k.musteri_adi}` : k.plaka}
                  </div>
                  <KayitCardMeta k={k} />
                </div>
                <StatusPill durum={k.durum} />
              </button>
            )
          })}
        </div>
      )}
      <div className="h-6" />
    </div>
  )
}
