export type Role = 'YONETICI' | 'MUHASEBE' | 'PERSONEL'
export type AccountStatus = 'PENDING' | 'ACTIVE' | 'DISABLED'
export type BusinessCode = 'SERVIS' | 'GALERI'

export interface Profile {
  id: string
  full_name: string
  role: Role | null // NULL until Yönetici approves the signup
  status: AccountStatus
  created_at: string
}

export interface Business {
  id: string
  code: BusinessCode
  name: string
  telefon: string
  adres: string
}
