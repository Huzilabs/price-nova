/**
 * Fees. Pure integer arithmetic in minor units, shared by the server (which
 * charges) and the withdraw form (which previews), so the two cannot disagree.
 */

/** Default withdrawal fee: 2%, in basis points. Overridable via the `withdrawal.feeBps` setting. */
export const DEFAULT_WITHDRAWAL_FEE_BPS = 200;

/** Fee on `amount` at `bps` basis points, rounded half up to the cent. */
export function withdrawalFee(amount: bigint, bps: number): bigint {
  if (amount <= 0n || bps <= 0) return 0n;
  return (amount * BigInt(Math.round(bps)) + 5_000n) / 10_000n;
}

/** "2%" or "2.5%" for display. */
export function formatBps(bps: number): string {
  return `${Number((bps / 100).toFixed(2))}%`;
}
