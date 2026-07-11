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
11. `011_cari_tekrar.sql` — recurring cari hareketler: rules can target a cari işletme; cron creates the monthly hareket (kasa untouched until yansıt + Onay)
12. `012_cari_hareket_silme.sql` — finance staff can delete a hareket while it is still `YOK` (never sent toward kasa)
13. `013_kayit_silme.sql` — kayıt deletion goes through Onay (request → finance approves); also fixes the immutability guard blocking parent deletes of decided işlemler
14. `014_sabit_gider_kategori.sql` — sabit giderler get an optional kategori (materializer copies it onto the queued işlem)
15. `015_cari_silme.sql` — finance can delete a cari işletme (pending kasa entries die with it; approved işlemler stay as "Silinen işletme" history)
16. `016_sabit_gider_otomatik.sql` — sabit giderler skip Onay: the cron creates them born `ONAYLANDI` (straight to kasa, like maaş)
17. `017_prim.sql` — prim (bonus) payments via `give_prim` RPC; `set_role` refuses demoting the last active Yönetici
18. `018_bildirim_cop.sql` — notifications (trigger-generated: pending işlem, silme isteği, yeni üyelik) + trash (deleted items snapshot, newest 50 per business)
19. `019_tekrar_otomatik.sql` — tekrar kuralları also skip Onay: the cron creates their monthly işlem born `ONAYLANDI` (cari-targeted rules unchanged)
20. `020_kayit_saat.sql` — kayıt başlangıç/bitiş saati (30-min slots 09:00–21:00) + `pilotgarage-saat` cron (every 15 min) that auto-advances durum: start → AKTIF, end → TAMAMLANDI
21. `021_push.sql` — Web Push subscription rows (one per device; own-rows RLS). Requires the **section 8** setup to actually deliver pushes.
22. `022_bildirim_yeni_kayit.sql` — new kayıt notifies finance staff (minus the creator); tap opens the kayıt
23. `023_havale.sql` — third ödeme yöntemi: Havale (enum value + approve gate wording)
24. `024_islem_silme.sql` — finance can delete an işlem via `delete_islem` RPC (kasa recalculates; cari hareket released to YOK; row lands in the trash)
25. `025_kayit_bildirim_herkes.sql` — the yeni-kayıt notification goes to all active staff of the business (Personel included), minus the creator

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

## 8. Anlık bildirimler (Web Push)

Delivers notifications while the app is closed. Android/Chrome works directly;
iPhone needs iOS 16.4+ **and** the app installed to the home screen.

1. **VAPID keys** (once, locally): `npx web-push generate-vapid-keys`
2. **GitHub secret:** add `VITE_VAPID_PUBLIC_KEY` (the public key) under
   Settings → Secrets → Actions, then push/re-run the deploy so it's baked in.
3. **SQL editor:** run `021_push.sql`.
4. **Edge Function:** Dashboard → Edge Functions → Create → name `send-push`,
   paste `supabase/functions/send-push/index.ts`, and **disable "Verify JWT"**
   (the webhook authenticates with a secret header instead).
5. **Function secrets** (Edge Functions → send-push → Secrets):
   - `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — from step 1
   - `PUSH_WEBHOOK_SECRET` — any long random string
6. **Database Webhook:** Dashboard → Database → Webhooks → Create:
   table `notifications`, event **INSERT**, type HTTP Request (POST) → the
   `send-push` function URL, with an HTTP header `x-push-secret` = the value
   from step 5.
7. **On each device:** open the app → Ayarlar → toggle **Anlık bildirimler** on
   (on iPhone: install to home screen first, then toggle inside the installed app).

Quick test: from a second account, create a Gelir/Gider — the finance users'
subscribed devices should receive the push within seconds.

## Verify (Sprint 0 checklist)

- [ ] Deployed URL loads; refresh on a deep link (e.g. `/giris`) does **not** 404
- [ ] Signup → e-mail confirm → login → lands on **"Hesabınız onay bekliyor"**
- [ ] That pending user sees **zero rows** (Table Editor → run as user, or check the app)
- [ ] Bootstrap Yönetici → İşletme Seç shows **both** businesses
- [ ] Pick one → placeholder home with correct bottom nav (Yönetici variant)
- [ ] `pilotgarage-daily` visible under **Database → Cron Jobs**
- [ ] PWA installs on a real phone; airplane mode still opens the shell
