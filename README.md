# PriceNova

Participation, rewards and monthly draws. Next.js 15 + Prisma 7 on Supabase Postgres.

## Status

| Phase | | |
|---|---|---|
| 0 | Scaffold, schema, seed | **done** |
| 1 | Design system + user dashboard | **done** — `/design` is the visual standard |
| 2 | Ledger + domain services + tests | **done** |
| 3 | User app: home, draws, team, wallet, activity, signup | **done** |
| 4 | Admin console | **done** |
| 5 | Design system v2 — gamified, mobile-first, dark | **done** |
| 6 | Main Draw, draw CRUD, /draws + detail, participate flow | **done** |
| 7 | Verification (email + SMS), profile, password reset, split admin auth | **done** |
| 8 | Payment providers + manual-transfer verification flow | **done** — awaiting merchant credentials |
| 9 | User dashboard upgrade: entries, rewards, achievements, winner state | **done** |
| 10 | Urdu/RTL, scheduled jobs | not started |

## Run

```bash
npm install
npx prisma db push        # schema -> Supabase
npm run db:seed           # configuration + the administrator
npm run db:seed:demo      # optional sample participants, via the real services
npm run dev
```

**Sign in:** `johntest@gmail.com` / `johntest123` (SUPER_ADMIN)
Demo participants use `password123`.

**User surface**
- `/` — home. **Works signed out.** Leads with the admin-designated **Main Draw**.
- `/draws` — every published draw, grouped Live / Coming up / Finished
- `/draws/[id]` — one draw; the page reshapes around its actual status
- `/join?draw=…` — participate: pick a plan, say how you paid
- `/entries` — your tickets, wins first
- `/rewards` — prizes won, the milestone ladder, achievements
- `/referrals` · `/wallet` · `/activity` · `/profile`
- `/signup?ref=CODE` · `/login` · `/forgot` · `/reset` · `/verify/email`

**Admin surface — separate authentication**
- `/admin/login` — the console's own sign-in. Refuses non-admins.
- `/admin/payment-accounts` — the receiving numbers participants pay into
- `/admin` and everything under it — requires an admin role **and** a session
  minted at `/admin/login`. Signing in at `/login` as an administrator gives a
  member session that cannot reach the console.
- `/design` — the design system, rendered

`npm run db:seed:demo -- --purge` removes the sample participants and everything they own.

## Verify

```bash
npm test                              # money unit tests + ledger integration tests
node scripts/tour.mjs /tmp/shots      # logs in, visits every page, asserts no overflow or console errors
node scripts/shot.mjs <url> <out.png> 390 1600   # one page at a device viewport
```

The ledger tests run against the real database — the guarantees under test
(unique indexes, transaction isolation, row locks) live in Postgres, and a mock
would only prove the mock agrees with itself. Rows are namespaced
`*@test.invalid` and cleaned up.

## Docs

| | |
|---|---|
| `docs/requirements/DECODED-SPEC.md` | The handwritten rules, transcribed, with open questions |
| `docs/requirements/photos/` | The original pages |
| `docs/DESIGN.md` | The design system and the reasoning behind it |
| `docs/ARCHITECTURE.md` | The ledger, idempotency, and where business rules live |
| `docs/PAYMENTS.md` | Payment providers, webhooks, credentials and sandbox setup |

## Conventions that are not negotiable

- **Money is `bigint` minor units.** Never a float, anywhere.
- **No balance changes without a ledger transaction.** `LedgerService.post()` is
  the only way money moves, and it carries an idempotency key derived from the
  business event.
- **Business dates format in UTC** via `src/lib/format.ts`. A draw on the 30th is
  on the 30th in every timezone; a withdrawal window of "the 1st–2nd" means the
  same two days everywhere.
- **Business rules live in `settings`/`plans`,** not in constants.
- **No content is hardcoded in the frontend.** Draw names, prizes, images,
  dates, entry counts, winners and progress all come from the database. Where
  there is no data the UI shows an empty state — it never invents a number.
- **One Main Draw, enforced by the database.** `Draw.isMain` is a nullable
  unique column holding only `true` or NULL, so two admins cannot create two.
- **Authorisation is re-checked server-side** in every action. The fact that a
  button rendered is not evidence of anything.

## Security notes

- `.env` is gitignored and holds the Supabase service-role key, which **bypasses
  Row Level Security entirely**. It is server-only — never `NEXT_PUBLIC_`.
  Rotate it before production.
- **No payment provider is configured, and no receiving account is enabled.**
  Deposits work as soon as an admin fills in a number at
  `/admin/payment-accounts` and enables it; verification falls back to manual
  review until provider credentials exist. Nothing fakes a success.
  See `docs/PAYMENTS.md`.
- **TLS to Supabase is now verified**, not bypassed: `certs/supabase-ca.crt`
  pins Supabase's private root. That directory is gitignored — download the CA
  per environment from Settings → Database → SSL Configuration.
- **No email or SMS provider is configured.** `src/server/services/delivery.ts`
  logs messages to the server console in development and **throws in
  production** rather than silently pretending a verification was sent. Set
  `EMAIL_PROVIDER_KEY` / `SMS_PROVIDER_KEY` and implement the two transports.
- OTPs and verification tokens are SHA-256 hashed at rest, expire, are
  single-use, and are rate-limited per user.
- `AUTH_SECRET` in `.env` is a development placeholder. Regenerate per
  environment: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
