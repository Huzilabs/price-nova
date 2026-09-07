# PriceNova — Decoded Handwritten Requirements

Source: 4 pages of handwritten notes (Roman Urdu + English), photographed.
Originals in `./photos/`. This transcript is the authoritative reading of them.

> Anything in _italics_ below is an interpretation, not literal text.
> Every monetary value here is a **seed default only** — all of it is
> configurable via `settings` / `plans` at runtime.

---

## Page 1 — `page-1-plans.jpeg` — PLANS

| # | Literal note | Meaning |
|---|---|---|
| i | `Deposit :- 10 $  <- Pakaj` | Participation package costs **$10** |
| ii | `Withdrawal time :- After 40 days, when Deposit Amount 10$` | Deposited principal locked **40 days** from deposit |
| iii | `Qurrandazi :- After one month, Per month last day` | Draw runs **monthly, on the last day of the month**; first draw one month after launch |
| iv | `Inamat :- 250 person -> 200$ / 500 -> 50$` | Prize tiers. See ambiguity note below. |
| v | `Inamat withdrawal Date :- 1 AND 2 Date` | Prize payouts withdrawable on the **1st–2nd** of the month |

**Ambiguity (iv).** The line reads `250 person ↓ 200$` and `500 ↓ 50$` (the `500`
overwrites a struck-out `450`). Three readings are possible: 250 winners of $200
each; a $200 prize once 250 people have entered; or the 250th entrant winning.
Modelled as **N tiers of `winnerCount × prizeAmount`**, which expresses all three.
Seeded as tier 1 = 250 × $200, tier 2 = 500 × $50. **Needs confirmation.**

---

## Page 2 — `page-2-commission-bumper.jpeg` — COMMISSION & BUMPER

| # | Literal note | Meaning |
|---|---|---|
| vi | `Team work :- Comiction. Jo shakhs jitnay log lay ga 10$ waly, usy per person k 3$ milay gay` | **$3 commission per referred person** who takes the $10 package |
| vi (rules) | `Commition lenay k liye apnay 10$ deposit lazim hn. Ager wo apny 10$ withdrawal kry ga to usy commition nhi mily gi` | Referrer must keep **their own $10 deposit active**. Withdrawing the principal **ends commission eligibility**. |
| vii | `Ager koi shakhs 100 person 10$ waly lay ay ga to us ko commition k ilawa 100$ Bumper Prise b mily ga` | **100 referrals → +$100 bumper**, *in addition to* commission |
| viii | `" " 300 person " " Bumper Prise 70cc Honda / 500$` | **300 referrals → 70cc Honda motorcycle _or_ $500 cash** |
| ix | `Bumper price withdrawal : (Any time)` | Bumper prizes have **no withdrawal window** |
| x | `Commition withdrawal Time :- 1 and 2, 16 and 17 Date` | Commission withdrawable **1st–2nd** and **16th–17th** only |
| xi | `25 date k bad jo band qurandazi may ay ga us ka name Next month ki entry may ho ga` | Entries after the **25th** roll into the **following month's** draw |
| xii | `Deposit Adress :- (Bep 20 / TRC 20)` | Deposits via **USDT BEP-20 and TRC-20** |

---

## Page 3 — `page-3-i18n-daily-income.jpeg`

| # | Literal note | Meaning |
|---|---|---|
| xiii | `English And Urdu menu` | Full **English + Urdu** UI. Urdu is RTL → logical CSS properties and Nastaliq typography are design-system constraints, not a retrofit. |
| xiv | `Ager koe shakhs 1000 person lay ata ha 10$ waly, us ko daily k 10$ milyn gy. Is ka withdrawal 1 month k bad ho ga` | **1000 referrals → $10/day recurring accrual**, first withdrawable **1 month** after it starts |

**Note on (xiv).** This is an *accrual*, not a one-off milestone: it needs a
scheduled job posting a daily ledger transaction while the holder stays
eligible — not a `bumper_event`.

---

## Page 4 — `page-4-winner-banner-sketch.jpeg` — WINNER BANNERS

A rough layout sketch, not prose. Two banner compositions labelled
`One flex :-` and `Two flex :-`, each showing a photo slot, a prize slot and a
winner-name slot (`mypic / Toyota / Imran`, `chacha / car / Imran`), plus
`Arsalan` and two empty frames. Margin note: `easypaisa + Jazzcash`.

_Read as:_ a **winners showcase** — winner photo + prize + name — and
**EasyPaisa / JazzCash** as local payment rails alongside the crypto addresses
in (xii).

---

## Consolidated seed configuration

```
plan.participation_amount      $10.00
plan.principal_lock_days       40
commission.per_referral        $3.00
commission.requires_active_principal   true
draw.schedule                  monthly, last day
draw.entry_cutoff_day          25
draw.prize_tiers               [250 x $200, 500 x $50]     <- confirm
prize.withdrawal_window        days 1-2
commission.withdrawal_windows  days 1-2, days 16-17
bumper.thresholds              100 -> $100 cash
                               300 -> Honda 70cc | $500 cash
accrual.threshold              1000 -> $10/day, 30-day hold
payment.methods                USDT BEP-20, USDT TRC-20, EasyPaisa, JazzCash
locales                        en, ur (RTL)
```

## Open questions

1. **Prize tiers (iv)** — which of the three readings is correct?
2. **Plan count** — the brief specifies 5 plans; the notes define only the $10
   package. The other 4 are seeded `DRAFT` with no values rather than invented.
3. **Bumper (viii)** — is Honda-vs-$500 the winner's choice, or admin's?
4. **Accrual (xiv)** — does the $10/day stop if referrals lapse below 1000?
