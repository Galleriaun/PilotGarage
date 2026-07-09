import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useBusiness } from '../../app/providers/BusinessProvider'
import { useKayitlar, usePhotoUrls } from './api'
import { EmptyState, KayitThumb, SearchAddBar, StatusPill } from './components'
import { SwapIcon } from './icons'
import { KayitCardMeta } from './YoneticiHome'

export default function PersonelHome() {
  const navigate = useNavigate()
  const { activeBusiness, businesses } = useBusiness()
  const businessId = activeBusiness?.id ?? ''
  const { data: kayitlar = [], isPending, isError } = useKayitlar(businessId)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR')
    if (!q) return kayitlar
    return kayitlar.filter(
      (k) =>
        k.plaka.toLocaleLowerCase('tr-TR').includes(q) ||
        k.musteri_adi.toLocaleLowerCase('tr-TR').includes(q),
    )
  }, [kayitlar, search])

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
      <div className="flex items-center justify-between px-6 pt-5">
        <span className="text-[15px] font-bold text-ink">{activeBusiness?.name ?? ''}</span>
        {businesses.length > 1 && (
          <button
            type="button"
            onClick={() => void navigate('/isletme-sec')}
            aria-label="İşletme değiştir"
            className="pressable flex h-[38px] w-[38px] cursor-pointer items-center justify-center rounded-[12px] bg-field"
          >
            <SwapIcon size={16} />
          </button>
        )}
      </div>

      <div className="px-6 pt-[18px]">
        <SearchAddBar
          value={search}
          onChange={setSearch}
          onAdd={() => void navigate('/kayit/yeni')}
          variant="gray"
        />
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
        search ? (
          <EmptyState title="Kayıt bulunamadı" subtitle="Aramanızla eşleşen kayıt yok." />
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
