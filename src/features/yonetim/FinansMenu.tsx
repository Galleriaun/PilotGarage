import type { ReactNode } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useNavigate } from 'react-router'
import { useAuth } from '../../app/providers/AuthProvider'
import { useBusiness } from '../../app/providers/BusinessProvider'
import { ChevronDownIcon } from '../kayit/icons'
import { useBekleyenIstekTurleri } from './api'
import {
  BuildingIcon,
  CalendarBoxIcon,
  GearSmIcon,
  TagIcon,
  UsersIcon,
} from './shared'

/** Bekleyen istek göstergesi — PersonelList'teki İstekler butonuyla aynı stil.
 *  Konumlandırma için üst elemanda `relative` olmalı. */
function IstekDot() {
  return (
    <span className="absolute -right-[3px] -top-[3px] h-[11px] w-[11px] rounded-full border-2 border-white bg-[#E53935]" />
  )
}

function ClockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  )
}

interface MenuItem {
  path: string
  title: string
  subtitle: string
  iconBg: string
  icon: ReactNode
  /** true = yalnızca Yönetici görür (047) */
  yoneticiOnly?: boolean
  /**
   * 037/046: bekleyen istek varsa ikon kutusunun köşesinde kırmızı nokta.
   * Path karşılaştırması yerine bayrak: listeye ileride öğe eklenince nokta
   * sessizce yanlış satıra kaymaz.
   */
  istekDot?: boolean
}

const ITEMS: MenuItem[] = [
  {
    path: '/yonetim/paketler',
    title: 'Paketler',
    subtitle: 'Hizmet paketleri ve fiyatlar',
    iconBg: '#FEF3F2',
    icon: <TagIcon />,
  },
  {
    path: '/yonetim/personel',
    title: 'Personel',
    subtitle: 'Maaş, avans ve roller',
    iconBg: '#F0FDF4',
    icon: <UsersIcon />,
    istekDot: true,
  },
  {
    path: '/yonetim/isletmeler',
    title: 'İşletmeler',
    subtitle: 'Cari hesaplar',
    iconBg: '#EEF4FF',
    icon: <BuildingIcon />,
  },
  {
    path: '/yonetim/sabit-giderler',
    title: 'Sabit Giderler',
    subtitle: 'Kira, fatura, abonelikler',
    iconBg: '#FFF7ED',
    icon: <CalendarBoxIcon />,
  },
  {
    path: '/yonetim/mesai',
    title: 'Mesai Kayıtları',
    subtitle: 'Personel giriş/çıkış saatleri',
    iconBg: '#F0FDFA',
    icon: <ClockIcon />,
  },
  {
    path: '/yonetim/ayarlar',
    title: 'İşletme Ayarları',
    subtitle: 'İsim ve kategoriler',
    iconBg: '#F2F2F2',
    icon: <GearSmIcon />,
    // 047: yazma politikaları da yalnızca Yönetici — menüde gizlemek
    // kozmetik, asıl sınır RLS'te
    yoneticiOnly: true,
  },
]

/** The "Yönetim" pill on the Finans header — opens the module menu. */
export default function FinansMenu() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { activeBusiness } = useBusiness()
  const isYonetici = profile?.role === 'YONETICI'
  const items = ITEMS.filter((i) => !i.yoneticiOnly || isYonetici)

  // 046: İSTEKLERİ MUHASEBE HİÇ GÖRMEZ — yalnızca butonlar değil, görünürlük
  // de kısıtlı (şikâyet Muhasebe HAKKINDA olabilir). "Bekleyen istek var"
  // diyen bir nokta, içeriği göstermese bile o kararı delerdi. Menüdeki
  // Personel satırı Muhasebe'ye de göründüğü için nokta satıra değil ROLE
  // bağlanır. İki kapı bilerek:
  //   1) boş businessId → hook'un enabled'ı kapanır, istek hiç atılmaz
  //   2) istekVar'daki isYonetici → sorgu bir şekilde veri dönse bile çizilmez
  const { data: bekleyen } = useBekleyenIstekTurleri(
    isYonetici ? (activeBusiness?.id ?? '') : '',
  )
  const istekVar = isYonetici && (bekleyen?.size ?? 0) > 0

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="relative flex shrink-0 cursor-pointer items-center gap-[6px] rounded-[20px] bg-field py-[9px] pl-[10px] pr-3 text-ink"
        >
          <GearSmIcon color="currentColor" size={15} />
          <span className="text-[13px] font-semibold text-ink">Yönetim</span>
          <ChevronDownIcon size={11} color="currentColor" rotated={false} />
          {/* asChild yalnızca prop'ları bu butona geçirir, çocuklarına
              karışmaz — nokta güvenle içeride durabilir. */}
          {istekVar && <IstekDot />}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="bottom"
          align="end"
          sideOffset={8}
          className="menu-in z-50 min-w-[250px] rounded-[18px] bg-white p-2 shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
        >
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.path}
              onSelect={() => void navigate(item.path)}
              className="flex cursor-pointer items-center gap-3 rounded-[14px] p-[10px] outline-none data-[highlighted]:bg-card"
            >
              <div
                className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px]"
                style={{ background: item.iconBg }}
              >
                {item.icon}
                {item.istekDot && istekVar && <IstekDot />}
              </div>
              <div className="flex min-w-0 flex-col gap-[1px]">
                <span className="text-sm font-bold text-ink">{item.title}</span>
                <span className="text-xs text-muted">{item.subtitle}</span>
              </div>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
