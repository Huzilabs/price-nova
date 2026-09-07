import type {
  PaymentProviderAdapter, CreateChargeInput, ChargeResult, PaymentUpdate,
  VerifyTransactionInput, VerifyResult,
} from "../types";

/**
 * Manual rails: bank transfer and hand-sent crypto.
 *
 * Retained because they are the only thing that works with no merchant
 * accounts, and because some participants genuinely pay this way. Kept
 * deliberately separate from the automated methods so the two never blur: this
 * is the ONLY provider that accepts a user-typed reference, and that reference
 * is a hint for the reviewing admin — never proof of anything.
 *
 * A manual payment is never marked SUCCESS by this adapter. It waits for an
 * administrator to confirm the underlying deposit, exactly as before.
 */
export const manualProvider: PaymentProviderAdapter = {
  key: "MANUAL",
  methods: ["MANUAL_CRYPTO"],

  /** Always available: it needs no third party. */
  isConfigured() { return true; },
  missingConfig() { return []; },
  isSandbox() { return false; },

  requiredFields(method) {
    return [{
      name: "submittedReference",
      label: method === "MANUAL_BANK" ? "Transfer reference" : "Transaction hash (TXID)",
      type: "text",
      placeholder: method === "MANUAL_BANK" ? "Bank reference number" : "0x… or TXID",
      hint: "Our team matches your payment against this. It is checked by a person, not automatically.",
    }];
  },

  async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
    return {
      status: "WAITING_FOR_PAYMENT",
      providerTxId: input.fields.submittedReference?.trim() || null,
      expiresAt: null,
    };
  },

  /** Manual payments have no provider to call back. */
  async verifyWebhook(): Promise<PaymentUpdate | null> { return null; },

  /**
   * A hand-sent crypto transfer to an address we do not monitor. The hash is
   * recorded so an admin can check it on a block explorer; this code does not
   * and must not treat a pasted hash as proof.
   */
  async verifyTransaction(input: VerifyTransactionInput): Promise<VerifyResult> {
    const submitted = input.submittedReference.trim();
    if (!submitted) {
      return { status: "REJECTED", message: "Enter the transaction hash so our team can find your payment." };
    }
    return {
      status: "MANUAL_REVIEW_REQUIRED",
      message:
        "Transaction hash received. Our team verifies it on-chain against our receiving " +
        "address before crediting. You do not need to do anything else.",
      txHash: submitted,
    };
  },
};
