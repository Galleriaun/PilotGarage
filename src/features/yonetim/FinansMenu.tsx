import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useNavigate } from 'react-router'
import { ChevronDownIcon } from '../kayit/icons'
import {
  BuildingIcon,
  CalendarBoxIcon,
  GearSmIcon,
  TagIcon,
  UsersIcon,
} from './shared'

const ITEMS = [
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
    path: '/yonetim/ayarlar',
    title: 'İşletme Ayarları',
    subtitle: 'İsim ve kategoriler',
    iconBg: '#F2F2F2',
    icon: <GearSmIcon />,
  },
]

/** The "Yönetim" pill on the Finans header — opens the module menu. */
export default function FinansMenu() {
  const navigate = useNavigate()
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex shrink-0 cursor-pointer items-center gap-[6px] rounded-[20px] bg-field py-[9px] pl-[10px] pr-3"
        >
          <GearSmIcon color="#111" size={15} />
          <span className="text-[13px] font-semibold text-ink">Yönetim</span>
          <ChevronDownIcon size={11} color="#111" rotated={false} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="bottom"
          align="end"
          sideOffset={8}
          className="menu-in z-50 min-w-[250px] rounded-[18px] bg-white p-2 shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
        >
          {ITEMS.map((item) => (
            <DropdownMenu.Item
              key={item.path}
              onSelect={() => void navigate(item.path)}
              className="flex cursor-pointer items-center gap-3 rounded-[14px] p-[10px] outline-none data-[highlighted]:bg-card"
            >
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px]"
                style={{ background: item.iconBg }}
              >
                {item.icon}
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
