/**
 * Money. Integer minor units (cents), never floating point.
 *
 * Every amount in PriceNova — balances, ledger entries, prize values, plan
 * prices — is a `bigint` count of minor units. `0.1 + 0.2 !== 0.3` is not an
 * acceptable failure mode in a system that pays people, so the float type is
 * simply never introduced. Formatting to a decimal string happens once, at
 * the very edge, in `formatMoney`.
 */

export type Minor = bigint;

export const CURRENCY = "USD" as const;
const MINOR_PER_MAJOR = 100n;

/** Parse a human-entered amount ("10", "10.50", "$1,234.5") into minor units. */
export function parseMoney(input: string): Minor {
  const cleaned = input.replace(/[$,\s]/g, "").trim();
  if (!/^-?\d*(\.\d{0,2})?$/.test(cleaned) || cleaned === "" || cleaned === "-") {
    throw new Error(`Not a valid monetary amount: ${JSON.stringify(input)}`);
  }
  const negative = cleaned.startsWith("-");
  const [whole = "0", frac = ""] = cleaned.replace("-", "").split(".");
  const minor = BigInt(whole) * MINOR_PER_MAJOR + BigInt(frac.padEnd(2, "0"));
  return negative ? -minor : minor;
}

/** Build minor units from a whole-dollar literal. Seed/config use only. */
export function dollars(whole: number): Minor {
  if (!Number.isInteger(whole)) {
    throw new Error(`dollars() takes whole dollars only, got ${whole}`);
  }
  return BigInt(whole) * MINOR_PER_MAJOR;
}

export type FormatMoneyOptions = {
  /** Show a leading + on positive values. For ledger deltas. */
  signed?: boolean;
  /** Drop ".00" on whole amounts. For dense admin tables. */
  compactCents?: boolean;
  /** Render the currency symbol. Default true. */
  symbol?: boolean;
};

export function formatMoney(amount: Minor, options: FormatMoneyOptions = {}): string {
  const { signed = false, compactCents = false, symbol = true } = options;

  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const whole = abs / MINOR_PER_MAJOR;
  const cents = abs % MINOR_PER_MAJOR;

  const groupedWhole = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const showCents = !(compactCents && cents === 0n);
  const body = showCents
    ? `${groupedWhole}.${cents.toString().padStart(2, "0")}`
    : groupedWhole;

  const sign = negative ? "−" : signed ? "+" : "";
  return `${sign}${symbol ? "$" : ""}${body}`;
}

/** Split for typographic treatment: hero balances set cents smaller. */
export function splitMoney(amount: Minor): { sign: string; whole: string; cents: string } {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  return {
    sign: negative ? "−" : "",
    whole: (abs / MINOR_PER_MAJOR).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","),
    cents: (abs % MINOR_PER_MAJOR).toString().padStart(2, "0"),
  };
}

/** Prisma returns BigInt; JSON does not carry it. Serialise at the boundary. */
export function serialiseMinor(amount: Minor): string {
  return amount.toString();
}

export function deserialiseMinor(value: string): Minor {
  return BigInt(value);
}
