import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentMethod } from "@prisma/client";
import type {
  PaymentProviderAdapter, CreateChargeInput, ChargeResult, PaymentUpdate, WebhookRequest,
  VerifyTransactionInput, VerifyResult,
} from "../types";
import { ProviderUnconfiguredError } from "../types";

/**
 * Crypto: BTC, USDT-TRC20, USDT-ERC20.
 *
 * Deliberately a *gateway* integration rather than self-custody. Watching three
 * chains, deriving addresses and holding keys is a security programme, not a
 * feature — and the brief is explicit that private keys must never be in this
 * codebase. So PriceNova holds no keys at all: the gateway assigns a receiving
 * address per payment, watches the chain, and calls our webhook with
 * confirmation counts. Payouts settle to the merchant wallet configured on the
 * gateway side, where the keys live.
 *
 * The adapter targets a NOWPayments-compatible API, which several processors
 * (NOWPayments, BTCPay's Greenfield with a shim) implement. Swapping processor
 * means editing this file only.
 *
 * Nothing here ever accepts a user-supplied transaction hash. Amount, asset,
 * network, address and confirmation count all come from the gateway, and the
 * service layer re-checks the amount before crediting.
 */
const ASSETS: Record<string, { asset: string; network: string; payCurrency: string; confirmations: number }> = {
  BTC:         { asset: "BTC",  network: "Bitcoin", payCurrency: "btc",        confirmations: 2 },
  USDT_TRC20:  { asset: "USDT", network: "TRC20",   payCurrency: "usdttrc20",  confirmations: 12 },
  USDT_ERC20:  { asset: "USDT", network: "ERC20",   payCurrency: "usdterc20",  confirmations: 12 },
  USDT_BEP20:  { asset: "USDT", network: "BEP20",   payCurrency: "usdtbsc",    confirmations: 12 },
};

function config() {
  return {
    apiKey: process.env.CRYPTO_PROVIDER_API_KEY ?? "",
    ipnSecret: process.env.CRYPTO_PROVIDER_IPN_SECRET ?? "",
    apiBase: process.env.CRYPTO_PROVIDER_API_BASE ?? "https://api.nowpayments.io/v1",
    mode: (process.env.CRYPTO_PROVIDER_MODE ?? "sandbox") as "sandbox" | "production",
  };
}

/** Confirmation targets are operator policy, so they are overridable per asset. */
function requiredConfirmations(method: PaymentMethod): number {
  const key = `CRYPTO_CONFIRMATIONS_${method}`;
  const override = Number(process.env[key]);
  if (Number.isFinite(override) && override > 0) return Math.floor(override);
  return ASSETS[method]?.confirmations ?? 3;
}

/**
 * Sort object keys recursively, then HMAC-SHA512 — the IPN signature scheme
 * NOWPayments uses. Key order matters, so it cannot be skipped.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.keys(value as Record<string, unknown>).sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`);
  return `{${entries.join(",")}}`;
}

const STATUS_MAP: Record<string, PaymentUpdate["status"]> = {
  waiting: "WAITING_FOR_PAYMENT",
  confirming: "CONFIRMING",
  confirmed: "CONFIRMING",
  sending: "CONFIRMING",
  partially_paid: "UNDERPAID",
  finished: "SUCCESS",
  failed: "FAILED",
  refunded: "REFUNDED",
  expired: "EXPIRED",
};

export const cryptoProvider: PaymentProviderAdapter = {
  key: "CRYPTO_GATEWAY",
  methods: ["BTC", "USDT_TRC20", "USDT_ERC20", "USDT_BEP20"],

  isConfigured() {
    const c = config();
    return Boolean(c.apiKey && c.ipnSecret);
  },

  missingConfig() {
    const c = config();
    return [
      !c.apiKey && "CRYPTO_PROVIDER_API_KEY",
      !c.ipnSecret && "CRYPTO_PROVIDER_IPN_SECRET",
    ].filter(Boolean) as string[];
  },

  isSandbox() { return config().mode !== "production"; },

  /** Nothing to collect: the address is generated for the user. */
  requiredFields() { return []; },

  async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
    const c = config();
    if (!this.isConfigured()) throw new ProviderUnconfiguredError("Crypto", this.missingConfig());

    const spec = ASSETS[input.method];
    if (!spec) throw new Error(`Unsupported crypto method: ${input.method}`);

    const response = await fetch(`${c.apiBase}/payment`, {
      method: "POST",
      headers: { "x-api-key": c.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        price_amount: Number(input.amount.minor) / 100,
        price_currency: input.amount.currency.toLowerCase(),
        pay_currency: spec.payCurrency,
        order_id: input.reference,
        order_description: "PriceNova participation deposit",
        ipn_callback_url: input.webhookUrl,
        is_fixed_rate: true,
      }),
    });
    const raw = await response.json().catch(() => ({}));

    if (!response.ok || !raw?.pay_address) {
      return {
        status: "FAILED",
        raw,
        providerTxId: raw?.payment_id ? String(raw.payment_id) : null,
      };
    }

    return {
      status: "WAITING_FOR_PAYMENT",
      providerTxId: String(raw.payment_id),
      crypto: {
        asset: spec.asset,
        network: spec.network,
        address: String(raw.pay_address),
        // Decimal string straight from the gateway — never parsed into a float.
        amount: String(raw.pay_amount),
        requiredConfirmations: requiredConfirmations(input.method),
      },
      expiresAt: raw.valid_until ? new Date(raw.valid_until) : new Date(Date.now() + 30 * 60_000),
      raw,
    };
  },

  async verifyWebhook(request: WebhookRequest): Promise<PaymentUpdate | null> {
    const c = config();
    if (!c.ipnSecret) return null;

    const provided = request.headers["x-nowpayments-sig"] ?? request.headers["x-ipn-signature"] ?? "";
    if (!provided) return null;

    let payload: Record<string, unknown>;
    try { payload = JSON.parse(request.rawBody); } catch { return null; }

    const expected = createHmac("sha512", c.ipnSecret)
      .update(stableStringify(payload)).digest("hex");
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    const reference = String(payload.order_id ?? "");
    if (!reference) return null;

    const providerStatus = String(payload.payment_status ?? "").toLowerCase();
    const status = STATUS_MAP[providerStatus] ?? "WAITING_FOR_PAYMENT";

    return {
      reference,
      status,
      providerTxId: payload.payment_id != null ? String(payload.payment_id) : null,
      txHash: (payload.payin_hash as string) ?? (payload.outcome_hash as string) ?? null,
      // The gateway reports price in fiat; that is what we credit against.
      receivedMinor: payload.actually_paid_at_fiat != null
        ? BigInt(Math.round(Number(payload.actually_paid_at_fiat) * 100))
        : null,
      receivedCrypto: payload.actually_paid != null ? String(payload.actually_paid) : null,
      failureReason: status === "SUCCESS" ? null : (providerStatus || null),
      dedupeKey: `crypto:${payload.payment_id ?? reference}:${providerStatus}:${payload.actually_paid ?? ""}`,
      raw: payload,
    };
  },

  async poll(payment) {
    const c = config();
    if (!this.isConfigured() || !payment.providerTxId) return null;

    const response = await fetch(`${c.apiBase}/payment/${payment.providerTxId}`, {
      headers: { "x-api-key": c.apiKey },
    });
    if (!response.ok) return null;
    const raw = await response.json().catch(() => null);
    if (!raw) return null;

    const providerStatus = String(raw.payment_status ?? "").toLowerCase();
    return {
      reference: String(raw.order_id ?? payment.reference),
      status: STATUS_MAP[providerStatus] ?? "WAITING_FOR_PAYMENT",
      providerTxId: String(raw.payment_id ?? payment.providerTxId),
      txHash: raw.payin_hash ?? null,
      receivedMinor: raw.actually_paid_at_fiat != null
        ? BigInt(Math.round(Number(raw.actually_paid_at_fiat) * 100)) : null,
      receivedCrypto: raw.actually_paid != null ? String(raw.actually_paid) : null,
      dedupeKey: `crypto-poll:${raw.payment_id}:${providerStatus}:${raw.actually_paid ?? ""}`,
      raw,
    };
  },

  /**
   * Verification for automated crypto asks the GATEWAY about the payment
   * session we opened — it does not look up whatever hash the user pasted.
   *
   * That distinction is the whole security property: the gateway knows which
   * address it issued to this payment, what asset and network it expects, how
   * much arrived and how many confirmations it has. A user-supplied hash
   * proves none of those things, and accepting one would let anyone paste a
   * stranger's transaction.
   */
  async verifyTransaction(input: VerifyTransactionInput): Promise<VerifyResult> {
    const c = config();

    if (!this.isConfigured()) {
      return {
        status: "MANUAL_REVIEW_REQUIRED",
        message:
          "Automatic crypto verification is not configured. Our team will confirm " +
          "this against the receiving address on-chain.",
      };
    }
    if (!input.account?.walletAddress && !input.reference) {
      return { status: "MANUAL_REVIEW_REQUIRED", message: "No payment session to verify against." };
    }

    // The gateway session id was stored when the charge was created; the
    // service passes the payment reference, which the gateway echoes as order_id.
    let raw: Record<string, unknown>;
    try {
      const response = await fetch(
        `${c.apiBase}/payment/?orderId=${encodeURIComponent(input.reference)}`,
        { headers: { "x-api-key": c.apiKey }, signal: AbortSignal.timeout(15_000) },
      );
      raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        return {
          status: "VERIFYING",
          message: "The payment gateway did not respond. Check again shortly.",
          raw,
        };
      }
    } catch {
      return { status: "VERIFYING", message: "The payment gateway could not be reached. Check again shortly." };
    }

    const list = Array.isArray(raw.data) ? (raw.data as Array<Record<string, unknown>>) : [];
    const record = list[0] ?? raw;
    const providerStatus = String(record.payment_status ?? "").toLowerCase();

    if (!providerStatus || providerStatus === "waiting") {
      return {
        status: "VERIFYING",
        message: "No incoming transaction seen at the address yet. This can take a few minutes after sending.",
        raw: record,
      };
    }

    const mapped = STATUS_MAP[providerStatus];
    if (mapped === "SUCCESS") {
      return {
        status: "SUCCESS",
        message: "The network confirmed this payment.",
        providerTxId: record.payment_id != null ? String(record.payment_id) : null,
        txHash: (record.payin_hash as string) ?? null,
        receivedMinor: record.actually_paid_at_fiat != null
          ? BigInt(Math.round(Number(record.actually_paid_at_fiat) * 100)) : null,
        receivedCrypto: record.actually_paid != null ? String(record.actually_paid) : null,
        raw: record,
      };
    }
    if (mapped === "UNDERPAID") {
      return {
        status: "UNDERPAID",
        message: "Less arrived than the plan requires. Our team will be in touch about the difference.",
        txHash: (record.payin_hash as string) ?? null,
        receivedCrypto: record.actually_paid != null ? String(record.actually_paid) : null,
        raw: record,
      };
    }
    if (mapped === "CONFIRMING") {
      return {
        status: "CONFIRMING",
        message: "Payment detected. Waiting for network confirmations.",
        providerTxId: record.payment_id != null ? String(record.payment_id) : null,
        txHash: (record.payin_hash as string) ?? null,
        requiredConfirmations: requiredConfirmations(input.method),
        raw: record,
      };
    }
    if (mapped === "EXPIRED" || mapped === "FAILED") {
      return {
        status: "FAILED",
        message: "The payment window closed before funds arrived.",
        raw: record,
      };
    }

    return { status: "VERIFYING", message: "Still waiting on the network.", raw: record };
  },
};

export { requiredConfirmations, ASSETS };
