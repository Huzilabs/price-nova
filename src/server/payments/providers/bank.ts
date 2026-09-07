import type {
  PaymentProviderAdapter, ChargeResult, PaymentUpdate,
  VerifyTransactionInput, VerifyResult,
} from "../types";

/**
 * Bank transfer.
 *
 * Retail banks in Pakistan do not expose a per-transaction lookup API to
 * merchants, so this provider is honest about it: every payment goes to manual
 * review, always. Pretending otherwise would mean either inventing an endpoint
 * or trusting the reference the user typed, and both of those are how people
 * get credited for money they never sent.
 *
 * The reference the user submits is a lookup key for whoever reconciles the
 * bank statement. It is not evidence.
 */
export const bankTransferProvider: PaymentProviderAdapter = {
  key: "BANK_TRANSFER",
  methods: ["MANUAL_BANK"],

  /** Needs no third party, so it is always usable. */
  isConfigured() { return true; },
  missingConfig() { return []; },
  isSandbox() { return false; },

  requiredFields() {
    return [{
      name: "submittedReference",
      label: "Bank transaction / reference number",
      type: "text",
      placeholder: "As shown on your transfer receipt",
      hint: "Our team matches this against the bank statement.",
    }];
  },

  async createCharge(): Promise<ChargeResult> {
    return { status: "WAITING_FOR_PAYMENT", expiresAt: null };
  },

  async verifyWebhook(): Promise<PaymentUpdate | null> { return null; },

  async verifyTransaction(input: VerifyTransactionInput): Promise<VerifyResult> {
    if (!input.submittedReference.trim()) {
      return { status: "REJECTED", message: "Enter the bank reference number from your transfer receipt." };
    }
    return {
      status: "MANUAL_REVIEW_REQUIRED",
      message:
        "Reference received. Bank transfers are confirmed by our team against the " +
        "bank statement — usually within one working day. You do not need to do anything else.",
    };
  },
};
