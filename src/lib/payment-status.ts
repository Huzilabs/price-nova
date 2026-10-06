import type { Prisma } from "@prisma/client";

/**
 * The four statuses people see for a payment.
 *
 * The database keeps the provider-level lifecycle (WAITING_FOR_PAYMENT,
 * MANUAL_REVIEW_REQUIRED, SUCCESS …) because automated rails need it. People
 * reviewing or making a manual payment only need four words, so this maps
 * onto them rather than adding a parallel enum that could drift.
 *
 *   PENDING   — submitted (or in flight) and not yet decided
 *   APPROVED  — credited; SUCCESS or OVERPAID
 *   REJECTED  — refused, failed or expired; nothing credited
 *   CANCELLED — withdrawn by the participant
 */
export type DisplayStatus = "AWAITING_TXID" | "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export function displayStatus(payment: {
  status: string;
  userSubmittedReference?: string | null;
  provider?: string;
}): DisplayStatus {
  switch (payment.status) {
    case "SUCCESS":
    case "OVERPAID":
      return "APPROVED";
    case "REJECTED":
    case "FAILED":
    case "EXPIRED":
    case "REFUNDED":
      return "REJECTED";
    case "CANCELLED":
      return "CANCELLED";
    default:
      // A manual payment the participant opened but never submitted a TXID
      // for is not awaiting review — there is nothing to review yet.
      if (payment.provider === "MANUAL" && !payment.userSubmittedReference) return "AWAITING_TXID";
      return "PENDING";
  }
}

export const DISPLAY_LABEL: Record<DisplayStatus, string> = {
  AWAITING_TXID: "Awaiting TXID",
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export const DISPLAY_TONE: Record<DisplayStatus, "neutral" | "warn" | "mint" | "bad"> = {
  AWAITING_TXID: "neutral",
  PENDING: "warn",
  APPROVED: "mint",
  REJECTED: "bad",
  CANCELLED: "neutral",
};

/** Human label for a payment method, without leaking enum spelling. */
export function methodLabel(method: string): string {
  switch (method) {
    case "MANUAL_USDT_BEP20": return "USDT · BEP20 (manual)";
    case "MANUAL_CRYPTO": return "Crypto (manual)";
    case "MANUAL_BANK": return "Bank transfer";
    default: return method.replace(/_/g, " ");
  }
}

/** Block explorer link for a hash on a network we can name. */
export function explorerUrl(network: string | null | undefined, txHash: string | null | undefined): string | null {
  if (!txHash) return null;
  const n = (network ?? "").toUpperCase();
  if (n.includes("BEP") || n === "BSC") return `https://bscscan.com/tx/${txHash}`;
  if (n.includes("ERC")) return `https://etherscan.io/tx/${txHash}`;
  if (n.includes("TRC")) return `https://tronscan.org/#/transaction/${txHash}`;
  return null;
}

/**
 * Pending deposits that actually need an admin: legacy deposits with no
 * payment, manual payments whose participant submitted a TXID, and gateway
 * amount mismatches. A checkout opened but never submitted is excluded —
 * there is nothing to review yet. Matches the "Needs review" tab.
 */
export const DEPOSITS_NEEDING_REVIEW: Prisma.DepositWhereInput = {
  status: "PENDING",
  OR: [
    { payment: null },
    { payment: { userSubmittedReference: { not: null } } },
    { payment: { status: { in: ["UNDERPAID", "OVERPAID"] } } },
  ],
};
