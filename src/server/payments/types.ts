import type { PaymentMethod, PaymentProvider, PaymentStatus } from "@prisma/client";

/**
 * The provider contract.
 *
 * Every payment method in PriceNova goes through one of these. The service
 * layer knows only this interface, so adding a rail means writing one file and
 * registering it — nothing above changes.
 *
 * Two rules bind every implementation:
 *
 *   1. **A provider never marks a payment successful on its own say-so from
 *      the browser.** Success arrives through `verifyWebhook` (server-to-server,
 *      signature-checked) or `poll` (server-to-provider). A frontend "payment
 *      complete" callback is a navigation hint and nothing more.
 *   2. **An unconfigured provider refuses.** It does not simulate, and it does
 *      not succeed. `isConfigured()` gates it out of the UI entirely.
 */

export type Money = { minor: bigint; currency: string };

export class PaymentProviderError extends Error {}
export class ProviderUnconfiguredError extends PaymentProviderError {
  constructor(readonly provider: string, readonly missing: string[]) {
    super(
      `${provider} is not configured. Missing: ${missing.join(", ")}. ` +
      `See docs/PAYMENTS.md.`,
    );
  }
}

/** What the service hands a provider to start a checkout. */
export type CreateChargeInput = {
  /** Our order id. Providers echo it back; it is how a webhook finds us. */
  reference: string;
  amount: Money;
  method: PaymentMethod;
  user: { id: string; email: string; fullName: string; phone: string | null };
  /** Where the provider should return the user after a hosted checkout. */
  returnUrl: string;
  /** Server-to-server callback. */
  webhookUrl: string;
  /** Method-specific input the UI collected, e.g. a JazzCash mobile number. */
  fields: Record<string, string>;
};

/** What a provider gives back once a charge exists on their side. */
export type ChargeResult = {
  status: PaymentStatus;
  providerTxId?: string | null;
  /** Hosted checkout to redirect to. */
  checkoutUrl?: string | null;
  /** Form POST some gateways require instead of a GET redirect. */
  formPost?: { action: string; fields: Record<string, string> } | null;
  /** Crypto: where to send funds. */
  crypto?: {
    asset: string;
    network: string;
    address: string;
    /** Decimal string. Never a float. */
    amount: string;
    requiredConfirmations: number;
  } | null;
  expiresAt?: Date | null;
  raw?: unknown;
};

/** The normalised result of a webhook or a poll. */
export type PaymentUpdate = {
  reference: string;
  status: PaymentStatus;
  providerTxId?: string | null;
  txHash?: string | null;
  confirmations?: number | null;
  requiredConfirmations?: number | null;
  /** Amount actually received, in the payment's own currency minor units. */
  receivedMinor?: bigint | null;
  /** Crypto amount actually received, decimal string. */
  receivedCrypto?: string | null;
  failureReason?: string | null;
  /** Stable key so a replayed webhook is recorded once. */
  dedupeKey: string;
  raw?: unknown;
};

export type WebhookRequest = {
  headers: Record<string, string>;
  rawBody: string;
};

/**
 * What the user typed, plus the account they claim to have paid into.
 * Handed to a provider so it can look the transaction up on its own systems.
 */
export type VerifyTransactionInput = {
  reference: string;
  /** The user-supplied provider transaction / reference id. */
  submittedReference: string;
  /** What the user says they sent, in minor units. */
  submittedMinor: bigint;
  /** What the plan actually costs, in minor units. */
  expectedMinor: bigint;
  currency: string;
  method: PaymentMethod;
  /** Our receiving account, so the provider can check the money arrived HERE. */
  account: {
    id: string;
    type: string;
    accountNumber: string | null;
    walletAddress: string | null;
    network: string | null;
    /** False when no API credentials exist for this account. */
    autoVerify: boolean;
  } | null;
};

/**
 * The outcome of a verification attempt.
 *
 * `MANUAL_REVIEW_REQUIRED` is a first-class, honest answer: it is what a
 * provider returns when it genuinely cannot confirm the transaction — no
 * credentials, no lookup API, or a rail like a bank transfer that exposes no
 * per-transaction endpoint. It is never a stand-in for success.
 */
export type VerifyResult = {
  status: Extract<PaymentStatus,
    "SUCCESS" | "VERIFYING" | "MANUAL_REVIEW_REQUIRED" | "FAILED" | "REJECTED"
    | "UNDERPAID" | "OVERPAID" | "PAYMENT_DETECTED" | "CONFIRMING">;
  /** Human-readable, safe to show the participant. */
  message: string;
  providerTxId?: string | null;
  txHash?: string | null;
  /** What the provider says actually arrived. Overrides the user's claim. */
  receivedMinor?: bigint | null;
  receivedCrypto?: string | null;
  confirmations?: number | null;
  requiredConfirmations?: number | null;
  /** Raw provider response, minus anything secret. Stored for disputes. */
  raw?: unknown;
};

export interface PaymentProviderAdapter {
  readonly key: PaymentProvider;
  readonly methods: readonly PaymentMethod[];

  /** Credentials present? Unconfigured providers are hidden from the UI. */
  isConfigured(): boolean;
  /** Which env vars are missing, for the setup doc and admin diagnostics. */
  missingConfig(): string[];
  /** True when pointing at the provider's sandbox rather than production. */
  isSandbox(): boolean;

  /** Fields the UI must collect before starting, e.g. a mobile number. */
  requiredFields(method: PaymentMethod): Array<{
    name: string; label: string; type: "tel" | "text" | "email"; placeholder?: string; hint?: string;
  }>;

  createCharge(input: CreateChargeInput): Promise<ChargeResult>;

  /**
   * Verify authenticity and normalise. MUST return null if the signature does
   * not check out — never throw away the check because a payload "looks right".
   */
  verifyWebhook(request: WebhookRequest): Promise<PaymentUpdate | null>;

  /** Optional server-to-provider status read, for polling UIs and reconciliation. */
  poll?(payment: {
    reference: string; providerTxId: string | null; receivingAddress: string | null;
  }): Promise<PaymentUpdate | null>;

  /**
   * Look up a transaction the user says they made.
   *
   * MUST NOT return SUCCESS unless the provider actually confirmed it. When no
   * API is available the correct answer is MANUAL_REVIEW_REQUIRED.
   */
  verifyTransaction(input: VerifyTransactionInput): Promise<VerifyResult>;
}

/** Statuses from which no further transition is allowed. */
export const TERMINAL_STATUSES: readonly PaymentStatus[] = [
  "SUCCESS", "FAILED", "EXPIRED", "CANCELLED", "REFUNDED",
] as const;

/** Statuses that mean "the user still has something to do". */
export const OPEN_STATUSES: readonly PaymentStatus[] = [
  "PENDING", "WAITING_FOR_PAYMENT", "PAYMENT_DETECTED", "CONFIRMING",
] as const;
