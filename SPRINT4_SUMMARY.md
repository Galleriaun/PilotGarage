# Sprint 4 — Hardening (2026-07-08)

## What changed

### 1. Reject-path bug fixes — `supabase/migrations/008_reject_yenidenkullanim.sql` ⚠️ run in SQL editor

The Sprint 4 audit found two real bugs, both around `REDDEDILDI`:

- **Cari re-yansıt was permanently blocked after a reject.** `reject_islem` resets the
  hareket to `YOK` (inviting a retry), but the rejected işlem still occupied the
  one-per-hareket unique index — retrying "Kasaya Yansıt" always failed with a raw
  unique-violation error.
- **A rejected kayıt geliri could never be re-queued.** The kayıt-tamamlandı trigger's
  duplicate guard counted rejected rows, so revert → re-complete silently queued
  nothing. Money would be lost without any error.

Fix: the `islemler_kayit_ux` / `islemler_cari_ux` unique indexes and the trigger guard
now ignore `REDDEDILDI` rows. Rejected rows stay as immutable history; a `BEKLIYOR` or
`ONAYLANDI` row still blocks duplicates (no double income).

### 2. Automated RLS & invariant test — `supabase/tests/rls_smoke_test.sql`

Covers the automatable §15 items in one self-contained run (paste whole file → run):
impersonates PENDING/NULL-role, PERSONEL, DISABLED, and MUHASEBE personas via
`request.jwt.claims`, asserts zero-row isolation **with positive controls**, verifies
all four role-control RPCs refuse Muhasebe, proves no client path writes `ONAYLANDI`,
checks the ödeme-yöntemi gate, exercises both 008 round trips, tests immutability at
the table-owner level, and hand-checks `v_kasa_ozet` as a delta. **Rolls itself back** —
safe on the live project. Must end with `ALL TESTS PASSED`.

### 3. Tekrarlanan işlemler management UI

A recurring rule created in Gelir/Gider Ekle previously could never be stopped (it
materialized pending işlemler forever). The **Sabit Giderler** screen now has a
**Tekrarlanan İşlemler** section: each active rule shows başlık, sıklık, next run and
±amount, with a **Durdur** action (ConfirmDialog → soft stop `is_active = false`;
existing işlemler untouched, history preserved).

- `src/features/yonetim/api.ts` — `useStopTekrarKural`
- `src/features/yonetim/SabitGiderler.tsx` — section + StopIcon + dialog

### 4. Route-level code-splitting

`src/App.tsx`: auth screens stay eager (cold-start path); all 14 feature screens are
`React.lazy` with the existing `Splash` as Suspense fallback. The PWA precaches every
chunk (`globPatterns` includes `**/*.js`), so offline navigation is unaffected.

**Result:** the >500 kB warning is gone. Main chunk 316 kB (99 kB gzip) + Supabase
260 kB (71 kB gzip) + per-screen chunks of 3–23 kB. `npm run build` clean (0 TS errors).

### 5. Cold-boot fix: business selection survives app launches

Found by driving the app in a browser: `BusinessProvider`'s "signed out → forget the
selection" effect also fired **while auth was still hydrating** (`session` is briefly
`null` on every cold boot), wiping the persisted `pg.activeBusiness` — so every full
reload / PWA open bounced to İşletme Seç. It now waits for auth `loading` to finish.
Verified: deep-link reload to `/yonetim/sabit-giderler` renders the screen directly.

- `src/app/providers/BusinessProvider.tsx`

### 6. Onay FAB: always visible + freed from the screen-transition transform

Two issues, found when the owner asked "where is the floating Onay button":

- It only rendered when the queue was non-empty (and Onay isn't in the Finans menu,
  so an empty queue had no navigation path at all). Now **always visible**; the count
  badge appears only when something is waiting.
- `position: fixed` inside the `screen-forward` wrapper is hijacked by the entrance
  animation's transform (a transformed ancestor becomes the containing block), pinning
  the "floating" button to the bottom of the scroll content during transitions. The FAB
  and `FloatingSavePopup` are now **portaled to `<body>`** (same as the Radix modals),
  verified pixel-positioned in the browser.

- `src/features/finans/Yonetim.tsx`, `src/components/ui/FloatingSavePopup.tsx`

### 7. Creator display (owner request 2026-07-09) — ⚠️ migration `009_profil_gorunurlugu.sql`

Kayıt cards (both homes), Kayıt Detay ("OLUŞTURAN" card), işlem rows (Son İşlemler /
Tüm İşlemler) and Onay cards now show **who created the entry** next to the date;
system entries from the cron show **"Otomatik"**. Because PERSONEL could previously
read only their own profile row, migration 009 widens `profiles` SELECT so active
same-business staff can resolve colleague names (name/role/status only — salaries
live in `business_members`, still finance-only). The RLS smoke test gained checks
for this (colleague visible, membership-less PENDING user still invisible).

- `supabase/migrations/009_profil_gorunurlugu.sql`
- `features/finans/api.ts` + `types.ts`, `TxCard.tsx`, `Onay.tsx`
- `features/kayit/api.ts` + `types.ts`, `PersonelHome.tsx`, `YoneticiHome.tsx`, `KayitDetay.tsx`

### 8. Kayıt card redesign (owner mockup 2026-07-09)

Kayıt list cards now follow the owner's layout: **title** = `plaka — müşteri`; **line 2** =
`tarih - araç` + the paket as a small chip; **line 3** = `oluşturan • creation timestamp`
(`formatCreatedStamp`, Istanbul). Shared `KayitCardMeta` lives in `YoneticiHome.tsx`,
reused by `PersonelHome.tsx` so both homes match.

### 9. Yönetici appears in the Personel roster — ⚠️ migration `010_yonetici_uyelik.sql`

Owner request: the Yönetici couldn't see themselves in Personel because Yönetici had
**no `business_members` row** (access came only from `is_yonetici()`). Migration 010
backfills both-business membership rows for every Yönetici (**maaş 0 / manual → the
auto-maaş cron never touches them**), and `approve_signup` / `set_role` now create the
rows on any future Yönetici promotion. Access is unchanged. The owner can now draw their
own maaş/avans from their card (owner-draw choice); role/status/İşletme-Erişimi controls
stay hidden on self. **Invariant change:** the old "Yönetici needs no membership rows"
no longer holds — noted in `ARCHITECTURE.md §14.3`.

- `supabase/migrations/010_yonetici_uyelik.sql`, `features/yonetim/PersonelDetay.tsx`

### 10. Pre-launch code-side checks (done this sprint)

- `npm audit --omit=dev --audit-level=high` → **0 vulnerabilities**
- `dist/` grep for `sb_secret` / `service_role` / `SUPABASE_SECRET` → **no matches**
- `SETUP.md` updated (migration 8 + test script step)

---

## What YOU need to do (in order)

1. **SQL editor:** run `supabase/migrations/008_reject_yenidenkullanim.sql` *(done 2026-07-09)*
2. **SQL editor:** run `supabase/migrations/009_profil_gorunurlugu.sql`
3. **SQL editor:** run `supabase/migrations/010_yonetici_uyelik.sql`
4. **SQL editor:** re-run `supabase/tests/rls_smoke_test.sql` (whole file) → "Success" (all checks raise on failure)
5. Commit + push → deploy
6. Walk the manual checklist below on the deployed app
7. Replace placeholder "PG" icons in `public/icons/` before launch

---

## Manual walkthrough checklist (deployed app — cannot be automated)

### As Yönetici
- [ ] İşletme Seç shows both businesses; switching re-scopes every screen
- [ ] Kayıt: yeni kayıt + photos → TAMAMLANDI → gelir appears in Onay
- [ ] Onay: KAYIT card demands Nakit/KK before Onayla; Reddet works
- [ ] **New:** reject a cari "Kasaya Yansıt" işlem → hareket back to **Yansıtılmadı** → yansıt again → works (bug fixed)
- [ ] **New:** reject a kayıt geliri → kayıt durumunu AKTIF'e çevir → tekrar TAMAMLANDI → gelir re-queued (bug fixed)
- [ ] **New:** Sabit Giderler → Tekrarlanan İşlemler section lists rules; Durdur stops future materialization
- [ ] Personel: approve a signup, change role, Avans/Maaş hit kasa immediately
- [ ] **New:** you (Yönetici) now appear in the Personel roster of both businesses; tapping yourself shows no Rol Değiştir / Devre Dışı / İşletme Erişimi, but Avans/Maaş Öde work (owner draw)
- [ ] Lazy loading: every screen opens (brief splash on first visit is expected); no blank screens

### As Muhasebe (2nd account)
- [ ] Full finance access: Yönetim, Onay, Tüm İşlemler, all 5 Yönetim modules
- [ ] Personel Detay: **no** Rol Değiştir, **no** devre dışı bırak, **no** işletme erişimi editing
- [ ] Personel list: **no** pending-signup approval section
- [ ] Sees only their assigned business(es)

### As Personel (3rd account or re-role)
- [ ] Only Personel Home + Yeni Kayıt + Kayıt Detay reachable; `/yonetim` URL redirects away
- [ ] No kasa/finance data anywhere

### As a fresh signup (PENDING)
- [ ] Lands on "Hesabınız onay bekliyor"; deep-linking `/yonetim` etc. bounces back to the gate

### PWA (real devices)
- [ ] iPhone Safari: Ana Ekrana Ekle → standalone, safe-area nav OK, airplane mode opens shell
- [ ] Android Chrome: Uygulamayı yükle → same checks
- [ ] Deploy a trivial change → update prompt appears, **no** auto-reload mid-form

### Cron (overnight)
- [ ] Next morning after a sabit gider / tekrar rule / auto-maaş member exists:
      entries appeared at 00:05 Istanbul (Onay queue for gider/tekrar; kasa for maaş)
- [ ] `audit_log` has the `DAILY_CRON` row

### Ops
- [ ] Keepalive workflow green twice consecutively
- [ ] `npm audit` reviewed on each deploy (CI gate already enforces)
