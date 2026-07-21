# PilotGarage — Architecture

**One PWA, two businesses.** A mobile-first web app for a Turkish auto operation running two related businesses side by side:

| Code | Business | Type |
|---|---|---|
| `SERVIS` | **PilotGarage** | Auto service (vehicle check-ins, packages) |
| `GALERI` | **Arabam.com** | Car dealership (galeri) |

Staff sign in once; Yönetici picks (and can switch) the active business at any time. All operational data is scoped per business. The design reference is a pixel-level prototype in [`design/Auth.dc.html`](design/Auth.dc.html) with a behavioral spec in [`design/README.md`](design/README.md) — **we follow it for ~90% of the UI** and rebuild it natively (the `.dc.html` file is a spec, never imported).

---

## 1. Product principles (non-negotiable)

1. **Finance must be flawless.** Every invariant that involves money lives in Postgres (constraints, triggers, `SECURITY DEFINER` RPCs) — never only in client code. Balances are always **derived** from approved transactions, never stored as a mutable number.
2. **RBAC must be airtight.** A role must never see or reach a section it isn't entitled to. Enforced by RLS (server) *and* hidden in the UI (client) — RLS is the security boundary, the UI is just courtesy.
3. **PWA is first-class.** Installable on iOS + Android from the browser, offline app shell, correct safe-area behavior. Treated as a feature, not packaging.
4. **Fast for daily use.** Clean UI per the design; personnel complete their tasks in seconds.
5. **Latest stable versions** of every dependency at scaffold time, so we don't pay an upgrade tax later.
6. **DRY, KISS, YAGNI, SOLID.** One shared confirm dialog, one modal system, one money formatter, one draft/save pattern — exactly as the design prescribes.

## 2. Stack (locked)

- **Frontend:** Vite + React 19 + TypeScript + Tailwind CSS v4 — *exact latest stable versions resolved with `npm` at scaffold time*
- **Routing:** React Router v7 (library mode), `basename: '/PilotGarage'`
- **Server state:** TanStack Query v5; **forms:** react-hook-form + zod
- **UI primitives:** Radix UI (Dialog, DropdownMenu) styled with Tailwind to match the design tokens — the design is fully custom, so no prebuilt component theme
- **Font:** Figtree 400/500/600/700, self-hosted via `@fontsource-variable/figtree` (works offline, no Google CDN)
- **PWA:** `vite-plugin-pwa` (Workbox)
- **Backend:** Supabase — Postgres + Auth + Storage + Edge Functions (EU/Frankfurt region)
- **Hosting:** GitHub Pages (repo `PilotGarage`) + GitHub Actions (deploy + keepalive)
- **Images:** `browser-image-compression` (~200 KB JPEG, max 1280px) before any upload

> Supabase free tier allows 2 active projects — HomeGuru uses one, PilotGarage is the second. Keepalive workflow required (see §10). Pro upgrade deferred (owner decision 2026-07-07); when it happens later: drop `keepalive.yml` (Pro never auto-pauses) and relax image compression to max 1920px/~500 KB (storage stops mattering, but keep compression — mobile upload speed and egress are the real constraints).

## 3. Roles & access matrix

Three fixed roles (design role picker) plus one implicit lifecycle state:

| Role | Design description | Landing screen |
|---|---|---|
| `YONETICI` | "Tüm yetkilere sahip" | İşletme Seç → Yönetici Home |
| `MUHASEBE` | "Finans ve raporlar" | Yönetici Home (finance subset) |
| `PERSONEL` | "Sınırlı erişim" | Personel Home |
| *(pending)* | — signup not yet approved | "Hesabınız onay bekliyor" screen only |

| Capability | PERSONEL | MUHASEBE | YONETICI |
|---|---|---|---|
| Kayıt list / detail / new / durum change | ✅ | ✅ | ✅ |
| Read paketler (for the picker) | ✅ | ✅ | ✅ |
| Yönetim (finance home, widgets) | ❌ | ✅ | ✅ |
| Gelir/Gider Ekle (→ Onay queue) | ❌ | ✅ | ✅ |
| Tüm İşlemler (history + filters) | ❌ | ✅ | ✅ |
| **Onay** (approve/reject pending, kayıt silme kararı) | ❌ | ❌ | ✅ |
| **İstekler** (avans/şikayet/öneri — see *and* decide) | own only | ❌ | ✅ |
| İşletmeler (cari hesap) + hareket + yansıt | ❌ | ✅ | ✅ |
| Paket & Fiyatlar management | ❌ | ✅ | ✅ |
| Personel management (roster, maaş, avans) | ❌ | ✅ | ✅ |
| **İzinler** (yıllık izin ekle/sil) | ❌ | Personel hedefler | ✅ herkes |
| **Rol Değiştir** (change a user's role) | ❌ | ❌ | ✅ |
| **İşletme Erişimi** (grant/revoke business access) | ❌ | ❌ | ✅ |
| Sabit Giderler management | ❌ | ✅ | ✅ |
| **İşletme Ayarları** (name, categories, mesai konum/IP) | ❌ | ❌ | ✅ |
| Approve signups / assign roles | ❌ | ❌ | ✅ |
| Business access | assigned only | assigned only | **both, always** |

- **Muhasebe = Yönetici minus role control minus Onay** (owner decision 2026-07-07, narrowed 2026-07-20 by migration 044): full management + finance access within assigned business(es), but **approving/rejecting** a pending işlem or a kayıt silme isteği is Yönetici-only, as is anything that changes a user's role, grants/revokes business access, or approves a signup. Muhasebe still *creates* entries that land in the Onay queue and still deletes işlemler — it just cannot be the one to decide them.
- The **Onay floating badge** renders for `YONETICI` only (044) — back in line with the design README, which drew it Yönetici-only. Route `/yonetim/onay` is guarded the same way; the real boundary is in the RPCs (`approve_islem`, `reject_islem`, `approve_kayit_silme`, `reject_kayit_silme`).
- ONAY / KAYIT_SILME **notifications** are generated for and visible to Yönetici only (044) — Muhasebe must not be pinged about a screen it cannot open.
- **İstekler are Yönetici-only, including visibility** (046, 2026-07-21): Muhasebe cannot read the `istekler` table at all, not merely the screen — a şikayet may be about the Muhasebe. Staff still file their own and see them under İsteklerim.
- **İzinler are tiered** (048, 2026-07-21): Muhasebe adds/deletes leave only for PERSONEL-role members; Yönetici for everyone. The target's role is checked in RLS (`izin_yazabilir`, SECURITY DEFINER), not just the UI. Reads are finance-wide so the "İzinde" badge renders everywhere.
- **İşletme Ayarları is Yönetici-only** (047, 2026-07-21): the `businesses` UPDATE policy and `kategoriler` INSERT/UPDATE policies require Yönetici — name/telefon/adres, mesai konum + ofis IP'leri, and kategori add/soft-delete. Reads are untouched (Muhasebe still reads kategoriler for the Gelir/Gider picker and reports).
- Muhasebe uses the Yönetici bottom nav and the Yönetim Menü; role controls (Rol Değiştir, signup approval), Onay, İstekler and İşletme Ayarları are hidden.
- **Yönetici decides per user which business(es) they see** — PilotGarage only, Arabam.com only, or both — via an **İşletme Erişimi** selector in Personel Detay (owner decision 2026-07-07; this control is an addition to the design prototype, which has none).
- Business switching: Yönetici switches freely (İşletme Seç + in-app switcher); Personel/Muhasebe assigned to one business skip İşletme Seç entirely; if assigned to both, they get the picker too. Last choice remembered in `localStorage`.

## 4. Auth & account lifecycle (open signup, gated)

1. **Kayıt Ol** (design screen) is live — anyone can sign up via Supabase Auth.
2. A DB trigger on `auth.users` creates a `profiles` row with `role = NULL`, `status = 'PENDING'`.
3. Pending users see only the "onay bekliyor" screen. **RLS gives them zero rows on every table** — the `NULL` role case is explicitly tested, not assumed (deny-by-default policies never match `role IS NULL`).
4. Yönetici sees pending signups in the Personel screen, assigns **role + business access (PilotGarage, Arabam.com, or both) + maaş/ödeme günü** → `status = 'ACTIVE'`. Business access can be changed later from Personel Detay (İşletme Erişimi, Yönetici-only).
5. `status = 'DISABLED'` cuts all access instantly (RLS checks `status = 'ACTIVE'` everywhere).

Notes: Supabase built-in SMTP allows ~4 confirmation emails/hour — fine at staff scale. Role/status live in `profiles`, read by RLS through a `SECURITY DEFINER` helper (avoids recursive-policy pitfalls). Roles are **never** trusted from the client.

## 5. Data model

Convention: infra tables in English (`profiles`, `businesses`, `business_members`, `audit_log`); domain tables use the design's Turkish vocabulary (`kayitlar`, `paketler`, `islemler`, …). All domain tables carry `business_id`. All money columns are `NUMERIC(12,2) CHECK (> 0)` — sign is derived from `tur`, never stored negative.

```
profiles            id (= auth.users.id), full_name, role ENUM(YONETICI|MUHASEBE|PERSONEL) NULL,
                    status ENUM(PENDING|ACTIVE|DISABLED), created_at
businesses          id, code ENUM(SERVIS|GALERI) UNIQUE, name, telefon, adres        -- 2 seeded rows
business_members    profile_id, business_id, maas NUMERIC(12,2), odeme_gunu INT 0..28,  -- 0 = elle ödeme
                    PK(profile_id, business_id)
personel_odemeler   id, profile_id, business_id, tur ENUM(MAAS|AVANS), tutar, note,
                    tarih, islem_id FK, created_by
paketler            id, business_id, name, price, is_active BOOL                     -- soft delete
kayitlar            id, business_id, musteri_adi, plaka, marka, model, yil, km, ruhsat_no,
                    notlar, paket_id FK, tarih, durum ENUM(AKTIF|BEKLENEN|TAMAMLANDI),
                    created_by, created_at, updated_at
kayit_fotograflar   id, kayit_id, storage_path, created_by
kategoriler         id, business_id, tur ENUM(GELIR|GIDER), label, is_active         -- soft delete
islemler            id, business_id, tur ENUM(GELIR|GIDER), tutar, baslik, kategori_id FK,
                    kaynak ENUM(MANUEL|KAYIT|CARI_HESAP|SABIT_GIDER|PERSONEL),
                    durum ENUM(BEKLIYOR|ONAYLANDI|REDDEDILDI),
                    odeme_yontemi ENUM(NAKIT|KREDI_KARTI) NULL,
                    islem_tarihi, created_by, onaylayan, onaylanma_tarihi,
                    kayit_id FK NULL, cari_hareket_id FK NULL
tekrar_kurallari    id, business_id, tur, tutar, baslik, kategori_id,
                    siklik ENUM(HAFTALIK|AYLIK|YILLIK), next_run, is_active
cari_isletmeler     id, business_id, name, note
cari_hareketler     id, cari_isletme_id, tur ENUM(GELIR|GIDER), tutar, note, tarih,
                    kasa_durumu ENUM(YOK|BEKLIYOR|YANSIDI)
sabit_giderler      id, business_id, name, tutar, odeme_gunu INT 1..28
audit_log           id, actor, action, table_name, row_id, details JSONB, at
```

Soft deletes (`is_active`) on `paketler` and `kategoriler` because history references them; pickers only show active rows. Cari hesap balance (`alacak/borç`) is derived per partner: `SUM(gelir) - SUM(gider)` over its `hareketler`.

## 6. Finance integrity — the Onay gate

**Rule zero: nothing touches the kasa until Yönetici or Muhasebe approves it.** Every money entry is born `BEKLIYOR` in `islemler` and only counts after `ONAYLANDI` — with **one deliberate exception** (owner decision, 2026-07-07): **maaş and avans payments (`kaynak = PERSONEL`) skip the Onay queue and are born `ONAYLANDI`**, because the person triggering them is already an approver. The `pay_maas` / `give_avans` RPCs verify the caller is an active Yönetici/Muhasebe and stamp `onaylayan` at insert; cron auto-payments on `odeme_gunu` are likewise born `ONAYLANDI` (`onaylayan = NULL`, audit-logged as system). Born-approved rows are immutable like any approved row — corrections are counter-entries.

- **Balance is a view, not a column.** `v_kasa_ozet` computes gelir/gider/bakiye per business strictly from `durum = 'ONAYLANDI'` rows. Period widgets (Tümü/Bugün/Hafta/Ay) and Tüm İşlemler filter server-side over the same rows. No drift possible.
- **State machine enforced in the DB.** Clients get `INSERT` (as `BEKLIYOR` only — enforced by CHECK/RLS `WITH CHECK`) and `SELECT`. Direct `UPDATE`/`DELETE` on `islemler` is denied. The only transitions are `approve_islem(id, ödeme_yöntemi?, komisyon?)` / `reject_islem(id)` — `SECURITY DEFINER` RPCs that verify the caller is an active **Yönetici** with access to the business (narrowed from finance by 044, 2026-07-20), stamp `onaylayan`/`onaylanma_tarihi`, and audit-log.
- **Ödeme yöntemi (Nakit / Kredi Kartı)** — owner decision 2026-07-07: transactions carry an optional payment method. It is *not* asked on the kayıt screens; for `KAYIT`-sourced işlemler the approver picks it in the Onay section, and `approve_islem` **refuses** to approve a `KAYIT` işlem without one (DB-enforced). Manual entries set it in Gelir/Gider Ekle (Sprint 2); maaş/avans and cron entries leave it NULL. A trigger rejects any mutation of a row already `ONAYLANDI`/`REDDEDILDI` — corrections are made with a counter-entry (standard accounting), never by editing history.
- **Pending rows** may be deleted by their creator, Muhasebe, or Yönetici (typo escape hatch) while still `BEKLIYOR`.
- **Linked side effects are atomic.** `approve_islem` on a `CARI_HESAP` entry sets the linked `cari_hareketler.kasa_durumu = 'YANSIDI'`; reject resets it to `'YOK'` — same transaction, exactly as the prototype behaves.
- **No float math anywhere.** Postgres `NUMERIC` on the server; on the client all arithmetic is integer **kuruş**, with one shared `formatTL()` (`Intl.NumberFormat('tr-TR')`) and one shared amount-input parser (accepts comma decimals, validates > 0, max 2 decimals).
- Every RPC and status change writes to `audit_log`.

### Money flows (all end in the Onay queue)

| Source (`kaynak`) | Trigger |
|---|---|
| `MANUEL` | Gelir/Gider Ekle modal (Muhasebe/Yönetici) |
| `KAYIT` | DB trigger: kayıt `durum → TAMAMLANDI` with a paket → pending GELİR for the paket price (`"34 ABC 123 — Genel Servis"`), once per kayıt. Reverting from TAMAMLANDI deletes the entry if still pending; if already approved, correction is manual. |
| `CARI_HESAP` | "Kasaya Yansıt" on a hareket → pending işlem + `kasa_durumu = 'BEKLIYOR'` |
| `SABIT_GIDER` | Daily `pg_cron` job: on each item's `odeme_gunu` → pending GİDER |
| `PERSONEL` | Avans Ver and maaş payment (manual or auto on `odeme_gunu`) → GİDER born **`ONAYLANDI`** (skips Onay — see rule-zero exception), linked from `personel_odemeler` |
| recurring | Daily cron materializes due `tekrar_kurallari` → pending işlem, advances `next_run` |

## 7. RLS design

- **Deny by default.** RLS enabled on every table; no policy → no rows.
- Helpers (`SECURITY DEFINER STABLE`): `auth_role()`, `auth_status()`, `is_member_of(business_id)`, `is_yonetici()`.
- Every policy requires `auth_status() = 'ACTIVE'` — so `PENDING`/`DISABLED`/`NULL` users match nothing.
- Business scoping: `is_member_of(business_id) OR is_yonetici()` (Yönetici spans both businesses).
- Role gates per matrix (§3): `islemler` SELECT/INSERT require MUHASEBE|YONETICI + business scope; management tables (`paketler`, `kategoriler`, `sabit_giderler`, `businesses`, `personel_odemeler`, `cari_*`) writable by MUHASEBE|YONETICI within business scope; `kayitlar` writable by all three active roles within their business; everyone can read their own membership row.
- **Role and business access are Yönetici-only at the database level:** `profiles.role`/`profiles.status` are written exclusively through Yönetici-gated RPCs (`set_role` / signup approval), and `business_members` rows are **added/removed only via a Yönetici-gated RPC** (`set_business_access`) — membership rows *are* business access. Muhasebe may update only the pay fields (`maas`, `odeme_gunu`) of existing members in their business (column-level grants + policy). Muhasebe has **no write path to any role, status, or membership field** — enforced by policy, not just hidden in the UI.
- `business_id` is **derived from membership, never trusted from the request body** — inserts re-check it in `WITH CHECK`.
- Storage: `kayit-fotograflar` bucket private; paths prefixed `business_id/kayit_id/`; storage policies mirror table policies.

## 8. Frontend architecture

```
src/
  app/            router, providers (Auth, ActiveBusiness, QueryClient), AppShell (bottom nav + safe-area)
  components/ui/  Modal, ConfirmDialog (shared delete confirm), Dropdown, SegmentedControl,
                  StatusPill, Avatar (neutral gray, initials), FloatingSavePopup, AmountInput
  features/       auth/ kayit/ finans/ onay/ paketler/ personel/ cari/ sabit-giderler/ ayarlar/
  lib/            supabase.ts, money.ts (kuruş + formatTL), rbac.ts, image.ts, dates.ts
```

- **Route guards** by role + status (pending → waiting screen; wrong role → redirect). Guards mirror RLS — never substitute for it.
- **Design patterns from the handoff, implemented once and reused:** draft + explicit Kaydet/Vazgeç floating popup (hidden while any modal is open); one shared confirm-before-delete dialog; pickers open with nothing pre-selected; Bir Kez/Tekrarlanan segmented toggle revealing a frequency picker.
- **Motion:** iOS push/pop slide+fade (0.32s, `cubic-bezier(.22,1,.36,1)`), modal scale 0.92→1 with overshoot, press-scale 0.96 — as CSS transitions per the design README.
- **Layout:** mobile-first 100% width, `max-width: 480px` centered on desktop; Tailwind v4 `@theme` maps the design tokens (ink `#111`, muted `#888`/`#ADADAD`, fills `#F7F7F7`/`#F2F2F2`, success `#15803D`/`#F0FDF4`, danger `#C62828`/`#FEF3F2`, amber `#D97706`, radii 10–20px, Figtree).

## 9. PWA (first-class requirement)

- **Manifest:** `name/short_name: "PilotGarage"`, `lang: "tr"`, `display: "standalone"`, `orientation: "portrait"`, `theme_color: "#111111"`, `background_color: "#ffffff"`, icons 192/512 + maskable, `start_url`/`scope: "/PilotGarage/"`; `apple-touch-icon` 180px + iOS meta tags for standalone mode.
- **Service worker:** Workbox `generateSW`; precache app shell + fonts; `registerType: 'prompt'` with an in-app "Yeni sürüm hazır — Güncelle" toast (never auto-reload mid-form — finance data entry must not be interrupted).
- **Offline policy (MVP, deliberate):** shell and fonts work offline; Supabase calls are network-only with a visible offline banner. **No offline writes and no cached finance data** — stale balances and sync conflicts are unacceptable in the finance section (KISS + correctness over convenience).
- **Safe areas:** `viewport-fit=cover`; bottom nav pads with `env(safe-area-inset-bottom)` (the design's home-indicator gap).
- Install instructions (Add to Home Screen for iOS Safari) shown on first login.

## 10. Deployment & CI/CD

- **`deploy.yml`:** on push to `main` → `npm ci` → typecheck + `vite build` (Vite `base: '/PilotGarage/'`) → deploy to GitHub Pages.
- **SPA fallback from day one:** `public/404.html` redirect + restore script in `index.html` (GitHub Pages + BrowserRouter requirement).
- **`keepalive.yml`:** pings the DB every 6 days (Supabase free tier pauses after 7 idle days).
- **Repo secrets:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (public-safe by design — RLS is the boundary), `SUPABASE_SECRET_KEY` (Edge Function deploys only, never in the bundle).

## 11. Timezone & scheduling

Turkey is UTC+3 year-round (no DST since 2016). `pg_cron` runs in UTC → the daily materializer (sabit giderler, maaş auto-payments, tekrar kuralları) runs at **21:05 UTC = 00:05 Istanbul**. All `odeme_gunu` values are capped at 28 to avoid short-month bugs. Required extensions: `pgcrypto`, `pg_cron` (enable in Database → Extensions before migrations).

## 12. Security checklist (OWASP Top 10 — **2025 edition**, owner requirement 2026-07-07)

- **A01 Broken Access Control:** RLS deny-by-default on every table; NULL-role/pending user gets zero rows (explicitly tested); role, status, and business access writable only through Yönetici-gated RPCs; storage paths business-scoped; every policy re-verified when a feature touches it.
- **A02 Security Misconfiguration:** automatic-RLS event trigger enabled on the Supabase project; storage bucket private; signups gated by approval (§4); auth Site URL + redirect allowlist configured; secret key never in the client bundle (grep `dist/` pre-launch).
- **A03 Software Supply Chain Failures:** exact-pinned dependency versions + committed lockfile; `npm audit` (production deps, high+) blocks CI; GitHub Actions pinned by version; deploys only from `main` on GitHub-hosted runners.
- **A04 Cryptographic Failures:** TLS end to end (Pages + Supabase); no sensitive plaintext beyond operational need; salaries readable only by Yönetici/Muhasebe within business scope; no custom crypto.
- **A05 Injection:** supabase-js parameterization; no string-built SQL in RPCs (`set search_path = public` on every `SECURITY DEFINER` function); React auto-escaping, no `dangerouslySetInnerHTML`; CSV formula-injection guard if exports are added later.
- **A06 Insecure Design:** the finance invariants are *designed into* Postgres — Onay state machine, immutable decided rows, derived-only balances, counter-entry corrections — so no client bug can corrupt the kasa.
- **A07 Authentication Failures:** Supabase Auth (PKCE) sessions; 8+ char passwords; auth rate limits on; `DISABLED` cuts access at the next request via RLS, not just the UI.
- **A08 Software or Data Integrity Failures:** immutability trigger on decided işlemler; partial unique indexes dedupe cron reruns (a re-fired job can never double-post money); `audit_log` is insert-only with no client write path.
- **A09 Security Logging & Alerting Failures:** `audit_log` captures every money mutation, approval/rejection, and role/status/business-access change with actor + timestamp; Yönetici-readable.
- **A10 Mishandling of Exceptional Conditions:** RPCs validate-then-act and `raise` on any violation, rolling back the whole transaction — no partial money writes; the client surfaces failures in Turkish (never swallows them); photo-upload failures are reported, never silent.

## 13. Delivery plan

- **Sprint 0 — Foundation:** scaffold (Vite/React 19/TS/Tailwind 4/PWA), Supabase project + migrations (schema, helpers, RLS, cron, seed: 2 businesses + default kategoriler), auth + pending gate + İşletme Seç, app shell with both navs, CI/CD (deploy + keepalive + 404.html), design tokens.
- **Sprint 1 — Kayıt module:** Personel Home (grouped by durum + filters), Yeni Kayıt form (paket picker, photos with compression), Kayıt Detay (edit, durum change with confirm, lightbox), TAMAMLANDI→pending gelir trigger.
- **Sprint 2 — Finance core:** Yönetim home (period widgets, cash-flow chart, spending categories, recurring preview), Gelir/Gider Ekle (incl. Nakit/Kredi Kartı choice), **Onay queue** (approval of kayıt-sourced entries requires picking Nakit/Kredi Kartı), Tüm İşlemler (type/category/date + custom range filters).
- **Sprint 3 — Yönetim modules:** Yönetim menü (dropdown on Finans header), Paketler CRUD, Personel (roster, detail with draft/save popup, rol değiştir, işletme erişimi selector, avans, maaş payment + auto-pay cron), İşletmeler cari hesap (hareketler, Kasaya Yansıt), Sabit Giderler + cron, İşletme Ayarları (isim/telefon/adres + kategoriler management).
- **Sprint 4 — Hardening:** tekrar kuralları, audit review, full RBAC walkthrough per role, PWA install/offline test on real iOS + Android, pre-launch checklist (§15).

## 14. Provisional decisions (flag if you disagree)

1. Maaş + avans payments create **directly-approved GİDER işlemler** — they hit the kasa immediately, skipping Onay (owner decision 2026-07-07; the prototype only logged them locally).
2. Kayıt completion auto-queues the paket price as pending gelir; kayıt without paket queues nothing.
3. Yönetici always has both businesses. Access comes from `is_yonetici()` in RLS regardless of memberships; as of migration 010 they also carry both-business `business_members` rows (maaş 0, no auto-pay) so the owner appears in the Personel roster and can draw their own maaş/avans (owner request 2026-07-09).
4. **Signup approval stays Yönetici-only** — approving a signup assigns a role, so I placed it under the "Muhasebe can't change roles" rule (owner decision 2026-07-07). Flag if Muhasebe should be able to approve signups too.
5. Paket/kategori deletes are soft (history preserved).

## 15. Pre-launch checklist (mandatory before production)

- [ ] Every role walked through every screen — no forbidden section reachable (UI *and* direct API)
- [ ] Pending/NULL-role user gets zero rows on every table (automated RLS test)
- [ ] Muhasebe cannot change any user's role, status, or business access — verified in the UI *and* against the API/RPCs directly
- [ ] A user assigned to one business sees zero rows from the other business on every table (automated RLS test)
- [ ] Onay gate verified: no path writes an `ONAYLANDI` işlem except `approve_islem`, `pay_maas` (+ the cron's auto-maaş), the sabit gider / tekrar materializer (016, 019) and `para_transferi` (041). **Avans and prim are NOT exceptions since 045** — they are born `BEKLIYOR` like everything else. Approved rows immutable.
- [ ] A `KAYIT`-sourced işlem cannot be approved without ödeme yöntemi — verified against the RPC directly, not just the UI
- [ ] `v_kasa_ozet` equals hand-computed totals on seeded data (all period filters)
- [ ] Cari yansıt → approve/reject → `kasa_durumu` round-trip correct
- [ ] Cron ran in staging: sabit gider + maaş + tekrar entries appear at 00:05 Istanbul
- [ ] PWA installs on real iPhone (Safari) and Android (Chrome); offline shell + banner OK; update prompt OK
- [ ] `npm run build` + typecheck clean; `npm audit` reviewed
- [ ] Keepalive workflow green twice consecutively
- [ ] Secrets present in repo; secret key absent from bundle (grep `dist/`)
