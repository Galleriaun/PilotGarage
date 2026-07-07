import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import AppShell from './app/AppShell'
import {
  HomeRedirect,
  RequireActive,
  RequireAuth,
  RequireBusiness,
  RequireRole,
} from './app/guards'
import BizSelect from './features/auth/BizSelect'
import PendingApproval from './features/auth/PendingApproval'
import ResetPassword from './features/auth/ResetPassword'
import SignIn from './features/auth/SignIn'
import SignUp from './features/auth/SignUp'
import KayitDetay from './features/kayit/KayitDetay'
import PersonelHome from './features/kayit/PersonelHome'
import YeniKayit from './features/kayit/YeniKayit'
import YoneticiHome from './features/kayit/YoneticiHome'
import UpdatePrompt from './components/UpdatePrompt'

export default function App() {
  return (
    <BrowserRouter basename="/PilotGarage">
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
                <Route element={<RequireRole roles={['YONETICI', 'MUHASEBE']} />}>
                  <Route path="/yonetici" element={<YoneticiHome />} />
                </Route>
              </Route>
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <UpdatePrompt />
    </BrowserRouter>
  )
}
