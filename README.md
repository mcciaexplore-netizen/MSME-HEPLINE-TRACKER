# MSME Helpline – Coordinator Performance Tracker

Next.js (App Router) + TypeScript, SQLite via Prisma, Tailwind, Recharts, Papa Parse.

## Setup

```bash
npm install
cp .env.example .env      # set ADMIN_PASSWORD and a long random SESSION_SECRET
npm run setup             # creates prisma/dev.db and seeds the admin, coordinators and name mappings
npm run dev               # http://localhost:3000
```

- The app opens on admin sign-in (`/login`); username/password come from `.env` (re-run `npm run seed` after changing the password). Coordinators don't use the app.

## Daily flow

1. The admin uploads the dialer call log and the Zoho ticket export at `/upload`.
2. New raw names appear in **Name mapping** for confirmation; their rows count once confirmed.

## How things are counted

All metric logic lives in `src/lib/metrics/index.ts` (pure, unit-tested); the dashboard, API and CSV export all call it.

- **Overall performance:** every call, every ticket a coordinator created (meetings scheduled, by Created Time) and every ticket they own (meetings allotted, by Due Date up to today) counts for them. There is no per-day job choice.
- **Calls per day:** (outbound answered + outbound missed + inbound answered) ÷ days with at least one of those calls; inbound missed calls are left out (team: summed over coordinators).
- **Inbound missed:** once per coordinator the call rang, once in the team total. Calls that rang nobody are a team-level figure.
- **Data filled:** Done tickets where every field in `CORE_FIELDS` (`src/lib/config.ts`) is non-empty. Zoho's `None` placeholder counts as empty.
- **Working hours:** each coordinator gets their own fixed 10 am–6 pm shift (8 hours, `SHIFT_START_HOUR`/`SHIFT_END_HOUR` in `src/lib/config.ts`) for each day they made or answered a call. **Calls per working hour** = (outbound answered + outbound missed + inbound answered) ÷ those hours; **conversation per working hour** = talk minutes ÷ those hours. Team calls per working hour is the average coordinator. Team conversation per working hour = talk minutes ÷ (half the coordinators on calls × 8 h), because half the coordinators schedule and half run meetings (`CALLING_SHARE` in `src/lib/config.ts`).
- Dialer names: the bracketed number, `+`, and `-Extension` suffix are stripped; matching is case-insensitive.
- Outbound calls with a blank *Answered By Agent* are never attributed.
- Former staff (Pooja Choudhary, Riya Belsare, Potdar, Deshpande, Tayade) and the shared Helpline account are seeded as **Ignore**.

## Privacy

Only the needed columns are stored. Client phone numbers, emails and company names are never read. Dialer recording URLs are never stored. Zoho field text is reduced to filled/empty flags.

## Tests and acceptance

```bash
npm test                                                     # unit + integration tests (uses prisma/test.db)
npx tsx scripts/acceptance.ts <dialer.csv> <zoho.csv> 2026-10-17 2026-10-23
```

The acceptance script uses its own database, confirms the seed mappings, uploads both files and prints team and per-coordinator totals.
