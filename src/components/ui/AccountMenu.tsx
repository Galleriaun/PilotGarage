import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../../app/providers/AuthProvider'

/**
 * Small account menu (sign-out lives here until the Profil screen exists).
 * Trigger: the gear icon on Yönetici Home, the Profil tab on the Personel nav.
 */
export default function AccountMenu({
  children,
  side = 'bottom',
}: {
  children: ReactNode
  side?: 'top' | 'bottom'
}) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side={side}
          align="end"
          sideOffset={6}
          className="menu-in z-50 min-w-[170px] rounded-[12px] bg-white p-[6px] shadow-[0_8px_24px_rgba(0,0,0,0.15)]"
        >
          {profile && (
            <div className="border-b border-divider px-3 pb-2 pt-[6px]">
              <p className="truncate text-[13px] font-semibold text-ink">{profile.full_name}</p>
            </div>
          )}
          <DropdownMenu.Item
            onSelect={() => void navigate('/ayarlar')}
            className="mt-1 cursor-pointer rounded-[8px] px-3 py-[9px] text-[13px] font-semibold text-ink outline-none data-[highlighted]:bg-field"
          >
            Ayarlar
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => void signOut()}
            className="mt-1 cursor-pointer rounded-[8px] px-3 py-[9px] text-[13px] font-semibold text-danger outline-none data-[highlighted]:bg-danger-soft"
          >
            Çıkış Yap
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
