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
26. `026_cop_geri_al.sql` — Çöp Kutusu: `restore_trash` RPC re-inserts the snapshot (insert triggers stay quiet — no duplicate gelir/notifications) + finance can permanently delete trash rows
27. `027_trash_silen.sql` — FK on `trash.deleted_by` so the Çöp Kutusu can show who deleted each item
28. `028_gozden_gecirme.sql` — audit fixes: push subscription follows the signed-in account on a shared device (`save_push_subscription` RPC); kayitlar INSERT scoped to form columns
29. `029_mesai.sql` — Mesai (giriş/çıkış): business location/radius/static-IP config on `businesses`; `mesai_kayitlari` table; server-side check-in RPC (`mesai_giris_cikis` reads caller IP from request headers, matches static IP or Haversine distance). Configure the location per business in **İşletme Ayarları → Mesai** before staff can check in.
30. `030_mesai_duzeltme.sql` — Mesai corrections for finance (Yönetici + Muhasebe): `mesai_manuel_ekle` / `mesai_kayit_guncelle` / `mesai_kayit_sil` RPCs (all `is_finance`-guarded; personel still have no direct write path). Deletes snapshot to the trash and restore via `restore_trash` (adds the `MESAI` branch + a `trash_capture_mesai` trigger); adds the `MANUEL` value to `mesai_kaynak`.
31. `031_bildirim_rol.sql` — notification visibility re-checks the **current** role: `UYELIK` rows only visible to Yönetici, `ONAY`/`KAYIT_SILME` only to finance, the rest gated on business access — rows left over from before a role change disappear instead of lingering in a Personel's Bildirimler.
32. `032_cari_borc_odeme.sql` — cari işletmeler become debtor accounts: "Borç Ekle" adds to what they owe (kasa untouched); "Ödeme Topla" collects — per-hareket (the old yansıt, now always a kasa **gelir**) or a general amount via the new `topla_cari_odeme` RPC (ödeme hareketi + pending kasa geliri, atomic). Balance = borç − collected; rejects restore the debt. If you had old GIDER-tur cari tekrar kuralları (supplier payments), delete them — that concept is gone.
33. `033_komisyon.sql` — Kredi Kartı komisyonu: optional komisyon on KK entries (Gelir/Gider Ekle) and at Onay (input appears when KK is selected). On approval the komisyon is deducted as a **separate** born-`ONAYLANDI` gider ("… — bu işlemin komisyonu"); recurring rules store yöntem + komisyon and the cron repeats the deduction every period.
34. `034_kayit_odeme.sql` — finance users can set the gelir **tutar** (overrides paket price), **ödeme yöntemi**, and KK **komisyon** while creating/editing a kayıt; the gelir is born with those values and Onay shows them read-only (no re-selection). A server-side strip trigger blanks/pins these fields for non-finance users — Personel cannot set or alter them via the API.
35. `035_musteri_tel.sql` — optional müşteri cep numarası on kayıtlar: only the national part is stored (`5XXXXXXXXX`, DB-checked), the UI pins the `+90` prefix and only accepts a 10-digit number starting with 5. Kayıt Detay shows a call button (`tel:+90…`) that opens the phone app.
36. `036_cari_telefon.sql` — optional telefon on cari işletmeler: 10 national digits after the pinned `+90`, no leading-5 rule (landlines allowed; leading 0 rejected, DB-checked). İşletme Detay header shows the formatted number + the same call button.
37. `037_istekler.sql` — İstekler: personel file AVANS (tutar + not) / ŞİKAYET / ÖNERİ requests; finance reviews them from the Personel screen's **İstekler** button (red dot = something waiting). Approving an avans istek calls the existing `give_avans` — identical to Avans Ver (born-`ONAYLANDI` kasa gideri + personel history). Decisions are RPC-only (`approve_avans_istek` / `reject_avans_istek` / `alindi_istek`); no client update path.
38. `038_istek_avans_siniri.sql` — avans isteği cannot exceed the personel's maaş in that business (server-side trigger; no limit when maaş is 0/unset). Personel create istekler from the new **İşlemler** nav tab and track them under **İsteklerim**.
39. `039_komisyon_parent.sql` — links each KK komisyon gider to its parent işlem (`islemler.komisyon_of`); `delete_islem` now removes the komisyon together with its parent (no more orphaned commission in the kasa), and `restore_trash` nulls the link if the parent is gone. Redefines `approve_islem` / `run_daily_materializer` / `delete_islem` / `restore_trash`.
40. `040_onaya_geri_gonder.sql` — **Onaya Geri Gönder** (Yönetici-only): `islem_onaya_geri_gonder` RPC flips an approved işlem back to `BEKLIYOR` (leaves the kasa, reappears on the Onay screen with its stored yöntem/komisyon). The linked KK komisyon gider is removed without hitting the trash and is recreated on re-approval; a cari işlem's hareket returns `YANSIDI` → `BEKLIYOR`. Komisyon rows and `PERSONEL` işlemler (maaş/avans/prim) cannot be sent back. UI: undo-arrow button on Tüm İşlemler cards (Yönetici only) + confirmation pop-up.
41. `041_para_transferi.sql` — **Hesaba Para Aktarımı** (Nakit → Kredi Kartı): `para_transferi(business, tutar)` RPC (finance) writes the transfer as two born-`ONAYLANDI` legs — a NAKİT gider + a KREDİ KARTI gelir linked by `islemler.transfer_of`. The kasa total is unchanged; only the method buckets shift. Transfers are **excluded from gelir/gider totals and reports** (`v_kasa_ozet` + client sums) since they are internal moves, and appear as a **single row** (the sibling leg is hidden client-side). The two legs are inseparable: `delete_islem` on either removes both, transfer rows **never enter the trash** (restoring one leg alone would inflate the kasa), and `islem_onaya_geri_gonder` refuses them. Adds `'TRANSFER'` to the `islem_kaynak` enum.
42. `042_transfer_geri_al.sql` — **Transferi Geri Al**: on TRANSFER rows the undo-arrow button (Yönetici-only) reverses the transfer instead of sending it to Onay. `transfer_geri_al(islem)` does **not** delete — it writes a second, opposite transfer titled "Transfer Geri Alma" (KK gider + Nakit gelir), so the amount returns to Nakit and the history stays intact. `islemler.iade_of` links the reversal to the original with a **partial unique index**, so a transfer can be reversed at most once; a reversal cannot itself be reversed. `delete_islem` refuses to delete a transfer that has been reversed (delete the reversal first).
43. `043_transfer_bakiye_siniri.sql` — **transfer cannot exceed the Nakit balance**: `para_transferi` now reads the business's NAKİT bucket (approved NAKİT gelir − gider, **transfer legs included** — otherwise two back-to-back transfers could spend the same money twice) and refuses any amount above it, serialized per business with a transaction-scoped advisory lock so two concurrent transfers can't both pass on a stale read. The client blocks the keystroke as well (the amount field won't accept a value over the balance, and the label shows "En fazla ₺X"), but this is the real limit. `transfer_geri_al` (042) is deliberately **not** capped — a reversal must always be possible even if the KK bucket was spent in the meantime.
44. `044_onay_yonetici.sql` — **Onay is Yönetici-only** (role change): `approve_islem`, `reject_islem`, `approve_kayit_silme` and `reject_kayit_silme` now require `is_yonetici()` instead of `is_finance()` — Muhasebe keeps every other finance power (creating entries, deleting işlemler, reports, cari, personel) but can no longer *decide* a pending one. The Onay screen and its FAB are hidden for Muhasebe, and `/yonetim/onay` is route-guarded. ONAY/KAYIT_SILME **notifications** move with the permission (new `notify_yonetici` helper + narrowed 031 visibility policy) so Muhasebe isn't pinged about a screen it cannot open; `notify_finance` stays for KAYIT notifications. **Updates ARCHITECTURE.md §3** — "Muhasebe = Yönetici minus role control" is now "minus role control **and** minus Onay".
45. `045_avans_prim_onay.sql` — **avans and prim now go through Onay**: `give_avans` / `give_prim` create the gider born `BEKLIYOR` instead of `ONAYLANDI`, so it reaches the kasa only after the Yönetici approves it on the new **Personel** filter of the Onay screen. **Maaş is unchanged** (`pay_maas` + the cron's automatic salary stay born-`ONAYLANDI`) — a recurring, pre-agreed payment doesn't need re-approving every month. The `personel_odemeler` row is still written immediately, but it is now a *record* rather than a *paid* ledger: Personel Detay shows pending ones with an "Onay bekliyor" badge and **excludes them from the cycle totals** (totals must match the kasa). `reject_islem` deletes the linked `personel_odemeler` row (an advance that was refused shouldn't sit in the employee's ledger), and `delete_islem` now deletes it too — previously the FK's `on delete set null` left an orphan, so an advance deleted from the kasa kept showing under the employee. **Knock-on:** an avans *isteği* approved by Muhasebe (`approve_avans_istek`) now still needs the Yönetici's Onay before the money moves.
46. `046_istekler_yonetici.sql` — **İstekler are Yönetici-only**: avans / şikayet / öneri requests are now invisible to Muhasebe (the `istekler` SELECT policy drops `is_finance` for `is_yonetici` + business access) and the three decision RPCs (`approve_avans_istek`, `reject_avans_istek`, `alindi_istek`) require Yönetici. Visibility is narrowed deliberately, not just the buttons — a şikayet may be *about* the Muhasebe, so leaving the list readable would defeat the feature. The personel side is untouched: staff still file requests and track them under İsteklerim. Client: `/yonetim/istekler` is route-guarded and the İstekler button (with its red dot) is hidden on the Personel roster for Muhasebe.
47. `047_isletme_ayarlari_yonetici.sql` — **İşletme Ayarları is Yönetici-only**: the screen's entire write surface moves from `is_finance` to Yönetici — `businesses` UPDATE (name/telefon/adres + the mesai konum/IP columns from 029) and `kategoriler` INSERT/UPDATE (add + soft-delete). Reads are unchanged: Muhasebe still reads kategoriler (Gelir/Gider Ekle picker, reports) and businesses (İşletme Seç). Client: `/yonetim/ayarlar` sits in the Yönetici-only route block and the FinansMenu item is hidden for Muhasebe — but the boundary is the RLS policies, not the hidden screen. Smoke test PASS 29.
48. `048_izinler.sql` — **İzinler (yıllık izin)**: new `izinler` table (date ranges per member). A person whose range covers today shows an orange "İzinde" badge on the Personel roster, Personel Detay header and Mesai Kayıtları. Write access is **tiered** (enforced in RLS via the `izin_yazabilir` helper, which reads the *target's* role SECURITY DEFINER): Muhasebe manages only PERSONEL members' leave; Yönetici manages everyone's (Muhasebe included). Reads are finance-wide (badges render for all members). Overlapping ranges for the same person are rejected by a trigger (advisory-locked against concurrent inserts); no update path — delete and re-add. Client: "Yıllık İzin" button on Personel Detay → `/yonetim/personel/:id/izinler` (Şu anda aktif / Gelecek / Geçmiş sections, İzin ekle modal). Smoke test PASS 30.
49. `049_onaya_geri_sabit_tekrar.sql` — **onaya geri gönder excludes cron rows**: `islem_onaya_geri_gonder` now also refuses **sabit gider** (`sabit_gider_id`) and **tekrar** (`tekrar_kural_id`) işlemler. These are born `ONAYLANDI` by the cron (016/019) and never pass through Onay, so sending them "back" would drop them into a queue they were designed to skip. The tekrar row can't be told apart by `kaynak` (it is `MANUEL`, same as a real manual entry) — only `tekrar_kural_id` distinguishes it. The client hides the undo-arrow via a shared `onayaGeriGonderilebilir()` selector, but the RPC is the real boundary. Smoke test PASS 31.
50. `050_prim_paketleri.sql` — **prim packets**: new `prim_paketleri` table (name + amount templates). Yönetici manages them in İşletme Ayarları (right below the business name); the Prim Ver screen shows a multi-select picker above the amount, and picking packets auto-sums the amount (live) and uses the packet names as the işlem description. With no packets picked, it falls back to a manual amount + free-text açıklama. `give_prim` keeps its signature but now derives the işlem `baslik` from `p_note` (packet names or açıklama, else "Prim"). RLS: write = Yönetici (İşletme Ayarları is already Yönetici-only), read = finance (Muhasebe uses Prim Ver too). **Hard delete** — packets aren't FK-referenced (amount/name are copied onto the işlem), so removing one never touches history. Smoke test PASS 32.

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
