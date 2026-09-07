# Architecture

## The ledger is the spine

Every movement of money is a balanced, double-entry transaction. Nothing
anywhere writes a balance directly.

```
LedgerAccount       kind + ownerKey + currency, with a cached balance
LedgerTransaction   type, description, idempotencyKey (UNIQUE), admin, metadata
LedgerEntry         direction, amount, balanceBefore, balanceAfter
```

**Account normality** — which side increases the balance:

| Normality | Accounts | Meaning |
|---|---|---|
| Debit-normal | `PLATFORM_CASH`, `PRIZE_POOL`, `COMMISSION_EXPENSE` | assets and expenses |
| Credit-normal | `USER_AVAILABLE`, `USER_LOCKED`, `USER_PENDING`, `DEPOSIT_LIABILITY` | what we owe |

So a $10 deposit is `DEBIT platform cash 10` / `CREDIT user locked 10`: our cash
goes up, and so does our liability to the participant. A user's balance reads
naturally positive without anyone remembering a sign convention.

`post()` refuses a transaction whose debits and credits differ, and refuses a
negative amount — direction carries the sign. Touched accounts are locked with
`SELECT … FOR UPDATE` **ordered by id**, so two concurrent postings against the
same wallet cannot both read the same `balanceBefore`, and locking in a stable
order avoids the deadlock that arrival-order locking invites.

`Wallet` is a cache for fast reads, rebuildable from entries at any time.
`verifyIntegrity()` proves both invariants — every transaction sums to zero, and
every stored balance equals the sum of its entries — and is surfaced on the
admin overview so the books can be *proved* rather than trusted.

## Idempotency (§43)

The idempotency key is derived from the business event, never from a random
value:

```
deposit:<id>:confirm          withdrawal:<id>:reserve
commission:<referralId>       withdrawal:<id>:payout
participation:<id>:unlock     withdrawal:<id>:release
draw:<id>:tier:<id>:winner:<userId>
accrual:<grantId>:<YYYY-MM-DD>
```

A duplicated payment callback, a double-clicked *Approve*, and a re-run cron job
all collide on the unique index and the second one is rejected by the database
rather than by a code path somebody remembered to write. Status preconditions
are asserted *inside* the transaction, which is what makes a double-click safe
rather than merely unlikely.

Tested in `tests/ledger.test.ts`: confirming a deposit three times produces one
ledger transaction and one participation; approving a withdrawal twice pays once.

## Withdrawal reserve

Requesting a withdrawal moves money `AVAILABLE → PENDING` immediately. Without
that reserve, a user could queue three withdrawals against one balance and the
third approval would overdraw the platform. Rejection returns the reserve;
payout consumes it and reduces platform cash.

## Where the rules live

Nothing the business might change is a constant.

| Rule | Where |
|---|---|
| (i) $10 deposit, (ii) 40-day lock, (vi) $3 commission | `Plan` row |
| (iii) monthly draw, (xi) 25th cutoff, (iv) prize tiers | `Setting` |
| (v)(ix)(x) withdrawal windows | `Setting` — `withdrawal.windows.*` |
| (vii)(viii) bumper thresholds | `BumperEvent` rows |
| (xiv) $10/day accrual | `Setting` + `AccrualGrant` |

Services: `LedgerService` · `ParticipationService` · `CommissionService` ·
`WithdrawalService` · `DrawService` · `BumperService` · `EligibilityService` ·
`SettingsService` · `AuditService` · `NotificationService`.

## Auditability

`DrawEntry` is an **immutable snapshot** taken when entries close. Eligibility is
time-dependent, so a draw whose participants are computed live cannot be audited
afterwards — "who was eligible in September?" becomes unanswerable the moment
anyone's status changes. Closing entries freezes the list, and every later step
reads from it.

Winner selection records the admin, the entry number, the mode and the IP before
the prize is credited. Manual selection is only defensible if it is
attributable.

`AuditLog` is append-only: the module exposes no update or delete, and nothing
else writes to the table. Adjustments never edit history — they post a new,
signed transaction attributed to the admin, with the reason stored alongside.

## Auth

Sessions are a signed httpOnly cookie carrying **only** the user id. Roles are
read from the database on every request, so suspending a user or revoking an
admin role takes effect immediately rather than whenever their cookie happens to
expire — which matters when the role in question can approve payouts.

Guards run in server components, not middleware: middleware runs on the edge
runtime where Prisma cannot, and a guard that cannot read the database can only
trust the cookie's own contents.

Passwords use scrypt (Node standard library, OWASP parameters, no native build
step). Login returns one message for "no such user" and "wrong password" alike,
and verifies against a dummy hash when the user is missing, so neither the
response body nor its timing is an account-enumeration oracle.

## Known gaps

- **Deposits are confirmed manually.** There is no chain watcher or payment
  provider yet; `Deposit.externalRef` is where a real reference will go, and the
  `(method, externalRef)` unique index already prevents crediting one payment
  twice.
- **Accrual rule (xiv)** has its schema and idempotency design but no scheduled
  job yet.
- **Principal release** runs on demand rather than on a schedule.
