import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  PaymentProviderAdapter, CreateChargeInput, ChargeResult, PaymentUpdate, WebhookRequest,
  VerifyTransactionInput, VerifyResult,
} from "../types";
import { ProviderUnconfiguredError } from "../types";

/**
 * Easypaisa, via Telenor's hosted checkout.
 *
 * We create the order and redirect to Easypaisa's own page; the user authorises
 * there. No Easypaisa credential is ever entered in PriceNova — building a
 * lookalike login form would be indistinguishable from phishing.
 */
const ENDPOINTS = {
  sandbox: "https://easypaystg.easypaisa.com.pk/easypay/Index.jsf",
  production: "https://easypay.easypaisa.com.pk/easypay/Index.jsf",
};

function config() {
  return {
    storeId: process.env.EASYPAISA_STORE_ID ?? "",
    hashKey: process.env.EASYPAISA_HASH_KEY ?? "",
    accountNumber: process.env.EASYPAISA_ACCOUNT_NUMBER ?? "",
    mode: (process.env.EASYPAISA_MODE ?? "sandbox") as "sandbox" | "production",
  };
}

function sign(fields: Record<string, string>, key: string): string {
  const message = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("&");
  return createHmac("sha256", key).update(message).digest("base64");
}

export const easypaisaProvider: PaymentProviderAdapter = {
  key: "EASYPAISA",
  methods: ["EASYPAISA"],

  isConfigured() {
    const c = config();
    return Boolean(c.storeId && c.hashKey);
  },

  missingConfig() {
    const c = config();
    return [
      !c.storeId && "EASYPAISA_STORE_ID",
      !c.hashKey && "EASYPAISA_HASH_KEY",
    ].filter(Boolean) as string[];
  },

  isSandbox() { return config().mode !== "production"; },

  requiredFields() {
    return [{
      name: "mobileNumber",
      label: "Easypaisa mobile number",
      type: "tel",
      placeholder: "03001234567",
      hint: "You'll approve the payment in Easypaisa. We never ask for your PIN.",
    }];
  },

  async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
    const c = config();
    if (!this.isConfigured()) throw new ProviderUnconfiguredError("Easypaisa", this.missingConfig());

    const expiry = new Date(Date.now() + 60 * 60_000);
    const fields: Record<string, string> = {
      storeId: c.storeId,
      orderRefNum: input.reference,
      // Easypaisa expects PKR with two decimals.
      amount: (Number(input.amount.minor) / 100).toFixed(2),
      postBackURL: input.webhookUrl,
      expiryDate: expiry.toISOString().slice(0, 19).replace("T", " "),
      merchantHashedReq: "",
      autoRedirect: "1",
      paymentMethod: "MA_PAYMENT_METHOD",
      emailAddr: input.user.email,
      mobileNum: (input.fields.mobileNumber ?? "").replace(/\D/g, ""),
    };
    delete (fields as Record<string, unknown>).merchantHashedReq;
    fields.merchantHashedReq = sign(fields, c.hashKey);

    // Easypaisa's checkout is a browser form POST, not a JSON API — so we hand
    // the shape back and let the client submit it.
    return {
      status: "WAITING_FOR_PAYMENT",
      formPost: { action: ENDPOINTS[c.mode], fields },
      expiresAt: expiry,
    };
  },

  async verifyWebhook(request: WebhookRequest): Promise<PaymentUpdate | null> {
    const c = config();
    if (!c.hashKey) return null;

    const payload = Object.fromEntries(new URLSearchParams(request.rawBody)) as Record<string, string>;
    const provided = String(payload.merchantHashedReq ?? payload.hashedReq ?? "");
    if (!provided) return null;

    const { merchantHashedReq: _a, hashedReq: _b, ...rest } = payload;
    const expected = sign(rest, c.hashKey);

    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    const status = String(payload.status ?? payload.responseCode ?? "").toUpperCase();
    const reference = String(payload.orderRefNum ?? "");
    if (!reference) return null;

    const success = status === "0000" || status === "SUCCESS";
    return {
      reference,
      status: success ? "SUCCESS" : status === "PENDING" ? "WAITING_FOR_PAYMENT" : "FAILED",
      providerTxId: payload.transactionId ?? null,
      receivedMinor: payload.transactionAmount
        ? BigInt(Math.round(Number(payload.transactionAmount) * 100))
        : null,
      failureReason: success ? null : (payload.responseDesc ?? `Status ${status}`),
      dedupeKey: `easypaisa:${reference}:${status}:${payload.transactionId ?? ""}`,
      raw: payload,
    };
  },

  /**
   * Easypaisa transaction inquiry.
   *
   * Deliberately NOT given a default endpoint. Whether a merchant gets a
   * transaction-inquiry API at all — and at what URL and contract — depends on
   * the agreement Telenor grants. Guessing a URL here would be inventing an
   * integration, so the operator supplies it via EASYPAISA_INQUIRY_URL. Until
   * they do, every Easypaisa payment goes to manual review, which is the true
   * state of affairs rather than a pretend one.
   */
  async verifyTransaction(input: VerifyTransactionInput): Promise<VerifyResult> {
    const c = config();
    const submitted = input.submittedReference.trim();
    const inquiryUrl = process.env.EASYPAISA_INQUIRY_URL ?? "";

    if (!submitted) {
      return { status: "REJECTED", message: "Enter the Easypaisa transaction ID from your payment confirmation." };
    }
    if (!this.isConfigured() || !inquiryUrl || !input.account?.autoVerify) {
      return {
        status: "MANUAL_REVIEW_REQUIRED",
        message:
          "Reference received. Easypaisa does not expose transaction lookup for this " +
          "account, so our team confirms it against the merchant statement — usually " +
          "within a few hours.",
      };
    }

    const query = new URLSearchParams({
      storeId: c.storeId,
      orderId: submitted,
      accountNum: c.accountNumber,
    });

    let raw: Record<string, unknown>;
    try {
      const response = await fetch(`${inquiryUrl}?${query}`, {
        headers: { Credentials: c.hashKey, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        return {
          status: "MANUAL_REVIEW_REQUIRED",
          message: "Easypaisa did not respond to the lookup. Our team will confirm this manually.",
          raw,
        };
      }
    } catch {
      return {
        status: "MANUAL_REVIEW_REQUIRED",
        message: "Easypaisa could not be reached. Your reference is saved and our team will confirm it.",
      };
    }

    const code = String(raw.responseCode ?? raw.status ?? "").toUpperCase();
    const paid = code === "0000" || code === "SUCCESS" || code === "PAID";
    if (!paid) {
      return {
        status: code === "PENDING" ? "VERIFYING" : "REJECTED",
        message: code === "PENDING"
          ? "Easypaisa shows this payment as still in progress. Check again shortly."
          : "Easypaisa does not show a completed payment for that transaction ID.",
        providerTxId: submitted,
        raw,
      };
    }

    const amount = raw.transactionAmount ?? raw.amount;
    return {
      status: "SUCCESS",
      message: "Easypaisa confirmed this payment.",
      providerTxId: String(raw.transactionId ?? submitted),
      receivedMinor: amount != null ? BigInt(Math.round(Number(amount) * 100)) : null,
      raw,
    };
  },
};
