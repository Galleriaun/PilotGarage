# PilotGarage

One mobile-first PWA for two related auto businesses — **PilotGarage** (servis) and **Arabam.com** (galeri). Vehicle intake, package pricing, cash flow with an approval (Onay) gate, staff & partner-account management.

- **Design:** [`ARCHITECTURE.md`](ARCHITECTURE.md) — canonical architecture (read this first)
- **Setup:** [`SETUP.md`](SETUP.md) — step-by-step Supabase + GitHub Pages onboarding
- **UI reference:** [`design/`](design/) — pixel-level prototype (spec only, never imported)

## Stack

Vite 8 · React 19 · TypeScript 6 · Tailwind CSS 4 · React Router 8 · TanStack Query 5 · Supabase · GitHub Pages · vite-plugin-pwa

## Development

```bash
npm install
cp .env.example .env   # fill in your Supabase project values
npm run dev
```

`npm run build` runs the TypeScript check and the production build (same as CI).

## Non-negotiables

- Money and role invariants live in **Postgres** (constraints, `SECURITY DEFINER` RPCs, RLS) — never client-only.
- Kasa balance is **always derived** from approved işlemler (`v_kasa_ozet`), never stored.
- Client arithmetic is **integer kuruş**; formatting via the shared `formatTL`.
- The placeholder "PG" icons in `public/icons/` should be replaced with the real logo before launch.
