# Sprint 3 — Yönetim Modules (Summary)

**Date:** 2026-07-08
**Scope:** The management section reachable from the Finans → "Yönetim" dropdown: Paketler, Personel, İşletmeler (cari hesap), Sabit Giderler, İşletme Ayarları.

> ✅ **Verification status: PASSED.** `npm run build` (tsc --noEmit + Vite build) ran clean on 2026-07-08 — 280 modules transformed, zero TypeScript errors. The only output is the pre-existing informational warning that the main JS chunk is >500 kB (718 kB / 196 kB gzip) — not an error; can be addressed later with route-level code-splitting if desired.

---

## What was built

### Navigation
- **FinansMenu** (`features/yonetim/FinansMenu.tsx`) — the "Yönetim" pill on the Finans header opens a Radix dropdown with the five module entries (Paketler / Personel / İşletmeler / Sabit Giderler / İşletme Ayarları), each with the design's colored icon tiles. Wired into `features/finans/Yonetim.tsx`.

### Screens
1. **Paketler** (`Paketler.tsx`) — list + add/edit modal + delete. Delete is a **soft delete** (`is_active = false`) so kayıt history keeps its paket reference. Kuruş-parsed price input.
2. **Personel list** (`PersonelList.tsx`) — roster of business members with maaş + ödeme günü. **Yönetici-only** section at top shows PENDING signups with an "Onayla" flow (role picker + İşletme Erişimi multi-select + optional maaş/ödeme günü → `approve_signup` RPC).
3. **Personel detay** (`PersonelDetay.tsx`) — monthly summary card (maaş / verilen avans / kalan), **draft + FloatingSavePopup** edit pattern for maaş / otomatik ödeme günü / (Yönetici-only) işletme erişimi, **Rol Değiştir** modal (Yönetici-only, self excluded), **Avans Ver** and **Maaş Öde** (both born-approved via RPC, with confirm dialog), and Yönetici-only **hesap devre dışı / aktifleştir** via `set_status`.
4. **İşletmeler** (`Isletmeler.tsx`) — cari hesap list with derived balance (Alacağınız / Borcunuz / Hesap kapalı) + add/edit modal.
5. **İşletme detay** (`IsletmeDetay.tsx`) — cari summary (bakiye + toplam gelir/gider), add hareket (gelir/gider), and **Kasaya Yansıt** → `yansit_cari_hareket` RPC (atomic pending işlem + hareket status YOK→BEKLIYOR; becomes YANSIDI on Onay approval).
6. **Sabit Giderler** (`SabitGiderler.tsx`) — list + add/edit modal (name, tutar, ödeme günü 1–28 via GunDropdown) + delete with confirm.
7. **İşletme Ayarları** (`IsletmeAyarlari.tsx`) — İşletme adı (explicit save button when changed) + Gelir/Gider kategorileri add + remove (soft delete, confirm dialog).

### Shared components
- **FloatingSavePopup** (`components/ui/FloatingSavePopup.tsx`) — the design's "Kaydedilmemiş değişiklik" rise-in bar; shown only while dirty AND no modal open (never blocks a modal's buttons).
- **shared.tsx** (`features/yonetim/shared.tsx`) — `ScreenHeader` (back + icon + title + optional Ekle), `FormModal` (standard modal), `GunDropdown` (1–28 day picker, optional "elle ödeme"), `Avatar`, and the module SVG icon set.
- New CSS utility `rise-in` (translateY 10→0 + fade, 0.34s) in `styles/index.css`.

### Data layer
- **`features/yonetim/api.ts`** — TanStack Query hooks over existing RPCs/tables:
  - Paketler: `useCreatePaket` / `useUpdatePaket` / `useDeactivatePaket`
  - Personel: `useMembers` / `useMember` / `useMemberBusinessIds` / `usePendingProfiles` / `usePersonelOdemeler` / `useSetRole` / `useUpdateMemberPay` / `useSetBusinessAccess` / `useGiveAvans` / `usePayMaas` / `useApproveSignup` / `useSetStatus`
  - Cari: `useCariIsletmeler` / `useCariIsletme` / `useCreateCari` / `useUpdateCari` / `useAddHareket` / `useYansitHareket`
  - Sabit: `useCreateSabitGider` / `useUpdateSabitGider` / `useDeleteSabitGider`
  - Ayarlar: `useUpdateBusinessName` / `useAddKategori` / `useDeactivateKategori`
- **`features/yonetim/types.ts`** — Member, PersonelOdeme, CariIsletme, CariHareket, ROLE_LABELS/ROLE_OPTIONS.

### Routes (`App.tsx`)
All under `RequireRole roles={['YONETICI','MUHASEBE']}`:
`/yonetim/paketler`, `/yonetim/personel`, `/yonetim/personel/:id`, `/yonetim/isletmeler`, `/yonetim/isletmeler/:id`, `/yonetim/sabit-giderler`, `/yonetim/ayarlar`.

---

## Database
**No new migration for Sprint 3.** Every RPC used here already shipped in `002_functions.sql` (Sprint 0): `set_role`, `update_member_pay`, `set_business_access`, `give_avans`, `pay_maas`, `approve_signup`, `set_status`, `yansit_cari_hareket`. Ensure earlier migrations are applied: **006** (kayıt notlar) and **007** (ödeme yöntemi + approve RPC) must be run in the SQL editor if not already.

## RBAC notes (as implemented)
- All five modules open to **Muhasebe + Yönetici** (matches the approved matrix).
- **Yönetici-only** within the screens, enforced in UI *and* by the RPCs/RLS: Rol Değiştir, İşletme Erişimi, signup approval, hesap devre dışı/aktifleştir. Self role-change is blocked.
- Balances remain **derived** (cari bakiye computed client-side from hareketler; kasa untouched until Onay). Maaş/avans stay **born-approved** (skip Onay) per the owner decision.

---

## Before this is "done"
1. ~~Run `npm run build`~~ — ✅ done, clean.
2. Manually walk each screen logged in as Yönetici (and again as Muhasebe) to confirm RBAC gating and the money flows (avans/maaş → kasa; Kasaya Yansıt → Onay → kasa). *(Requires a second Muhasebe account to fully exercise.)*
3. Commit + push.

## Suggested commit
```
git add -A
git commit -m "Sprint 3: Yönetim modules (Paketler, Personel, İşletmeler, Sabit Giderler, Ayarlar)"
git push
```
