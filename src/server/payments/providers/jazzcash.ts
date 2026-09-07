import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  PaymentProviderAdapter, CreateChargeInput, ChargeResult, PaymentUpdate, WebhookRequest,
  VerifyTransactionInput, VerifyResult,
} from "../types";
import { ProviderUnconfiguredError } from "../types";

/**
 * JazzCash Mobile Wallet.
 *
 * Uses JazzCash's HTTP form-post checkout: we build the parameter set, sign it
 * with HMAC-SHA256 over the pipe-joined values in the documented order, and
 * hand the browser a self-submitting form to their page. The user authorises
 * inside JazzCash.
 *
 * We never see or store an MPIN — the UI collects only the mobile number,
 * which JazzCash uses to address the authorisation request. Anything that
 * would authenticate the user belongs on JazzCash's side and stays there.
 */
const ENDPOINTS = {
  sandbox: "https://sandbox.jazzcash.com.pk/ApplicationAPI/API/2.0/Purchase/DoMWalletTransaction",
  production: "https://payments.jazzcash.com.pk/ApplicationAPI/API/2.0/Purchase/DoMWalletTransaction",
};

/**
 * Payment Inquiry. JazzCash documents this endpoint for merchants, so it is
 * defaulted — but still overridable, because merchant agreements differ.
 */
const INQUIRY = {
  sandbox: "https://sandbox.jazzcash.com.pk/ApplicationAPI/API/PaymentInquiry/Inquire",
  production: "https://payments.jazzcash.com.pk/ApplicationAPI/API/PaymentInquiry/Inquire",
};

function config() {
  return {
    merchantId: process.env.JAZZCASH_MERCHANT_ID ?? "",
    password: process.env.JAZZCASH_PASSWORD ?? "",
    integritySalt: process.env.JAZZCASH_INTEGRITY_SALT ?? "",
    mode: (process.env.JAZZCASH_MODE ?? "sandbox") as "sandbox" | "production",
  };
}

/**
 * JazzCash's secure hash: every pp_* parameter sorted by key, values joined
 * with "|", prefixed by the integrity salt, HMAC-SHA256 under the same salt.
 */
function secureHash(fields: Record<string, string>, salt: string): string {
  const ordered = Object.keys(fields)
    .filter((key) => key.startsWith("pp_") || key.startsWith("ppmpf_"))
    .sort()
    .map((key) => fields[key] ?? "");
  const message = [salt, ...ordered].join("&");
  return createHmac("sha256", salt).update(message).digest("hex").toUpperCase();
}

const stamp = (date: Date) =>
  date.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);

export const jazzCashProvider: PaymentProviderAdapter = {
  key: "JAZZCASH",
  methods: ["JAZZCASH"],

  isConfigured() {
    const c = config();
    return Boolean(c.merchantId && c.password && c.integritySalt);
  },

  missingConfig() {
    const c = config();
    return [
      !c.merchantId && "JAZZCASH_MERCHANT_ID",
      !c.password && "JAZZCASH_PASSWORD",
      !c.integritySalt && "JAZZCASH_INTEGRITY_SALT",
    ].filter(Boolean) as string[];
  },

  isSandbox() { return config().mode !== "production"; },

  requiredFields() {
    return [{
      name: "mobileNumber",
      label: "JazzCash mobile number",
      type: "tel",
      placeholder: "03001234567",
      hint: "You'll authorise the payment in JazzCash. We never ask for your MPIN.",
    }];
  },

  async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
    const c = config();
    if (!this.isConfigured()) throw new ProviderUnconfiguredError("JazzCash", this.missingConfig());

    const mobile = (input.fields.mobileNumber ?? "").replace(/\D/g, "");
    if (mobile.length < 10) throw new Error("Enter a valid JazzCash mobile number.");

    const now = new Date();
    const expiry = new Date(now.getTime() + 60 * 60_000);

    const fields: Record<string, string> = {
      pp_Version: "2.0",
      pp_TxnType: "MWALLET",
      pp_Language: "EN",
      pp_MerchantID: c.merchantId,
      pp_Password: c.password,
      pp_TxnRefNo: input.reference,
      // JazzCash amounts are in PKR paisa. The conversion rate is a business
      // setting, not something to guess here — see docs/PAYMENTS.md.
      pp_Amount: String(input.amount.minor),
      pp_TxnCurrency: "PKR",
      pp_TxnDateTime: stamp(now),
      pp_TxnExpiryDateTime: stamp(expiry),
      pp_BillReference: input.reference,
      pp_Description: "PriceNova participation deposit",
      pp_MobileNumber: mobile,
      pp_CNIC: input.fields.cnic ?? "",
      pp_ReturnURL: input.returnUrl,
      ppmpf_1: input.reference,
    };
    fields.pp_SecureHash = secureHash(fields, c.integritySalt);

    const response = await fetch(ENDPOINTS[c.mode], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    const raw = await response.json().catch(() => ({}));

    // 000 / 121 are JazzCash's "accepted, pending authorisation" codes.
    const code = String(raw?.pp_ResponseCode ?? "");
    const accepted = code === "000" || code === "121";

    return {
      status: accepted ? "WAITING_FOR_PAYMENT" : "FAILED",
      providerTxId: raw?.pp_RetreivalReferenceNo ?? null,
      expiresAt: expiry,
      raw,
      ...(accepted ? {} : { }),
    };
  },

  async verifyWebhook(request: WebhookRequest): Promise<PaymentUpdate | null> {
    const c = config();
    if (!c.integritySalt) return null;

    const payload = Object.fromEntries(new URLSearchParams(request.rawBody)) as Record<string, string>;
    const provided = String(payload.pp_SecureHash ?? "");
    if (!provided) return null;

    const { pp_SecureHash: _drop, ...rest } = payload;
    const expected = secureHash(rest, c.integritySalt);

    // Constant-time compare; a length mismatch is itself a rejection.
    const a = Buffer.from(provided.toUpperCase());
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    const code = String(payload.pp_ResponseCode ?? "");
    const reference = String(payload.pp_TxnRefNo ?? payload.ppmpf_1 ?? "");
    if (!reference) return null;

    return {
      reference,
      status: code === "000" ? "SUCCESS" : code === "121" ? "WAITING_FOR_PAYMENT" : "FAILED",
      providerTxId: payload.pp_RetreivalReferenceNo ?? null,
      receivedMinor: payload.pp_Amount ? BigInt(payload.pp_Amount) : null,
      failureReason: code === "000" ? null : (payload.pp_ResponseMessage ?? `Code ${code}`),
      dedupeKey: `jazzcash:${reference}:${code}:${payload.pp_RetreivalReferenceNo ?? ""}`,
      raw: payload,
    };
  },

  /**
   * Ask JazzCash whether the transaction the user typed actually exists,
   * succeeded, and was for the right amount.
   *
   * Without merchant credentials there is nothing to ask, so the answer is
   * manual review — never success.
   */
  async verifyTransaction(input: VerifyTransactionInput): Promise<VerifyResult> {
    const c = config();
    const submitted = input.submittedReference.trim();

    if (!submitted) {
      return { status: "REJECTED", message: "Enter the JazzCash transaction ID from your payment confirmation." };
    }
    if (!this.isConfigured() || !input.account?.autoVerify) {
      return {
        status: "MANUAL_REVIEW_REQUIRED",
        message:
          "Reference received. Automatic JazzCash verification is not enabled for this " +
          "account, so our team will confirm it manually. You do not need to do anything else.",
      };
    }

    const url = process.env.JAZZCASH_INQUIRY_URL || INQUIRY[c.mode];
    const fields: Record<string, string> = {
      pp_TxnRefNo: submitted,
      pp_MerchantID: c.merchantId,
      pp_Password: c.password,
      pp_Version: "2.0",
    };
    fields.pp_SecureHash = secureHash(fields, c.integritySalt);

    let raw: Record<string, unknown>;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
        signal: AbortSignal.timeout(15_000),
      });
      raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        // A provider outage must not reject a payment that may be genuine.
        return {
          status: "MANUAL_REVIEW_REQUIRED",
          message: "JazzCash did not respond to the lookup. Our team will confirm this manually.",
          raw,
        };
      }
    } catch {
      return {
        status: "MANUAL_REVIEW_REQUIRED",
        message: "JazzCash could not be reached. Your reference is saved and our team will confirm it.",
      };
    }

    const code = String(raw.pp_ResponseCode ?? "");
    const statusText = String(raw.pp_Status ?? raw.pp_ResponseMessage ?? "");

    if (code !== "000" && code !== "121") {
      return {
        status: "REJECTED",
        message: `JazzCash does not show a completed payment for that transaction ID${statusText ? ` (${statusText})` : ""}.`,
        providerTxId: submitted,
        raw,
      };
    }
    if (code === "121") {
      return {
        status: "VERIFYING",
        message: "JazzCash shows this payment as still in progress. Check again in a few minutes.",
        providerTxId: submitted,
        raw,
      };
    }

    // JazzCash reports amounts in paisa.
    const amountRaw = raw.pp_Amount;
    const received = amountRaw != null ? BigInt(String(amountRaw)) : null;

    return {
      status: "SUCCESS",
      message: "JazzCash confirmed this payment.",
      providerTxId: String(raw.pp_RetreivalReferenceNo ?? submitted),
      receivedMinor: received,
      raw,
    };
  },
};
