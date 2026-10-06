# Payments

## Manual USDT (BEP20) — the live rail

Until a gateway such as Cryptomus is integrated, participants pay in USDT on
BNB Smart Chain to a wallet an admin publishes, and an admin approves each
payment by hand. **Nothing is credited automatically.**

```
Admin → Payment settings: type Crypto, network BEP20, wallet address,
                          optional QR upload, instructions, Enabled
      ↓
Participant → Participate → USDT (BEP20)
  sees: amount in USDT, BEP20-only warning, QR, address + Copy
  submits: Amount Sent + Transaction ID / TXID
      ↓
POST /api/payments/verify → ManualUSDTProvider
  TXID normalised (trim, lowercase, 0x prefix, BscScan link → hash) and
  format-checked; refused if any payment already holds it
      ↓
Payment MANUAL_REVIEW_REQUIRED (shown as PENDING) — wallet untouched
      ↓
Admin → Payments → Review: checks the TXID on BscScan against the
receiving wallet recorded on the payment, then Approve or Reject
      ↓
Approve: one DB transaction — deposit row locked, ledger posts once under
deposit:<id>:confirm, participation activated, payment → SUCCESS (APPROVED),
admin id + timestamp recorded. Commission/bumper run after commit.
Reject:  deposit + payment → REJECTED with a reason; the participant may pay again.
```

| What people see | Stored `PaymentStatus` |
|---|---|
| Awaiting TXID | `WAITING_FOR_PAYMENT` with no reference (not in the review queue) |
| **Pending** | `MANUAL_REVIEW_REQUIRED` (and other open states) |
| **Approved** | `SUCCESS` / `OVERPAID` |
| **Rejected** | `REJECTED` / `FAILED` / `EXPIRED` / `REFUNDED` |
| **Cancelled** | `CANCELLED` |

The mapping lives in `src/lib/payment-status.ts`; no parallel enum exists.

Guarantees:
- **Approve twice → refused.** The action reports "already approved"; the
  deposit row lock plus the ledger idempotency key mean concurrent approvals
  produce one ledger transaction (covered by `tests/manual-usdt.test.ts`).
- **One TXID, one payment.** Unique index on `(method, userSubmittedReference)`
  and on `(cryptoNetwork, txHash)`, plus a pre-check across all methods. A
  rejected TXID stays burned — a new payment needs a new transaction.
- **No swapping under review.** Once submitted, the TXID cannot be changed.
- **The address is snapshotted** on the payment when it opens, so changing the
  published wallet later never changes what a reviewer checks against.
- **The QR** defaults to one generated from the address (cannot disagree with
  it). An uploaded QR is PNG/JPEG/WebP ≤ 300 KB, type checked by magic bytes;
  SVG is refused.
- A BEP20 address must be `0x` + 40 hex characters to save.
- Admin-configured crypto accounts always route to manual methods
  (`MANUAL_USDT_BEP20`, `MANUAL_CRYPTO`). The gateway methods (`USDT_BEP20`
  etc.) are reserved for a hosted checkout that assigns its own addresses.

### Adding Cryptomus later

Write `providers/cryptomus.ts` implementing `PaymentProviderAdapter` for the
gateway methods, register it, add its env vars. Manual USDT keeps working
beside it. Do not let the gateway verify payments made to the manual address.

## How it works — manual transfer, server verification

```
Select plan → select method
      ↓
PriceNova shows the receiving account (from PaymentAccount, admin-configured)
      ↓
POST /api/payments/start → Deposit(PENDING) + Payment(WAITING_FOR_PAYMENT)
      ↓
User transfers the money in their own banking / wallet app
      ↓
User submits amount + transaction reference
      ↓
POST /api/payments/verify
      ↓
Duplicate-reference check  →  refuse if already used by anyone
      ↓
Rate limit check           →  20s between attempts, 12 attempts max
      ↓
Provider.verifyTransaction()  ── API available? ── no ──→ MANUAL_REVIEW_REQUIRED
      ↓ yes
Amount re-checked against the PLAN price (not the typed amount)
      ↓
SUCCESS → confirmDeposit() → ledger → participation active
```

**The browser is never in that chain.** The request body carries only what the
user genuinely knows — the amount they sent and its reference. It cannot
express a status, a "verified" flag, a receiving account or a price. There is
no code path from "the user typed a plausible reference" to SUCCESS.

Automated crypto and card still use the webhook path below; those rails confirm
themselves and never ask for a reference.

## Why a Payment is separate from a Deposit

`Deposit` was already the ledger-side record — what `confirmDeposit()` credits
and what the admin queue shows. It has three states. A provider checkout has
eleven (waiting, detected, confirming, underpaid, expired…). Folding those into
`DepositStatus` would put provider mechanics into the ledger's vocabulary. So
`Payment` owns the checkout lifecycle and links 1:1 to a `Deposit`, and crediting
still goes through the existing, already-idempotent path.

## Credit exactly once

Three independent guards. A double credit needs all three to fail together.

1. **`PaymentEvent.dedupeKey` is unique.** A replayed webhook is recorded once
   and returns early.
2. **The status transition is conditional.** `updateMany({ where: { status: { notIn: TERMINAL } } })`
   — two concurrent webhooks cannot both pass it.
3. **The ledger post is idempotent.** `confirmDeposit()` posts under
   `deposit:<id>:confirm`; a second call finds the existing transaction.

A provider claiming SUCCESS is not enough on its own: if less arrived than the
plan costs, the service overrides it to `UNDERPAID` and credits nothing.

## Receiving accounts

The number or address a participant pays into lives in the `PaymentAccount`
table and is edited at **`/admin/payment-accounts`**. Nothing is hardcoded, and
nothing reaches the frontend except the fields that are safe to display —
`toPublicAccount()` builds the payload field by field rather than spreading the
row, so a credential column could not leak even if one were added.

Two guards on the admin side:
- An account cannot be **enabled** without a destination (or, for crypto,
  without a network). An enabled method with a blank number would show a
  participant an empty field to copy.
- A disabled account cannot be used even if its id is guessed —
  `/api/payments/start` re-checks `enabled` server-side.

`autoVerify` on an account only has an effect if that provider has credentials.
Without them, every payment into the account goes to manual review. That is the
honest outcome rather than a pretended one, and the admin page says so.

## Providers

| Method | Provider | Credentials needed |
|---|---|---|
| JazzCash | `JAZZCASH` | `JAZZCASH_MERCHANT_ID`, `JAZZCASH_PASSWORD`, `JAZZCASH_INTEGRITY_SALT` |
| Easypaisa | `EASYPAISA` | `EASYPAISA_STORE_ID`, `EASYPAISA_HASH_KEY` |
| Card | `CARD_GATEWAY` | `CARD_PROVIDER_SECRET_KEY`, `CARD_PROVIDER_WEBHOOK_SECRET` |
| BTC / USDT TRC20 / USDT ERC20 | `CRYPTO_GATEWAY` | `CRYPTO_PROVIDER_API_KEY`, `CRYPTO_PROVIDER_IPN_SECRET` |
| Bank transfer / crypto transfer / USDT BEP20 (manual) | `MANUAL` | none — always available |

**None of the automated providers are configured yet.** Each is off until its
variables are set: `createCharge` throws `ProviderUnconfiguredError`, checkout
shows the method as "temporarily unavailable", and the webhook route returns
503 because nothing can be verified without a secret. Manual methods keep
working meanwhile, so the product still functions today.

`/admin/deposits` shows exactly which variables each provider is missing.

## Sandbox setup

### JazzCash
1. Request sandbox credentials from your JazzCash account manager.
2. Set `JAZZCASH_*` with `JAZZCASH_MODE=sandbox`.
3. Register the webhook: `https://<host>/api/payments/webhook/jazzcash`.
4. Pay with a sandbox wallet number. JazzCash posts back a `pp_SecureHash`
   that the adapter recomputes with HMAC-SHA256 over the sorted `pp_*` values.

### Easypaisa
1. Get a staging Store ID and hash key from Telenor.
2. Set `EASYPAISA_*` with `EASYPAISA_MODE=sandbox`.
3. Post-back URL: `https://<host>/api/payments/webhook/easypaisa`.
4. Checkout is a browser form POST — the client submits the signed field set.

### Card (Stripe-compatible)
1. Use test keys (`sk_test_…`).
2. `stripe listen --forward-to localhost:3000/api/payments/webhook/card_gateway`
   and put the printed `whsec_…` in `CARD_PROVIDER_WEBHOOK_SECRET`.
3. Pay with `4242 4242 4242 4242`.
4. Signatures older than 5 minutes are rejected, so a captured webhook cannot
   be replayed later.

### Crypto (NOWPayments-compatible)
1. Create a sandbox account, take the API key and IPN secret.
2. Set `CRYPTO_PROVIDER_*`, `CRYPTO_PROVIDER_MODE=sandbox`, and point
   `CRYPTO_PROVIDER_API_BASE` at the sandbox host.
3. IPN callback: `https://<host>/api/payments/webhook/crypto_gateway`.
4. Pay on testnet. The checkout polls as well as listening, so it advances even
   if an IPN is dropped.

A local tunnel (`ngrok http 3000`) is needed for any of these, since providers
must reach the webhook. Set `APP_URL` to the tunnel URL so the callback and
return URLs are generated correctly.

## Security

- **No card data.** Hosted checkout only; PriceNova renders no card field and
  stores no PAN, CVV or PIN. It stays out of PCI scope.
- **No MPIN or wallet PIN**, ever. Only a mobile number, which addresses the
  authorisation request.
- **No private keys.** The gateway assigns receiving addresses and holds the
  keys; PriceNova holds none, in code or in the database.
- **No user-supplied TXID on automated methods.** Only `MANUAL_*` accepts a
  reference, and it is a hint for the reviewing admin, never proof.
- **Raw body before parsing.** Signatures cover exact bytes, so the webhook
  route reads `request.text()` first and verifies before touching the payload.
- Unique constraints on `(provider, providerTxId)` and `(cryptoNetwork, txHash)`
  mean one provider transaction, and one on-chain transaction, can back only one
  payment.

## Adding a provider

Write an adapter implementing `PaymentProviderAdapter`, register it in
`src/server/payments/registry.ts`, add its presentation row, add its env vars
here and to `.env.example`. Nothing above the registry changes.

## Deploying to Vercel

The build needs these environment variables. Set them in Vercel → Settings →
Environment Variables, for **Production, Preview and Development**.

**Required — the build fails or the app cannot serve without them:**

| Variable | Notes |
|---|---|
| `DATABASE_URL` | The Supabase pooler URL. The password must be **percent-encoded** — an apostrophe is `%27`, a space is `%20`. Any `sslmode` parameter is stripped in code. |
| `AUTH_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. Rotating it signs everyone out. |
| `SUPABASE_CA_CERT` | The PEM from Settings → Database → SSL Configuration. Serverless has no writable filesystem, so the cert cannot be a file. Without it the app **refuses to serve production traffic** — TLS would be unverified against a database holding financial records. |
| `APP_URL` | e.g. `https://pricenova.com`, no trailing slash. Used to build verification links and provider callback URLs. Production throws rather than fall back to localhost. |
| `NEXT_PUBLIC_SUPABASE_URL` | Safe to expose. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Safe to expose. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Bypasses Row Level Security.** Server-side only — never give it a `NEXT_PUBLIC_` prefix. |

**Optional.** Everything in `.env.example` beyond the above is a payment,
email or SMS credential. Absent means that provider is off: checkout hides it
and verification returns manual review. Nothing fakes a success.

### Why the build needs `prisma generate`

Prisma 7 generates its client through an install script. Vercel blocks
unapproved dependency install scripts, so on a fresh clone `@prisma/client`
exports nothing and the type check fails with *"has no exported member
PrismaClient"*. Two guards now cover it: a `postinstall` script, and
`prisma generate &&` at the head of `build`. The second runs regardless of
install-script policy.

### Schema changes must reach the database before the deploy serves traffic

There are no migration files; the schema is applied with `npm run db:push`
(`prisma db push`). Run it against the production `DATABASE_URL` whenever
`prisma/schema.prisma` changes, **before** promoting the deploy. Additive
changes (new enum values, nullable columns) are safe to push ahead of the code.

## Withdrawal fee

Every withdrawal, whatever its source (profit/prize, commission, bonus/bumper,
accrual or principal), carries a fee set by the `withdrawal.feeBps` setting
(basis points; **200 = 2%**, editable under Admin → Settings).

- **Request:** the full amount is reserved (AVAILABLE → PENDING). The rate and
  fee are snapshotted on the `Withdrawal`, so changing the setting never
  alters a request already made. The form previews the fee and "You receive".
- **Paid:** two ledger transactions, each idempotent —
  `withdrawal:<id>:fee` (FEE: PENDING → `FEE_INCOME`) and
  `withdrawal:<id>:payout` (PENDING → out of PLATFORM_CASH, for the net).
  The admin's Withdrawals table shows **Send** = amount − fee.
- **Rejected:** no fee; the full reserve returns to AVAILABLE.
- `lifetimeWithdrawn` is what the user actually received (net).
- Fee = round-half-up to the cent (`src/lib/fees.ts`). Requests made before
  the fee existed have `feeRateBps = 0` and pay nothing.
