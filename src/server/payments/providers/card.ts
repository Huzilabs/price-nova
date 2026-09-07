import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  PaymentProviderAdapter, CreateChargeInput, ChargeResult, PaymentUpdate, WebhookRequest,
  VerifyResult,
} from "../types";
import { ProviderUnconfiguredError } from "../types";

/**
 * Card payments via a hosted gateway (Stripe-compatible Checkout).
 *
 * PriceNova never renders a card field, never receives a PAN, CVV or PIN, and
 * therefore never stores one. The user is sent to the gateway's own page and
 * comes back with nothing but an order reference. That is the whole reason to
 * use hosted checkout: it keeps this codebase out of PCI scope entirely.
 */
function config() {
  return {
    secretKey: process.env.CARD_PROVIDER_SECRET_KEY ?? "",
    webhookSecret: process.env.CARD_PROVIDER_WEBHOOK_SECRET ?? "",
    apiBase: process.env.CARD_PROVIDER_API_BASE ?? "https://api.stripe.com/v1",
    mode: (process.env.CARD_PROVIDER_MODE ?? "sandbox") as "sandbox" | "production",
  };
}

export const cardProvider: PaymentProviderAdapter = {
  key: "CARD_GATEWAY",
  methods: ["CARD"],

  isConfigured() {
    const c = config();
    return Boolean(c.secretKey && c.webhookSecret);
  },

  missingConfig() {
    const c = config();
    return [
      !c.secretKey && "CARD_PROVIDER_SECRET_KEY",
      !c.webhookSecret && "CARD_PROVIDER_WEBHOOK_SECRET",
    ].filter(Boolean) as string[];
  },

  isSandbox() { return config().mode !== "production"; },

  /** Nothing. The gateway collects everything sensitive on its own page. */
  requiredFields() { return []; },

  async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
    const c = config();
    if (!this.isConfigured()) throw new ProviderUnconfiguredError("Card", this.missingConfig());

    const body = new URLSearchParams({
      mode: "payment",
      client_reference_id: input.reference,
      success_url: `${input.returnUrl}?status=returned`,
      cancel_url: `${input.returnUrl}?status=cancelled`,
      customer_email: input.user.email,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": input.amount.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": String(input.amount.minor),
      "line_items[0][price_data][product_data][name]": "PriceNova participation deposit",
      "metadata[reference]": input.reference,
    });

    const response = await fetch(`${c.apiBase}/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${c.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const raw = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { status: "FAILED", raw, providerTxId: null };
    }

    return {
      status: "WAITING_FOR_PAYMENT",
      providerTxId: raw?.id ?? null,
      checkoutUrl: raw?.url ?? null,
      expiresAt: raw?.expires_at ? new Date(raw.expires_at * 1000) : null,
      raw,
    };
  },

  async verifyWebhook(request: WebhookRequest): Promise<PaymentUpdate | null> {
    const c = config();
    if (!c.webhookSecret) return null;

    // Stripe-style: t=<ts>,v1=<hmac of "<ts>.<rawBody>">.
    const header = request.headers["stripe-signature"] ?? request.headers["x-signature"] ?? "";
    const parts = Object.fromEntries(
      header.split(",").map((p) => p.split("=").map((s) => s.trim()) as [string, string]),
    );
    const timestamp = parts.t;
    const provided = parts.v1;
    if (!timestamp || !provided) return null;

    // Reject stale signatures so a captured webhook cannot be replayed later.
    const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(ageSeconds) || ageSeconds > 300) return null;

    const expected = createHmac("sha256", c.webhookSecret)
      .update(`${timestamp}.${request.rawBody}`).digest("hex");
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    const event = JSON.parse(request.rawBody) as {
      id?: string;
      type?: string;
      data?: { object?: Record<string, unknown> };
    };
    const object = event.data?.object ?? {};
    const reference = String(
      (object.client_reference_id as string) ??
      ((object.metadata as Record<string, string> | undefined)?.reference) ?? "",
    );
    if (!reference) return null;

    const paid = event.type === "checkout.session.completed" &&
      String(object.payment_status ?? "") === "paid";
    const failed = event.type === "checkout.session.expired" ||
      event.type === "checkout.session.async_payment_failed";

    return {
      reference,
      status: paid ? "SUCCESS" : failed ? (event.type?.includes("expired") ? "EXPIRED" : "FAILED") : "WAITING_FOR_PAYMENT",
      providerTxId: String(object.id ?? "") || null,
      receivedMinor: object.amount_total != null ? BigInt(Number(object.amount_total)) : null,
      failureReason: paid ? null : (event.type ?? null),
      dedupeKey: `card:${event.id ?? `${reference}:${event.type}`}`,
      raw: event,
    };
  },

  /**
   * Cards do not use the submit-a-reference flow — the gateway's webhook is
   * the authority and arrives on its own. If a user lands here it means they
   * pressed Verify on a hosted checkout, so the honest answer is "we are
   * waiting on the gateway", not a lookup by something they typed.
   */
  async verifyTransaction(): Promise<VerifyResult> {
    return {
      status: "VERIFYING",
      message: "Card payments confirm automatically once the gateway reports them. Nothing to submit.",
    };
  },
};
