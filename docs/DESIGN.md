# PriceNova Design System — v2 "Prize Night"

> Live reference: **`/design`**. If a screen needs something that isn't there,
> add it there first.

## Why v2 exists

v1 was *a private bank's statement crossed with a prize bond certificate*:
warm paper, hairline rules, no cards, 4px radii, brass rationed to prizes. It
was internally consistent and it was **wrong for this product** — it made a
lucky draw feel like a quarterly report. Three specific decisions did the
damage: the light paper ground, the serif-and-hairline "document" register, and
the 8px radius cap that made every surface look like a form field.

v2 keeps exactly one thing from v1 — rationed gold — and rebuilds around
engagement.

## The concept

**A dark stage with the prize lit.**

Three rules, in priority order:

1. **The prize is the hero.** Every screen answers *what can I win and when*
   before anything else. Reading order in the hero never varies: kicker →
   prize → clock → your entries → action.
2. **Progress is always visible.** If a user is N steps from something, show
   the bar. A number tells them where they are; the bar tells them how close,
   and that is what makes them act.
3. **Dark, not grim.** Warm near-black with a green undertone — never blue-grey.
   Colour and motion carry the energy so the layout doesn't have to shout.

Still forbidden: casino imagery, slot machines, neon-on-black, purple AI
gradients, generic blue fintech.

## Colour

| Role | Token | Value | Measured on base |
|---|---|---|---|
| App ground | `base` | `#0b1210` | — |
| Card | `surface` | `#121b17` | — |
| Raised | `surface-2` / `surface-3` | `#18241e` / `#21322a` | — |
| Hairline | `line` | `#26382e` | — |
| Primary text | `hi` | `#f2f7f3` | **17.5:1** |
| Secondary | `mid` | `#a9bdb1` | **9.6:1** |
| Tertiary floor | `lo` | `#7b9186` | **5.6:1** |
| Decoration only | `faint` | `#55675d` | 3.1:1 |
| **Prize** | `gold` | `#f5c451` | 11.6:1 |
| **Progress / success** | `mint` | `#3ddc91` | 10.7:1 |
| **Urgency / CTA** | `coral` | `#ff6b3d` | 6.7:1 |

**Gold and coral buttons take dark ink, not white.** White on coral measures
**2.83:1 and fails**; `#1a1206` on coral is 6.6:1. This is the least intuitive
rule in the system and the easiest to get wrong.

**Gold stays scarce.** It appears on prize values, winning states and
prize-adjacent CTAs. Spending it on a generic button devalues every prize
screen at once.

### Chart series are separate again

`#2aa582` · `#e2703a` · `#5e93d8`

Not the UI accents: gold/mint/coral fall outside the chart lightness band, and
gold-vs-mint measures **ΔE 6.7 under protanopia**. These three pass lightness
band, chroma floor, CVD separation, normal-vision floor and surface contrast on
*all pairs*. Verified with the palette validator, not by eye.

## Type

| Face | Job |
|---|---|
| **Bricolage Grotesque** 600–800 | Prize figures, countdowns, page titles. Heavy, slightly irregular, has character. |
| **Archivo** 400–800 | All interface text. Wide, confident, holds up at 13px and at 900. |
| **IBM Plex Mono** | Only where digits must line up: ledger rows, entry numbers, IDs, admin tables. |
| **Noto Nastaliq Urdu** | Urdu. Needs ~2.4 line-height — budget the vertical space. |

Scale: `micro` 11 · `tag` 12 · `sm` 13 · `base` 15 · `lg` 17 · `title` 22 ·
`h2` 28 · `h1` 36 · `mega` 52 · `prize` 72.

Deliberately fewer, larger steps than v1's eleven. A rewards product speaks in
headlines and numbers, not nine sizes of body copy.

## Geometry & elevation

Radii `6 / 10 / 16 / 22 / 28`. v1 capped at 8px to feel serious — that cap was
the single biggest reason it read corporate.

On dark, a drop shadow is invisible; **light** is what makes a surface feel
raised. Hence `shadow-card` and `shadow-lift` (a 1px inset highlight plus a
deep ambient), and `shadow-gold` / `shadow-coral` / `shadow-mint` for glow on
primary actions.

## Motion

`--dur-1` 140ms · `--dur-2` 220ms · `--dur-3` 320ms · `--dur-celebrate` 1100ms.
Easing `cubic-bezier(.16,1,.3,1)`, with `--ease-pop` for arrivals.

Available: `animate-pop`, `animate-rise`, `animate-float`, and `sheen` — a slow
pass of light across the single hero CTA, every 4.5s, never a strobe. All of it
disabled under `prefers-reduced-motion`.

The countdown does **not** animate. Digits are tabular so the block holds still;
urgency arrives by the seconds pair turning coral inside the final hour. That
restraint is the difference between anticipation and a flashing sign.

## Components that carry the product

- **`DrawHero`** — prize, clock, entries, action, and "how it works" folded in
  so nobody has to hunt for it.
- **`Ticket`** — real notched geometry via CSS mask, no image. A user's entries
  should feel like something they hold.
- **`ProgressBar` / `ProgressRing` / `Fraction`** — the most-used components here.
- **`RewardCard`** — answers *what is it → how close am I → what do I do next*,
  in that fixed order. A prize with no distance is an advert; a distance with no
  action is a nag.
- **`LevelBadge`** — Newcomer → Builder → Captain → Leader → Champion → Legend.
- **`WinnerCard` + `Avatar`** — social proof. Names shorten to "Ayesha K.":
  enough to feel like a person, not enough to expose a participant.

## Shells

**Member app** — mobile-first, bottom tab bar (thumb-reachable, always visible),
slim top bar carrying identity and balance only.

**Admin** — sidebar on desktop, collapsing to a scrolling strip below `lg`,
`data-density="compact"`. Same tokens, tighter rows. Data-oriented, but it wears
the rewards identity rather than looking like a generic enterprise panel.

Keeping the two structurally different is what stops either reading as a re-skin
of the other.

## Rules of thumb

- Reaching for gold? Only if this is a prize, a win, or the action that leads to one.
- Building a card? One idea, one action. Two headings means two cards.
- Showing a distance? Show the bar, not just the number.
- Putting white text on coral or gold? Don't — dark ink, measured.
- Adding a fourth chart series? Fold it into "Other" or facet.
- Wide content scrolls in its own container. The page body never scrolls
  horizontally — `scripts/tour.mjs` fails the build if it does.

## Verifying

```bash
node scripts/tour.mjs /tmp/shots 390 1200   # guest + member + admin, every page
node scripts/shot.mjs <url> out.png 390 1600
```

Both assert no horizontal overflow and no console errors, and name the
offending element when they fail.

## Not yet built

- **Winner celebration state.** Tokens and motion are in place
  (`--dur-celebrate`, `animate-pop`); the reveal sequence itself is not.
- **Light mode.** Deliberately absent — this product has one look.
- **Urdu RTL pass.** Logical properties are used throughout, so it is a
  translation and a QA pass rather than a rebuild.
