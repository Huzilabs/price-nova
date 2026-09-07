# Payments

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
| Bank transfer / crypto transfer | `MANUAL` | none — always available |

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
| `DATABASE_URL` | The Supabase pooler URL. The password must be **percent-encoded** — an apostrophe is `%27`, a space is `%20`. |
| `AUTH_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. Rotating it signs everyone out. |
| `SUPABASE_CA_CERT` | The PEM from Settings → Database → SSL Configuration. Serverless has no writable filesystem, so the cert cannot be a file. Without it the app **refuses to serve production traffic** — TLS would be unverified against a database holding financial records. |
| `APP_URL` | e.g. `https://pricenova.com`. Used to build verification links and provider callback URLs, so a wrong value silently breaks webhooks. |
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
