import type { Role } from './types'

// UI-side gates only mirror what RLS enforces server-side — the database
// is the security boundary, these just decide what to render.

export function canSeeFinance(role: Role | null): boolean {
  return role === 'YONETICI' || role === 'MUHASEBE'
}

export function canManageRoles(role: Role | null): boolean {
  return role === 'YONETICI'
}

export function homePathFor(role: Role | null): string {
  return role === 'PERSONEL' ? '/personel' : '/yonetici'
}
