# PilotGarage — Project Summary

**As of:** 2026-07-08
**One mobile-first PWA, two businesses:** PilotGarage (`SERVIS` — auto service) and Arabam.com (`GALERI` — dealership). Staff sign in once; Yönetici picks/switches the active business in-app. All operational data is business-scoped.

**Canonical design:** [`ARCHITECTURE.md`](ARCHITECTURE.md) · **Onboarding:** [`SETUP.md`](SETUP.md) · **UI spec:** [`design/Auth.dc.html`](design/) (followed for ~90% of the UI; never imported).

---

## Status at a glance

| Sprint | Scope | Code | Build | Live-tested |
|---|---|---|---|---|
| 0 — Foundation | Scaffold, DB, auth, shell, CI/CD | ✅ | ✅ | partial |
| 1 — Kayıt | Home lists, Yeni Kayıt, Kayıt Detay | ✅ | ✅ | ⏳ user |
| 2 — Finance | Yönetim, Gelir/Gider, Onay, Tüm İşlemler | ✅ | ✅ | ⏳ user |
| 3 — Yönetim | Paketler, Personel, İşletmeler, Sabit Giderler, Ayarlar | ✅ | ✅ | ⏳ user |
| 4 — Hardening | Audit fixes, RLS test suite, tekrar UI, code-splitting | ✅ code side | ✅ | ⏳ user (see `SPRINT4_SUMMARY.md`) |

**"Build ✅"** = `tsc --noEmit && vite build` clean (last run 2026-07-08: 280 modules, 0 TS errors).
**"Live-tested ⏳"** = compiles and reviewed by reading, but the runtime money/RBAC flows still need a walkthrough on the deployed app against real Supabase (cannot be done from the dev side — needs login, and a 2nd account for Muhasebe-vs-Yönetici).

---

## Stack (latest stable, pinned)

Vite 8.1 · React 19.2 · TypeScript 6.0 · Tailwind CSS 4.3 · React Router 8.1 (library mode, `basename /PilotGarage`) · TanStack Query 5 · Radix UI (Dialog/DropdownMenu) · Supabase (Postgres + Auth + Storage, EU/Frankfurt) · `vite-plugin-pwa` 1.3 (Workbox) · `browser-image-compression` (lazy-loaded) · self-hosted Figtree font.

**Hosting:** GitHub Pages (`Galleriaun/PilotGarage`) via GitHub Actions + Supabase free tier (keepalive every 6 days). Deployed at `https://galleriaun.github.io/PilotGarage/`.

---

## Database — 18 migrations

Run in order in the Supabase SQL editor. **1–7 applied as of 2026-07-08; 8–18 are new (Sprint 4) — run them.**

1. `001_schema.sql` — enums, tables, `v_kasa_ozet` view (balance is a **view over ONAYLANDI rows**, never stored)
2. `002_functions.sql` — RLS helpers, triggers, all RPCs (Onay gate, roles, cron body)
3. `003_rls.sql` — deny-by-default RLS on every table + storage bucket
4. `004_cron.sql` — daily materializer at 21:05 UTC = 00:05 Istanbul
5. `005_seed.sql` — 2 businesses + default categories
6. `006_kayit_notlar.sql` — kayıt notlar column
7. `007_odeme_yontemi.sql` — Nakit/Kredi Kartı + 2-arg `approve_islem`
8. `008_reject_yenidenkullanim.sql` — reject-path fixes: cari re-yansıt + kayıt geliri re-queue (Sprint 4 audit)
9. `009_profil_gorunurlugu.sql` — same-business staff read colleague names (kayıt/işlem creator display; salaries stay finance-only)
10. `010_yonetici_uyelik.sql` — Yönetici gets both-business membership rows so the owner appears in the Personel roster and can draw own maaş/avans (maaş 0 = no auto-pay)
11. `011_cari_tekrar.sql` — recurring cari hareketler: tekrar rules may target a cari işletme; cron materializes a monthly hareket born `YOK` (kasa untouched until yansıt + Onay)
12. `012_cari_hareket_silme.sql` — delete policy for `YOK` hareketler (typo escape hatch; BEKLIYOR/YANSIDI stay undeletable)
13. `013_kayit_silme.sql` — kayıt deletion through Onay: staff file a silme isteği, finance approves in the Onay queue (deletes the kayıt + its still-pending gelir; decided gelirler survive detached). Also fixes `islemler_immutable_guard` rejecting FK `ON DELETE SET NULL` detaches — deleting any parent of a decided işlem used to fail.
14. `014_sabit_gider_kategori.sql` — `sabit_giderler.kategori_id` (optional); materializer copies it onto the queued işlem so the kategori chip shows everywhere.
15. `015_cari_silme.sql` — `delete_cari_isletme` RPC (finance): deletes the işletme + hareketler + its rules, removes still-pending kasa entries; decided işlemler stay detached and render as "Silinen işletme: …".
16. `016_sabit_gider_otomatik.sql` — sabit giderler born `ONAYLANDI` (owner decision 2026-07-10: pre-approved by definition, straight to kasa like maaş/avans — the **second** exception to the Onay gate).
17. `017_prim.sql` — `PRIM` odeme_tur + `give_prim` RPC (born-ONAYLANDI gider, bonus on top of maaş, never deducted); `set_role` gains a last-active-Yönetici guard.
18. `018_bildirim_cop.sql` — `notifications` (rows created by triggers: BEKLIYOR işlem → finance, silme isteği → finance, new signup → Yönetici; own-rows RLS, mark-read column grant, `profiles.notif_prefs`) + `trash` (AFTER DELETE snapshot of kayıt/işletme/hareket/sabit gider/tekrar kuralı, capped at newest 50 per business, finance-only read; hareket cascade skipped when its işletme is the deleted item).

**Required Supabase extensions:** `pgcrypto`, `pg_cron`.

**Test suite:** `supabase/tests/rls_smoke_test.sql` — self-rolling-back RLS/invariant
smoke test (15 checks); run whole file in the SQL editor, expect `ALL TESTS PASSED`.

---

## Non-negotiable invariants (enforced in Postgres, not client)

- **Onay gate:** every money entry is born `BEKLIYOR` and hits the kasa only after Yönetici/Muhasebe approves via RPC. **Exception:** maaş/avans (`PERSONEL`) are born `ONAYLANDI` (the payer is already an approver).
- **Kasa balance is always derived** from `ONAYLANDI` rows — no stored mutable number can drift.
- **Approved/rejected rows are immutable** (DB trigger); corrections are counter-entries.
- **Ödeme yöntemi:** kayıt-sourced işlemler **cannot be approved without** Nakit/Kredi Kartı (RPC-enforced).
- **Money math:** `NUMERIC(12,2)` server-side, integer **kuruş** client-side, one shared `formatTL`. No float arithmetic.
- **RBAC:** deny-by-default RLS; a PENDING/NULL-role user gets **zero rows**. Role/status/business-access writable only through Yönetici-gated RPCs.

## Roles

- **YONETICI** — everything, both businesses.
- **MUHASEBE** — Yönetici *minus role control*: full management + finance incl. Onay, but cannot change roles/status/business access or approve signups. Business-scoped.
- **PERSONEL** — kayıt only.
- **PENDING** (role = NULL) — open signup, gated: sees nothing until Yönetici assigns role + business.

---

## What's built, by area

**Auth** — sign in / sign up / password reset (Turkish app-styled validation, no native popups), pending-approval gate, İşletme Seç, role+status+business route guards.

**Kayıt** — Personel Home (flat searchable list), Yönetici Home (stats + durum filters + grouped list), Yeni Kayıt (full form + photo compression/upload), Kayıt Detay (carousel + lightbox, draft edit, durum change → DB trigger queues gelir on TAMAMLANDI).

**Finans** — Yönetim home (derived bakiye card + period delta, Gelir/Gider, period chips, Son İşlemler, Raporlar carousel: cash-flow / spending / sabit ödemeler), Gelir/Gider Ekle (kategori + ödeme yöntemi + Bir Kez/Tekrarlanan), **Onay queue** (source badges, Nakit/KK selector, approve/reject), Tüm İşlemler (tur/kategori/tarih filters + custom range).

**Yönetim** — Finans-header dropdown → Paketler CRUD, Personel roster + Yönetici-only signup approval + Personel Detay (draft/save edit, Rol Değiştir, İşletme Erişimi, Avans Ver, Maaş Öde, hesap devre dışı), İşletmeler cari hesap (list + detail + Kasaya Yansıt), Sabit Giderler CRUD, İşletme Ayarları (name + kategoriler).

**PWA** — installable iOS/Android, offline app shell, update prompt (no auto-reload mid-form), safe-area in-flow bottom nav, network-only Supabase (no stale finance data).

---

## Known-good & known-pending

**Verified:** full TypeScript build clean; auth redirects and screen structure confirmed in the dev preview; several mobile fixes shipped (iOS date-input width, screen-entrance horizontal shift, bottom-nav drift).

**Pending (needs the deployed app + logins):**
1. Runtime walkthrough of every screen as **Yönetici** and again as **Muhasebe** — confirm no forbidden section is reachable.
2. Money flows end to end: kayıt→Onay→kasa; Gelir/Gider Ekle→Onay→kasa; Cari "Kasaya Yansıt"→Onay→YANSIDI; Avans/Maaş→kasa immediately.
3. Cron fires overnight (sabit gider + auto-maaş + tekrar) at 00:05 Istanbul.
4. PWA install + offline shell on a real iPhone (Safari) and Android (Chrome).
5. Pre-launch checklist in `ARCHITECTURE.md` §15.

**Resolved in Sprint 4:** route-level code-splitting shipped — main chunk 316 kB (99 kB gzip) + Supabase chunk 260 kB (71 kB gzip) + per-screen lazy chunks; the >500 kB warning is gone. Two reject-path bugs found by audit and fixed in migration 008 (cari re-yansıt unique violation; rejected kayıt geliri never re-queuing). Tekrar rules got a stop UI (Sabit Giderler screen).

---

## Security — OWASP Top 10 **2025**

Mapped in `ARCHITECTURE.md` §12; `npm audit --omit=dev --audit-level=high` gates every deploy (currently 0 vulnerabilities). Highlights: A01 deny-by-default RLS incl. NULL-role test; A03 pinned deps + lockfile + audit gate; A06 finance invariants designed into Postgres; A08 immutable decided rows + cron dedupe indexes; A09 `audit_log` on all money/role mutations; A10 RPCs validate-then-raise (no partial money writes).

---

## Next steps

1. SQL editor: run `008_reject_yenidenkullanim.sql`, then `supabase/tests/rls_smoke_test.sql` (expect `ALL TESTS PASSED`).
2. Commit + push Sprints 3–4, deploy.
3. Walk the manual checklist in `SPRINT4_SUMMARY.md` (Yönetici + Muhasebe + Personel + PENDING, PWA on real devices, overnight cron).
4. Replace placeholder "PG" icons in `public/icons/` with the real logo before launch.
