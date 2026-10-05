import type {
  PaymentProviderAdapter, CreateChargeInput, ChargeResult, PaymentUpdate,
  VerifyTransactionInput, VerifyResult,
} from "../types";

/**
 * Manual USDT on BNB Smart Chain (BEP20).
 *
 * The participant sends USDT to the address an admin published at
 * /admin/payment-accounts, then submits the amount and the transaction hash.
 * Nothing here looks the hash up: the payment waits in MANUAL_REVIEW_REQUIRED
 * until an admin checks it on a block explorer and approves it. Approval is
 * the only path to a credit.
 *
 * When a gateway such as Cryptomus is added it gets its own adapter on the
 * USDT_BEP20 method. This one stays as the fallback rail that needs no
 * merchant account.
 */

/** A BSC transaction hash: 32 bytes of hex, conventionally 0x-prefixed. */
const TX_HASH = /^0x[0-9a-f]{64}$/;

export function normaliseBep20TxHash(raw: string):
  { ok: true; value: string } | { ok: false; error: string } {
  let value = raw.trim().replace(/\s+/g, "").toLowerCase();
  // Pasted explorer links are common; take the hash off the end.
  const fromUrl = value.match(/\/tx\/(0x[0-9a-f]{64})/);
  if (fromUrl) value = fromUrl[1]!;
  if (/^[0-9a-f]{64}$/.test(value)) value = `0x${value}`;
  if (!TX_HASH.test(value)) {
    return {
      ok: false,
      error: "That does not look like a BEP20 transaction ID. It starts with 0x followed by 64 letters and numbers.",
    };
  }
  return { ok: true, value };
}

export const manualUsdtBep20Provider: PaymentProviderAdapter = {
  key: "MANUAL",
  methods: ["MANUAL_USDT_BEP20"],

  /** Needs no third party, so it is always available. */
  isConfigured() { return true; },
  missingConfig() { return []; },
  isSandbox() { return false; },

  requiredFields() {
    return [{
      name: "submittedReference",
      label: "Transaction ID / TXID",
      type: "text",
      placeholder: "0x…",
      hint: "Checked by our team on BscScan before anything is credited.",
    }];
  },

  async createCharge(_input: CreateChargeInput): Promise<ChargeResult> {
    return { status: "WAITING_FOR_PAYMENT", expiresAt: null };
  },

  /** There is no provider to call back. */
  async verifyWebhook(): Promise<PaymentUpdate | null> { return null; },

  normaliseReference: normaliseBep20TxHash,

  /**
   * Records the hash for the reviewing admin. Never returns SUCCESS: a pasted
   * hash is a claim, and only an admin approval turns it into a credit.
   */
  async verifyTransaction(input: VerifyTransactionInput): Promise<VerifyResult> {
    return {
      status: "MANUAL_REVIEW_REQUIRED",
      message: "Payment submitted successfully. Your payment is waiting for verification.",
      txHash: input.submittedReference,
    };
  },
};
