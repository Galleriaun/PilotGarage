# Handoff: Oto Servis/Galeri Kasa & Yönetim Uygulaması (Auto Service/Dealer Cash & Management App)

## Overview
A mobile app (iOS-style, 390×844 phone frame) for an auto service ("Servis") and car dealership ("Galeri") business. It has two user roles — **Personel** (front-desk staff who register vehicle check-ins) and **Yönetici** (owner/manager who runs finance, staff, packages, partner businesses, and settings). Core flows: sign in/up, vehicle intake ("Kayıt"), package/pricing management, cash-flow tracking (Gelir/Gider — income/expense) with a confirmation ("Onay") step before entries hit the balance, staff (Personel) records with salary/advance tracking, and partner-business running accounts ("İşletmeler" / cari hesap).

## About the Design Files
The file in this bundle — **`Auth.dc.html`** — is a **design reference/prototype**, built with an internal HTML templating format (custom `<sc-if>`/`<sc-for>` tags, `{{ }}` template holes, and a `DCLogic` class for state) that is **not standard HTML/JS and will not run as-is in a normal web or mobile stack**. Do not attempt to import or execute this file directly in production. Treat it purely as a precise visual and behavioral spec — screen layouts, copy, colors, spacing, and interaction logic — and **rebuild it natively in the target codebase's actual environment** (React Native, SwiftUI, Kotlin/Compose, plain React web, etc.), using that codebase's existing component library, navigation system, and state-management conventions. If the target project has no established stack yet, choose the framework best suited to the app (a mobile app strongly suggests React Native, Flutter, or native iOS/Android).

Despite the unusual template syntax, all markup is plain inline-styled `<div>`/`<span>`/`<svg>`/`<input>` elements, so every pixel value, color, and copy string can be read directly out of the file — search for the Turkish screen-name comments (e.g. `<!-- ── PERSONEL DETAY ── -->`) to jump to a section.

## Fidelity
**High-fidelity.** This is a pixel-level mockup: exact colors (hex), exact type sizes/weights, exact spacing, exact copy (in Turkish), and working click-through interaction logic (implemented in JS in the prototype). Recreate it pixel-perfectly using the target codebase's existing design system/components where equivalents exist; where the codebase has no equivalent component, match the prototype's exact values.

## App Shell & Global Chrome
- **Phone frame**: 390×844 white canvas, `border-radius:52px`, drop shadow, light gray page background (`#E8E8E8`) behind it. Recreate this only if the deliverable is a device-framed demo; ignore it for a real app (it's presentational chrome for the prototype, not app UI).
- **Status bar**: 50px tall, fake time + signal/wifi/battery icons — not part of the real app UI (the OS provides this).
- **Screen area**: fills the remaining space below the status bar; each "screen" is an absolutely-positioned full-bleed `<div>` that fades/slides in (see Motion below). Only one screen is visible at a time — this is effectively a single-activity/single-page app with a manual screen-stack (`screen` + `prevScreen` state, not a router).
- **Bottom nav bars**: two variants, swapped based on role:
  - **Personel nav** — bottom tab bar shown for staff screens.
  - **Yönetici nav** — bottom tab bar shown for manager screens (Ana Sayfa / Yönetim / etc.), see `<!-- ── ALT NAV: Yönetici ── -->` and `<!-- ── ALT NAV: Personel ── -->`.
  - A floating **"Onay" tab/badge** appears only in the Finans (Yönetim) context, and only for the Yönetici role, surfacing pending transactions awaiting confirmation.

## Design Tokens

### Colors
- **Background (canvas)**: `#fff` (screens), `#E8E8E8` (prototype page bg only)
- **Primary text**: `#111`
- **Secondary/muted text & labels**: `#888` (body secondary), `#ADADAD` / `#8A8A8A` (all-caps field labels, 11px)
- **Card/field fill (neutral)**: `#F7F7F7` (cards, rows), `#F2F2F2` (inputs, segmented controls, pill buttons), `#EEEEEE` (Yeni Kayıt form inputs) with `1.5px solid #E2E2E2` border
- **Primary action / dark button**: `#111` background, white text (e.g. "Kaydet", "Ekle", "Onayla")
- **Success / income / positive**: `#15803D` text, `#F0FDF4` fill
- **Danger / expense / delete**: `#C62828` text, `#FEF3F2` fill
- **Warning / advance (avans)**: `#D97706` (amber) text
- **Divider lines**: `#F0F0F0`
- Avatar circle fill: neutral gray `#EFEFEF` bg, `#555` initials (colored-avatar approach was explicitly rejected — keep neutral gray, not per-person color)

### Typography
- **Font family**: Figtree (Google Font, weights 400/500/600/700) throughout — no secondary font.
- **Screen titles (H1)**: 22–26px, weight 700, `letter-spacing:-.3px` to `-.4px`, color `#111`
- **Body/value text**: 15–16px, weight 500–700, `#111`
- **Field labels**: 11px, weight 700, uppercase, `letter-spacing:.5–.6px`, color `#ADADAD`/`#8A8A8A`
- **Secondary/subtitle text**: 12–14px, `#888`
- **Big monetary figures**: 25px, weight 700, `letter-spacing:-.5px`

### Spacing / Shape
- **Card radius**: 14–16px (content cards), 18–20px (modals, summary cards), 10–12px (buttons, small chips), 50% (avatars/circular icons)
- **Screen horizontal padding**: 24px (most screens), 28–30px (auth screens)
- **Card padding**: 14–18px
- **Gaps between stacked fields**: 10–16px
- **Modal**: centered, `max-width:320px` (or 300px for confirm dialogs), `padding:24px 22px`, `box-shadow:0 20px 50px rgba(0,0,0,.25)`, dark backdrop `rgba(0,0,0,.45)`

### Motion (recreate with native platform equivalents — these are NOT literal CSS to port)
- **Screen transitions**: forward nav slides in from the right + fades (28px translate, 0.32s, cubic-bezier(.22,1,.36,1)); back nav slides in from the left, same easing. This is the standard iOS push/pop curve — use `UINavigationController`-style transitions or React Navigation's default stack animation.
- **Modal present**: backdrop fade-in 0.25s ease; modal card scale+fade in from 0.92→1, 0.35s, cubic-bezier(0.22,1.15,0.36,1) (slight overshoot, iOS sheet-style spring).
- **Dropdown/menu open**: fades + slides down 6px, 0.22s, same ease-out curve.
- **Floating popup rise-in** (e.g. unsaved-changes bar): translateY 10px→0 + fade, 0.34s.
- **Tap feedback**: any tappable element scales to 0.96 on press, 0.32s spring-out on release — use native `Pressable`/`TouchableOpacity` scale feedback or `:active` transform.

## Navigation / Screen Inventory
State is a single flat `screen` enum with a `prevScreen`/`direction` pair driving transition direction — there is no real routing stack (no forward-history beyond one level back). **Recommend implementing this as a proper navigation stack** (React Navigation, UINavigationController, etc.) in production rather than copying the flat-enum approach, since users will expect multi-level back navigation.

Screens (in source order — search the HTML comment to jump to each):
1. **Giriş Yap** — Sign in (email/password, show/hide password, link to sign up)
2. **Kayıt Ol** — Sign up
3. **İşletme Seç** — Choose business context (Servis vs Galeri) after auth
4. **Personel Home** — Staff dashboard: list of vehicle check-ins ("Kayıt") grouped by durum (status: Aktif/Beklenen/Tamamlandı), each a colored status pill
5. **Kayıt Detay** — View/edit an existing vehicle record: customer name, vehicle info card (Marka/Model/Yıl/KM/**Ruhsat Numarası**/Paket Seçimi/Tarih), status-change with confirm dialog
6. **Yeni Kayıt Formu** — New vehicle intake form: Müşteri Adı, Plaka, Marka, Model, Yıl, KM, **Ruhsat Numarası**, Paket Seçimi (dropdown), Tarih, Fotoğraflar
7. **Yönetici Home** — Manager dashboard/landing
8. **Yönetim** — Finans home: balance widgets, Gelir Ekle / Gider Ekle buttons (with category picker, recurring/tekrar toggle), transaction list, Onay (pending confirmation) access
9. **Tüm İşlemler** — Full transaction list/history with category + date filters
10. **Yönetim Menü** — Management section index (Paketler, Personel, İşletmeler, Sabit Giderler, İşletme Ayarları entries)
11. **Paket & Fiyatlar** — CRUD list of service packages + prices
12. **Personel (list)** — Staff roster list
13. **Personel Detay** — Staff detail: monthly summary card (maaş/avans/kalan), Düzenle-gated edit fields (Aylık Maaş, Otomatik Ödeme Günü), Rol Değiştir (role picker modal: Yönetici/Muhasebe/Personel), Avans Ver (advance) flow, unsaved-changes floating Kaydet/Vazgeç popup
14. **İşletmeler (list)** — Partner-business running accounts list, each with an edit (pencil) button
15. **İşletme Detay (Cari Hesap)** — Partner running account: balance, add hareket (gelir/gider) with recurring option, feeds business cash total on payment
16. **Sabit Giderler** — Fixed/recurring expenses list (e.g. rent) with payment-day picker
17. **İşletme Ayarları** — Business settings: İşletme Adı (name), Gelir/Gider Kategorileri management (add/remove categories, feeds the category pickers on Gelir/Gider Ekle, Onay labels, and Tüm İşlemler filter)
18. **Onay** — Pending-transaction confirmation queue; Yönetici approves entries (with source/category shown) before they affect the balance

## Interactions & Behavior — key patterns to replicate
- **Draft + explicit save**: Personel Detay edits are held in a local draft (not applied to the live record) until the user taps **Kaydet** in a floating "Kaydedilmemiş değişiklik" popup (with a **Vazgeç** button to discard). This popup is hidden while any modal on that screen is open (so it never blocks a modal's own buttons). Apply this same draft/save pattern anywhere else a save action was requested in this app (it's the established pattern, not one-off).
- **Confirm-before-destroy**: every delete action (packages, categories, staff, fixed expenses, etc.) routes through one shared confirmation modal/dialog rather than deleting immediately.
- **Category pickers open on tap, nothing pre-selected**: opening a picker (e.g. Kategori, Rol) should not show a value as already selected — the user must explicitly choose.
- **Recurring toggle**: Gelir/Gider Ekle and İşletme hareket forms include a Bir Kez / Tekrarlanan segmented toggle; selecting Tekrarlanan reveals a frequency picker (e.g. weekly/monthly/yearly options).
- **Onay gate**: new Gelir/Gider entries do not immediately affect the balance — they queue in "Onay" for the Yönetici to confirm first (approve/reject), then reflect to the kasa (cash balance). The Onay screen shows each pending item's source/category (e.g. "Kayıt" origin).
- **İşletme (cari hesap) semantics**: a partner business's transactions live on their own running account balance; only when a payment against that account is collected does it feed into the main Finans/kasa totals.
- **Role picker**: three fixed roles only — Yönetici, Muhasebe, Personel (not a free-text field).

## State Management
The prototype keeps one flat state object per session (no persistence/backend) with fields including: `screen`, `prevScreen`, `direction`, `business` (servis/galeri), collections for `personel[]`, `paketler[]`, `isletmeler[]`, `gelirKategorileri[]`/`giderKategorileri[]`, `sabitGiderler[]`, transaction lists, and various modal-open/draft booleans per screen. In production, replace this with real persisted state (backend + client state manager) but preserve the same entities and their relationships:
- `Personel` → `{ name, role, maas, odemeGunu, avanslar[], odemeler[] }`
- `Paket` → `{ name, price }`
- `Isletme` (cari hesap) → `{ name, note, balance, hareketler[] }`
- `Kategori` → `{ key, label }` (separate lists for gelir/gider)
- `SabitGider` → `{ name, amount, odemeGunu }`
- `Kayıt` (vehicle intake) → `{ plaka, marka, model, yıl, km, ruhsatNumarası, musteriAdi, paket, tarih, fotoğraflar[], durum }`

## Assets
No external images/icons — all icons are hand-drawn inline SVG (stroke-based, ~14–24px, `#111`/`#555`/`#ADADAD`/status colors). No photography or logos are used; the "Fotoğraflar" field in Yeni Kayıt is a user-upload placeholder, not a real asset.

## Files
- `Auth.dc.html` — the full design reference. Every screen, color, spacing value, and copy string used in this document was sourced from this file. Search for the uppercase Turkish comment markers (e.g. `<!-- ── ONAY ── -->`) to locate each screen's markup, and the `class Component extends DCLogic` block near the bottom for the interaction/state logic referenced above.
