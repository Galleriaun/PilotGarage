import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import AppShell from './app/AppShell'
import {
  HomeRedirect,
  RequireActive,
  RequireAuth,
  RequireBusiness,
  RequireRole,
  Splash,
} from './app/guards'
import BizSelect from './features/auth/BizSelect'
import PendingApproval from './features/auth/PendingApproval'
import ResetPassword from './features/auth/ResetPassword'
import SignIn from './features/auth/SignIn'
import SignUp from './features/auth/SignUp'
import UpdatePrompt from './components/UpdatePrompt'

// Route-level code-splitting: auth screens stay eager (cold-start path);
// each feature area loads on demand. The PWA precaches every chunk, so
// offline navigation is unaffected.
const KayitDetay = lazy(() => import('./features/kayit/KayitDetay'))
const PersonelHome = lazy(() => import('./features/kayit/PersonelHome'))
const YeniKayit = lazy(() => import('./features/kayit/YeniKayit'))
const YoneticiHome = lazy(() => import('./features/kayit/YoneticiHome'))
const Onay = lazy(() => import('./features/finans/Onay'))
const TumIslemler = lazy(() => import('./features/finans/TumIslemler'))
const Yonetim = lazy(() => import('./features/finans/Yonetim'))
const Paketler = lazy(() => import('./features/yonetim/Paketler'))
const PersonelList = lazy(() => import('./features/yonetim/PersonelList'))
const PersonelDetay = lazy(() => import('./features/yonetim/PersonelDetay'))
const PersonelIzinler = lazy(() => import('./features/yonetim/PersonelIzinler'))
const Istekler = lazy(() => import('./features/yonetim/Istekler'))
const Isletmeler = lazy(() => import('./features/yonetim/Isletmeler'))
const IsletmeDetay = lazy(() => import('./features/yonetim/IsletmeDetay'))
const SabitGiderler = lazy(() => import('./features/yonetim/SabitGiderler'))
const IsletmeAyarlari = lazy(() => import('./features/yonetim/IsletmeAyarlari'))
const Bildirimler = lazy(() => import('./features/settings/Bildirimler'))
const Ayarlar = lazy(() => import('./features/settings/Ayarlar'))
const Cop = lazy(() => import('./features/settings/Cop'))
const Mesai = lazy(() => import('./features/mesai/Mesai'))
const Islemler = lazy(() => import('./features/istek/Islemler'))
const Isteklerim = lazy(() => import('./features/istek/Isteklerim'))
const MesaiKayitlari = lazy(() => import('./features/mesai/MesaiKayitlari'))
const MesaiPersonelDetay = lazy(() => import('./features/mesai/MesaiPersonelDetay'))

export default function App() {
  return (
    <BrowserRouter basename="/PilotGarage">
      <Suspense fallback={<Splash />}>
        <Routes>
          <Route path="/giris" element={<SignIn />} />
          <Route path="/kayit-ol" element={<SignUp />} />
          <Route path="/sifre-yenile" element={<ResetPassword />} />

          <Route element={<RequireAuth />}>
            <Route path="/onay-bekliyor" element={<PendingApproval />} />

            <Route element={<RequireActive />}>
              <Route path="/isletme-sec" element={<BizSelect />} />

              <Route element={<RequireBusiness />}>
                <Route element={<AppShell />}>
                  <Route path="/" element={<HomeRedirect />} />
                  <Route path="/personel" element={<PersonelHome />} />
                  <Route path="/kayit/yeni" element={<YeniKayit />} />
                  <Route path="/kayit/:id" element={<KayitDetay />} />
                  <Route path="/bildirimler" element={<Bildirimler />} />
                  <Route path="/ayarlar" element={<Ayarlar />} />
                  <Route path="/mesai" element={<Mesai />} />
                  <Route path="/istekler" element={<Islemler />} />
                  <Route path="/isteklerim" element={<Isteklerim />} />
                  <Route element={<RequireRole roles={['YONETICI', 'MUHASEBE']} />}>
                    <Route path="/yonetici" element={<YoneticiHome />} />
                    <Route path="/yonetim" element={<Yonetim />} />
                    <Route path="/yonetim/islemler" element={<TumIslemler />} />
                    {/* Yalnızca Yönetici — RPC'ler ve RLS de öyle; Muhasebe
                        adresi elle yazarsa kendi ana ekranına döner.
                        Onay (044), İstekler (046), İşletme Ayarları (047). */}
                    <Route element={<RequireRole roles={['YONETICI']} />}>
                      <Route path="/yonetim/onay" element={<Onay />} />
                      <Route path="/yonetim/istekler" element={<Istekler />} />
                      <Route path="/yonetim/ayarlar" element={<IsletmeAyarlari />} />
                    </Route>
                    <Route path="/yonetim/paketler" element={<Paketler />} />
                    <Route path="/yonetim/personel" element={<PersonelList />} />
                    <Route path="/yonetim/personel/:id" element={<PersonelDetay />} />
                    <Route path="/yonetim/personel/:id/izinler" element={<PersonelIzinler />} />
                    <Route path="/yonetim/isletmeler" element={<Isletmeler />} />
                    <Route path="/yonetim/isletmeler/:id" element={<IsletmeDetay />} />
                    <Route path="/yonetim/sabit-giderler" element={<SabitGiderler />} />
                    <Route path="/yonetim/cop" element={<Cop />} />
                    <Route path="/yonetim/mesai" element={<MesaiKayitlari />} />
                    <Route path="/yonetim/mesai/:personelId" element={<MesaiPersonelDetay />} />
                  </Route>
                </Route>
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <UpdatePrompt />
    </BrowserRouter>
  )
}
