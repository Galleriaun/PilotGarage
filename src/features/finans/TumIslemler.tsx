import { useMemo, useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useNavigate, useSearchParams } from 'react-router'
import { useBusiness } from '../../app/providers/BusinessProvider'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { formatTL } from '../../lib/money'
import { BackChevron } from '../auth/EyeIcon'
import { CalendarIcon, CheckSmallIcon, ChevronDownIcon, SearchIcon } from '../kayit/icons'
import TxCard from './TxCard'
import { useApprovedIslemler, useDeleteIslem, useKategoriler } from './api'
import { inRange, periodRange, type DateRange } from './selectors'
import type { Islem } from './types'

type TurFilter = 'TUMU' | 'GELIR' | 'GIDER'
type CalendarFilter =
  | { kind: 'TUMU' | 'BUGUN' | 'HAFTA' | 'AY' }
  | { kind: 'CUSTOM'; start: string; end: string }
type MenuKey = 'tur' | 'kategori' | 'takvim'

const TUR_LABELS: Record<TurFilter, string> = { TUMU: 'Tümü', GELIR: 'Gelir', GIDER: 'Gider' }
const CAL_LABELS = { TUMU: 'Tarih', BUGUN: 'Bugün', HAFTA: 'Bu Hafta', AY: 'Bu Ay' } as const
const CAL_OPTIONS = [
  { kind: 'TUMU', label: 'Tüm Zamanlar' },
  { kind: 'BUGUN', label: 'Bugün' },
  { kind: 'HAFTA', label: 'Bu Hafta' },
  { kind: 'AY', label: 'Bu Ay' },
] as const

function initialCalendar(params: URLSearchParams): CalendarFilter {
  const takvim = params.get('takvim')
  const start = params.get('start')
  const end = params.get('end')
  if (takvim === 'custom' && start && end) return { kind: 'CUSTOM', start, end }
  if (takvim === 'bugun') return { kind: 'BUGUN' }
  if (takvim === 'hafta') return { kind: 'HAFTA' }
  if (takvim === 'ay') return { kind: 'AY' }
  return { kind: 'TUMU' }
}

function calendarRange(cal: CalendarFilter): DateRange | null {
  if (cal.kind === 'CUSTOM') return { start: cal.start, end: cal.end }
  if (cal.kind === 'TUMU') return null
  return periodRange(cal.kind)
}

function calendarLabel(cal: CalendarFilter): string {
  if (cal.kind === 'CUSTOM') {
    const fmt = (iso: string) => {
      const [, m, d] = iso.split('-')
      return `${d}.${m}`
    }
    return `${fmt(cal.start)} – ${fmt(cal.end)}`
  }
  return CAL_LABELS[cal.kind]
}

function FilterPill({
  label,
  icon,
  open,
  onClick,
}: {
  label: string
  icon?: ReactNode
  open: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex cursor-pointer items-center gap-[5px] rounded-[20px] border border-[#E5E5E5] bg-white px-[14px] py-[9px]"
    >
      {icon}
      <span className="text-[13px] font-semibold text-ink">{label}</span>
      <ChevronDownIcon size={11} color="#888" rotated={open} />
    </button>
  )
}

function MenuItem({
  label,
  selected,
  onSelect,
}: {
  label: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full cursor-pointer items-center justify-between gap-4 whitespace-nowrap rounded-[10px] px-3 py-[10px] text-left text-[13px] font-semibold text-ink"
      style={{ background: selected ? '#F2F2F2' : 'transparent' }}
    >
      <span>{label}</span>
      {selected && <CheckSmallIcon />}
    </button>
  )
}

export default function TumIslemler() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id ?? ''
  const { data: islemler = [], isPending, isError } = useApprovedIslemler(businessId)
  const { data: kategoriler = [] } = useKategoriler(businessId)

  const [turFilter, setTurFilter] = useState<TurFilter>(() => {
    const t = searchParams.get('tur')
    return t === 'GELIR' || t === 'GIDER' ? t : 'TUMU'
  })
  const [kategoriFilter, setKategoriFilter] = useState<string>('TUMU')
  const [calendar, setCalendar] = useState<CalendarFilter>(() => initialCalendar(searchParams))
  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null)
  const [search, setSearch] = useState('')
  const [dateModal, setDateModal] = useState<{ open: boolean; start: string; end: string }>({
    open: false,
    start: '',
    end: '',
  })
  const [deleting, setDeleting] = useState<Islem | null>(null)
  const deleteIslem = useDeleteIslem()

  async function onConfirmDelete() {
    if (!deleting) return
    try {
      await deleteIslem.mutateAsync({ islemId: deleting.id })
    } finally {
      setDeleting(null)
    }
  }

  const filtered = useMemo(() => {
    const range = calendarRange(calendar)
    const q = search.trim().toLocaleLowerCase('tr-TR')
    return islemler.filter(
      (i) =>
        (turFilter === 'TUMU' || i.tur === turFilter) &&
        (kategoriFilter === 'TUMU' || i.kategori_id === kategoriFilter) &&
        inRange(i.islem_tarihi, range) &&
        (!q || i.baslik.toLocaleLowerCase('tr-TR').includes(q)),
    )
  }, [islemler, turFilter, kategoriFilter, calendar, search])

  let gelir = 0
  let gider = 0
  let nakitNet = 0
  let kkNet = 0
  let havaleNet = 0
  for (const i of filtered) {
    if (i.tur === 'GELIR') gelir += i.kurus
    else gider += i.kurus
    const signed = i.tur === 'GELIR' ? i.kurus : -i.kurus
    if (i.odeme_yontemi === 'NAKIT') nakitNet += signed
    else if (i.odeme_yontemi === 'KREDI_KARTI') kkNet += signed
    else if (i.odeme_yontemi === 'HAVALE') havaleNet += signed
  }

  const kategoriLabel =
    kategoriFilter === 'TUMU'
      ? 'Tüm Kategoriler'
      : (kategoriler.find((k) => k.id === kategoriFilter)?.label ?? 'Kategori')

  function toggleMenu(key: MenuKey) {
    setOpenMenu((cur) => (cur === key ? null : key))
  }

  function openDatePicker() {
    setOpenMenu(null)
    const range = calendarRange(calendar) ?? periodRange('AY')
    setDateModal({ open: true, start: range?.start ?? '', end: range?.end ?? '' })
  }

  return (
    <div className="screen-forward">
      <div className="px-6 pt-4">
        <button
          type="button"
          onClick={() => void navigate('/yonetim')}
          className="inline-flex cursor-pointer items-center gap-1 py-[6px]"
        >
          <BackChevron />
          <span className="text-[15px] font-medium text-ink">Geri</span>
        </button>
      </div>

      <div className="px-6 pt-4">
        <h1 className="mb-4 text-[26px] font-bold tracking-[-0.4px] text-ink">Tüm İşlemler</h1>

        {/* Filters */}
        <div className="mb-5 flex flex-wrap gap-2">
          <div className="relative">
            <FilterPill
              label={TUR_LABELS[turFilter]}
              open={openMenu === 'tur'}
              onClick={() => toggleMenu('tur')}
            />
            {openMenu === 'tur' && (
              <div className="menu-in absolute left-0 top-[calc(100%+6px)] z-20 min-w-[120px] rounded-[14px] bg-white p-[6px] shadow-[0_8px_24px_rgba(0,0,0,0.15)]">
                {(Object.keys(TUR_LABELS) as TurFilter[]).map((t) => (
                  <MenuItem
                    key={t}
                    label={TUR_LABELS[t]}
                    selected={turFilter === t}
                    onSelect={() => {
                      setTurFilter(t)
                      setOpenMenu(null)
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <FilterPill
              label={kategoriLabel}
              open={openMenu === 'kategori'}
              onClick={() => toggleMenu('kategori')}
            />
            {openMenu === 'kategori' && (
              <div className="menu-in absolute left-0 top-[calc(100%+6px)] z-20 min-w-[150px] rounded-[14px] bg-white p-[6px] shadow-[0_8px_24px_rgba(0,0,0,0.15)]">
                <MenuItem
                  label="Tüm Kategoriler"
                  selected={kategoriFilter === 'TUMU'}
                  onSelect={() => {
                    setKategoriFilter('TUMU')
                    setOpenMenu(null)
                  }}
                />
                {kategoriler.map((k) => (
                  <MenuItem
                    key={k.id}
                    label={k.label}
                    selected={kategoriFilter === k.id}
                    onSelect={() => {
                      setKategoriFilter(k.id)
                      setOpenMenu(null)
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <FilterPill
              label={calendarLabel(calendar)}
              icon={<CalendarIcon />}
              open={openMenu === 'takvim'}
              onClick={() => toggleMenu('takvim')}
            />
            {openMenu === 'takvim' && (
              <div className="menu-in absolute right-0 top-[calc(100%+6px)] z-20 min-w-[130px] rounded-[14px] bg-white p-[6px] shadow-[0_8px_24px_rgba(0,0,0,0.15)]">
                {CAL_OPTIONS.map((o) => (
                  <MenuItem
                    key={o.kind}
                    label={o.label}
                    selected={calendar.kind === o.kind}
                    onSelect={() => {
                      setCalendar({ kind: o.kind })
                      setOpenMenu(null)
                    }}
                  />
                ))}
                <div className="mt-[6px] border-t border-[#E4E4E4] pt-[6px]">
                  <MenuItem
                    label="Tarih Seç"
                    selected={calendar.kind === 'CUSTOM'}
                    onSelect={openDatePicker}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="mb-4 flex items-center gap-2 rounded-[14px] border-[1.5px] border-[#E4E4E4] bg-white px-4 py-[11.5px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <SearchIcon />
          <input
            type="text"
            placeholder="İşlem ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink outline-none placeholder:text-faint"
          />
        </div>

        {/* Summary */}
        <div className="mb-4 rounded-[14px] bg-[linear-gradient(150deg,#1C1C1E,#0A0A0A)] px-4 py-3">
          <div className="flex items-center gap-[18px]">
            <div className="flex items-baseline gap-1">
              <span className="text-xs font-semibold text-white/55">Toplam:</span>
              <span className="text-[13px] font-bold text-white">{formatTL(gelir - gider)}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xs font-semibold text-white/55">Gelir:</span>
              <span className="text-[13px] font-bold text-[#4ADE80]">{formatTL(gelir)}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xs font-semibold text-white/55">Gider:</span>
              <span className="text-[13px] font-bold text-[#F87171]">{formatTL(gider)}</span>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-[18px] border-t border-white/10 pt-2">
            <div className="flex items-baseline gap-1">
              <span className="text-xs font-semibold text-white/55">Nakit:</span>
              <span className="text-[13px] font-bold text-[#4ADE80]">{formatTL(nakitNet)}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xs font-semibold text-white/55">Kredi Kartı:</span>
              <span className="text-[13px] font-bold text-[#60A5FA]">{formatTL(kkNet)}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xs font-semibold text-white/55">Havale:</span>
              <span className="text-[13px] font-bold text-[#C4B5FD]">{formatTL(havaleNet)}</span>
            </div>
          </div>
        </div>

        {/* List */}
        {isPending ? (
          <div className="flex justify-center py-14">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-divider border-t-ink" />
          </div>
        ) : isError ? (
          <p className="py-10 text-center text-sm text-danger">İşlemler yüklenemedi.</p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <div className="mb-[14px] flex h-[52px] w-[52px] items-center justify-center rounded-[16px] bg-field">
              <SearchIcon />
            </div>
            <div className="mb-1 text-[15px] font-bold text-ink">Sonuç bulunamadı</div>
            <div className="text-[13px] text-muted">Bu filtrelerle eşleşen işlem yok.</div>
          </div>
        ) : (
          <div className="flex flex-col gap-[10px]">
            {filtered.map((i) => (
              <TxCard key={i.id} islem={i} variant="gray" onDelete={() => setDeleting(i)} />
            ))}
          </div>
        )}
      </div>
      <div className="h-10" />

      <ConfirmDialog
        open={deleting !== null}
        title="İşlemi sil"
        message="Bu işlemi silmek istiyor musunuz?"
        confirmLabel="Sil"
        danger
        busy={deleteIslem.isPending}
        onConfirm={() => void onConfirmDelete()}
        onCancel={() => setDeleting(null)}
      />

      {/* Tarih aralığı modal */}
      <Dialog.Root
        open={dateModal.open}
        onOpenChange={(next) => {
          if (!next) setDateModal((m) => ({ ...m, open: false }))
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="modal-backdrop fixed inset-0 z-50 bg-black/45" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-64px)] max-w-[300px] -translate-x-1/2 -translate-y-1/2 outline-none">
            <div className="modal-pop rounded-[20px] bg-white px-[22px] py-6 shadow-[0_20px_50px_rgba(0,0,0,0.25)]">
              <Dialog.Title className="mb-4 text-[17px] font-bold text-ink">
                Tarih Aralığı Seç
              </Dialog.Title>
              <Dialog.Description className="sr-only">
                İşlemleri tarih aralığına göre filtreler.
              </Dialog.Description>
              <div className="mb-5 flex flex-col gap-3">
                <div>
                  <div className="mb-[6px] text-[11px] font-bold uppercase tracking-[0.6px] text-faint">
                    BAŞLANGIÇ
                  </div>
                  <input
                    type="date"
                    value={dateModal.start}
                    onChange={(e) => setDateModal((m) => ({ ...m, start: e.target.value }))}
                    className="w-full rounded-[12px] border-none bg-field px-[14px] py-[13px] text-[15px] text-ink outline-none"
                  />
                </div>
                <div>
                  <div className="mb-[6px] text-[11px] font-bold uppercase tracking-[0.6px] text-faint">
                    BİTİŞ
                  </div>
                  <input
                    type="date"
                    value={dateModal.end}
                    onChange={(e) => setDateModal((m) => ({ ...m, end: e.target.value }))}
                    className="w-full rounded-[12px] border-none bg-field px-[14px] py-[13px] text-[15px] text-ink outline-none"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDateModal((m) => ({ ...m, open: false }))}
                  className="flex-1 cursor-pointer rounded-[12px] bg-field py-3 text-sm font-semibold text-ink"
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (dateModal.start && dateModal.end && dateModal.start <= dateModal.end) {
                      setCalendar({ kind: 'CUSTOM', start: dateModal.start, end: dateModal.end })
                      setDateModal((m) => ({ ...m, open: false }))
                    }
                  }}
                  className="flex-1 cursor-pointer rounded-[12px] bg-ink py-3 text-sm font-semibold text-white"
                >
                  Onayla
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
