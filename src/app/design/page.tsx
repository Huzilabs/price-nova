import { Button } from "@/components/primitives/Button";
import { Badge, StatusBadge, LevelBadge } from "@/components/primitives/Badge";
import { Card, SectionHead, EmptyState } from "@/components/primitives/Card";
import { ProgressBar, ProgressRing, Fraction } from "@/components/primitives/Progress";
import { Ticket, TicketCount } from "@/components/primitives/Ticket";
import { Countdown } from "@/components/primitives/Countdown";
import { Field, Input, Select, MoneyInput } from "@/components/primitives/Field";
import { RewardCard } from "@/components/reward/RewardCard";
import { WinnerCard, Avatar } from "@/components/reward/WinnerCard";
import { Wordmark, Mark } from "@/components/shell/Wordmark";

export const metadata = { title: "Design system" };

/**
 * The design system, rendered. If a screen needs something that is not here,
 * it gets added here first.
 */
export default function DesignPage() {
  const soon = new Date(Date.now() + 1000 * 60 * 60 * 26);

  return (
    <div className="mx-auto max-w-[62rem] px-4 py-10">
      <Wordmark />

      <h1 className="font-display mt-6 text-h1 font-extrabold tracking-[-0.03em] text-hi">
        Design system v2 — Prize Night
      </h1>
      <p className="mt-3 max-w-[58ch] text-base leading-relaxed text-mid">
        v1 was a bank statement on warm paper. It made a draw feel like a quarterly
        report. v2 is a dark stage with the prize lit: the prize is the hero, progress
        is always visible, and gold stays scarce so that winning still means something.
      </p>

      <Section title="Colour">
        <Row label="Surfaces">
          {([
            { name: "base", value: "#0b1210" },
            { name: "surface", value: "#121b17" },
            { name: "surface-2", value: "#18241e" },
            { name: "surface-3", value: "#21322a" },
            { name: "line", value: "#26382e" },
          ] as const).map((s) => <Swatch key={s.name} name={s.name} value={s.value} />)}
        </Row>
        <Row label="Text — measured on base">
          <Swatch name="hi" value="#f2f7f3" note="17.5:1" />
          <Swatch name="mid" value="#a9bdb1" note="9.6:1" />
          <Swatch name="lo" value="#7b9186" note="5.6:1 floor" />
          <Swatch name="faint" value="#55675d" note="3.1:1 · non-text" />
        </Row>
        <Row label="Accents">
          <Swatch name="gold — prizes only" value="#f5c451" note="11.6:1" />
          <Swatch name="mint — progress" value="#3ddc91" note="10.7:1" />
          <Swatch name="coral — urgency" value="#ff6b3d" note="6.7:1" />
        </Row>
        <p className="mt-3 max-w-[64ch] text-sm leading-relaxed text-mid">
          Gold and coral buttons take <strong className="text-hi">dark ink</strong>, not
          white: white on coral measures 2.83:1 and fails. Chart series are a separate
          validated set (<span className="mono text-sm">#2aa582 #e2703a #5e93d8</span>) —
          the UI accents are too light for the chart lightness band and gold-vs-mint
          measures ΔE 6.7 under protanopia.
        </p>
      </Section>

      <Section title="Type">
        <div className="space-y-4">
          <Line spec="Bricolage 800 · 72px" role="Prize figure">
            <span className="prize text-prize text-gold">$500</span>
          </Line>
          <Line spec="Bricolage 800 · 52px" role="Countdown, mega numbers">
            <span className="font-display text-mega font-extrabold tracking-[-0.04em] text-hi">14</span>
          </Line>
          <Line spec="Bricolage 800 · 36px" role="Page title">
            <span className="font-display text-h1 font-extrabold tracking-[-0.03em] text-hi">Build your squad</span>
          </Line>
          <Line spec="Archivo 700 · 22px" role="Section heading">
            <span className="font-display text-title font-bold text-hi">Recent winners</span>
          </Line>
          <Line spec="Archivo 400 · 15px" role="Body">
            <span className="text-base text-mid">One deposit enters you in every monthly draw.</span>
          </Line>
          <Line spec="Archivo 700 · 11px caps" role="Tag / kicker">
            <span className="tag text-faint">Top prize</span>
          </Line>
          <Line spec="Plex Mono" role="Ledger, IDs, entry numbers">
            <span className="mono text-base text-hi">SEP-26-00417 · $1,204.00</span>
          </Line>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" size="lg" shine>Enter the draw</Button>
          <Button variant="gold" size="lg">Claim reward</Button>
          <Button variant="solid">Withdraw</Button>
          <Button variant="outline">Details</Button>
          <Button variant="ghost">View all</Button>
          <Button variant="danger">Reject</Button>
          <Button variant="primary" loading>Working</Button>
        </div>
      </Section>

      <Section title="Progress">
        <div className="grid gap-5 sm:grid-cols-2">
          <Card className="p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <Fraction value={14} target={20} className="text-sm" />
              <span className="text-sm font-bold text-gold">$100</span>
            </div>
            <ProgressBar value={14} target={20} tone="mint" size="lg" />
          </Card>
          <Card className="flex items-center gap-4 p-4">
            <ProgressRing value={14} target={20} size={72}>
              <span className="num font-display text-lg font-extrabold text-hi">14</span>
            </ProgressRing>
            <div className="text-sm text-mid">6 more players to unlock</div>
          </Card>
        </div>
      </Section>

      <Section title="Countdown">
        <Countdown target={soon} size="lg" />
        <p className="mt-3 text-sm text-mid">
          The seconds pair turns coral inside the final hour. Urgency arrives through
          colour, not animation.
        </p>
      </Section>

      <Section title="Tickets">
        <div className="grid gap-3 sm:grid-cols-2">
          <Ticket serial="SEP-26-00417" drawName="September Monthly Draw" prize="$200" />
          <Ticket serial="AUG-26-00981" drawName="August Monthly Draw" prize="$200" status="won" />
        </div>
        <div className="mt-4"><TicketCount count={7} /></div>
      </Section>

      <Section title="Reward cards">
        <div className="grid gap-4 sm:grid-cols-2">
          <RewardCard title="100 referrals" prize="$100" requirement="Bring 100 people who complete a qualifying deposit." value={14} target={100} state="in-progress" href="/referrals" />
          <RewardCard title="300 referrals" prize="Honda 70cc or $500" requirement="Bring 300 people who complete a qualifying deposit." value={300} target={300} state="ready" href="/referrals" note="You choose the bike or the cash." />
        </div>
      </Section>

      <Section title="Winners & avatars">
        <div className="grid gap-3 sm:grid-cols-2">
          <WinnerCard name="Ayesha K." prize="$200" drawName="August Monthly Draw" date="31 August" />
          <WinnerCard name="Bilal R." prize="$50" drawName="August Monthly Draw" date="31 August" />
        </div>
        <div className="mt-4 flex gap-2">
          {["Ayesha Khan", "Bilal Rauf", "Sara Malik", "Usman Ali"].map((n) => <Avatar key={n} name={n} />)}
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap items-center gap-2">
          {["ACTIVE", "PENDING_REVIEW", "PAID", "REJECTED", "OPEN", "WINNER_SELECTED"].map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
          <Badge tone="gold" dot>Ready</Badge>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {[0, 5, 40, 150, 320, 1200].map((n) => <LevelBadge key={n} referrals={n} />)}
        </div>
      </Section>

      <Section title="Inputs">
        <div className="grid max-w-xl gap-4 sm:grid-cols-2">
          <Field label="Referral code" htmlFor="d1" hint="Share this with friends.">
            <Input id="d1" defaultValue="PN-4K8QX2" className="mono" />
          </Field>
          <Field label="Amount" htmlFor="d2" required>
            <MoneyInput id="d2" defaultValue="18.00" />
          </Field>
          <Field label="Method" htmlFor="d3">
            <Select id="d3"><option>USDT · TRC-20</option><option>EasyPaisa</option></Select>
          </Field>
          <Field label="Address" htmlFor="d4" error="That is not a valid TRC-20 address.">
            <Input id="d4" defaultValue="TXk9…" invalid className="mono" />
          </Field>
        </div>
      </Section>

      <Section title="Empty state">
        <EmptyState
          title="Your team is empty"
          description="Share your code. When someone joins and makes a qualifying deposit, they join your roster."
          action={<Button variant="primary">Copy invite link</Button>}
        />
      </Section>

      <Section title="Mark">
        <div className="flex items-end gap-6">
          <Mark className="size-12" />
          <Mark className="size-7" />
          <Wordmark />
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12 border-t border-line pt-6">
      <SectionHead title={title} />
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="tag mb-2 text-faint">{label}</div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{children}</div>
    </div>
  );
}

function Swatch({ name, value, note }: { name: string; value: string; note?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="size-9 shrink-0 rounded-lg border border-line" style={{ background: value }} aria-hidden="true" />
      <span className="min-w-0">
        <span className="block truncate text-sm text-hi">{name}</span>
        <span className="mono block text-micro text-faint">{value}</span>
        {note && <span className="block text-micro text-mid">{note}</span>}
      </span>
    </div>
  );
}

function Line({ spec, role, children }: { spec: string; role: string; children: React.ReactNode }) {
  return (
    <div className="grid items-baseline gap-2 border-b border-line-soft pb-4 sm:grid-cols-[1fr_14rem]">
      <div className="min-w-0">{children}</div>
      <div className="sm:text-end">
        <div className="mono text-micro text-faint">{spec}</div>
        <div className="text-micro text-mid">{role}</div>
      </div>
    </div>
  );
}
