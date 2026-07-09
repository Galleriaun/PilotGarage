# PilotGarage — Setup

Follow strictly in order: 1–2 backend, 3 deploy, 4 auth, 5 first Yönetici, 6 local dev, 7 PWA.

## 1. Supabase project

1. [supabase.com](https://supabase.com) → **New project** (org free tier allows 2 active projects; HomeGuru is the first, this is the second).
2. Region: **EU (Frankfurt)**. Save the database password somewhere safe.
3. **Database → Extensions**: enable **`pg_cron`** (`pgcrypto` is already enabled).

## 2. Run migrations

**SQL Editor → New query** — run each file from `supabase/migrations/` **in order**:

1. `001_schema.sql` — enums, tables, `v_kasa_ozet` view
2. `002_functions.sql` — RLS helpers, triggers, RPCs (Onay gate, roles, cron job body)
3. `003_rls.sql` — row level security policies + storage bucket
4. `004_cron.sql` — daily job at 21:05 UTC (= 00:05 Istanbul)
5. `005_seed.sql` — the two businesses + default categories
6. `006_kayit_notlar.sql` — kayıt notları column (added in Sprint 1)
7. `007_odeme_yontemi.sql` — Nakit/Kredi Kartı on işlemler + approve RPC update
8. `008_reject_yenidenkullanim.sql` — reject-path fixes: cari re-yansıt + kayıt geliri re-queue (Sprint 4)
9. `009_profil_gorunurlugu.sql` — same-business staff can read colleague names (creator display)
10. `010_yonetici_uyelik.sql` — Yönetici gets both-business membership rows (appears in Personel roster; maaş 0, no auto-pay)

**After all migrations (recommended):** run `supabase/tests/rls_smoke_test.sql` —
paste the whole file into the SQL editor and run once. It verifies RLS isolation
and every finance invariant against the live schema, then **rolls itself back**
(no test data survives). It must end with `ALL TESTS PASSED`.

## 3. GitHub repository + Pages

1. Create the **`PilotGarage`** repo on GitHub and push this project to `main`:

```bash
git init -b main
git add -A
git commit -m "Sprint 0: foundation"
git remote add origin https://github.com/YOUR-GITHUB-USERNAME/PilotGarage.git
git push -u origin main
```

2. **Settings → Secrets and variables → Actions** — add (values from Supabase
   **Project Settings → API Keys**):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
3. **Settings → Pages → Source: GitHub Actions.**
4. Re-run the *Deploy to GitHub Pages* workflow (Actions tab) — the first push ran
   before the secrets existed. App serves at
   `https://YOUR-GITHUB-USERNAME.github.io/PilotGarage/`.

The `keepalive.yml` workflow pings the DB every 6 days so the free-tier project
never auto-pauses. It uses the same two secrets (already added above).

## 4. Auth configuration

Supabase → **Authentication → URL Configuration:**

- **Site URL:** `https://YOUR-GITHUB-USERNAME.github.io/PilotGarage/`
- **Redirect URLs:** add
  - `https://YOUR-GITHUB-USERNAME.github.io/PilotGarage/**`
  - `http://localhost:5173/PilotGarage/**` (for local dev, step 6)

Email provider stays enabled (default). Signups are open by design — new accounts
are `PENDING` with no role and see nothing until a Yönetici approves them.

## 5. Bootstrap the first Yönetici

The first account can't be approved by anyone, so promote it manually:

1. Open the deployed app, **Kayıt ol** with your own e-mail, confirm the e-mail.
2. SQL Editor:

```sql
update public.profiles
set role = 'YONETICI', status = 'ACTIVE'
where id = (select id from auth.users where email = 'YOUR_EMAIL_HERE');
```

3. Refresh the app — you land on İşletme Seç. Every later signup is approved in-app.

## 6. Local development

```bash
npm install
```

`.env` currently holds placeholder values — replace them with the real project URL
and **publishable** key (public-safe; RLS is the security boundary) from
**Project Settings → API Keys**. Then `npm run dev`
→ http://localhost:5173/PilotGarage/

## 7. Install as PWA

- **iPhone (Safari):** Share → *Ana Ekrana Ekle*
- **Android (Chrome):** menu → *Uygulamayı yükle* (or the install banner)

## Verify (Sprint 0 checklist)

- [ ] Deployed URL loads; refresh on a deep link (e.g. `/giris`) does **not** 404
- [ ] Signup → e-mail confirm → login → lands on **"Hesabınız onay bekliyor"**
- [ ] That pending user sees **zero rows** (Table Editor → run as user, or check the app)
- [ ] Bootstrap Yönetici → İşletme Seç shows **both** businesses
- [ ] Pick one → placeholder home with correct bottom nav (Yönetici variant)
- [ ] `pilotgarage-daily` visible under **Database → Cron Jobs**
- [ ] PWA installs on a real phone; airplane mode still opens the shell
