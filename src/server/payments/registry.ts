import type { PaymentMethod, PaymentProvider } from "@prisma/client";
import type { PaymentProviderAdapter } from "./types";
import { jazzCashProvider } from "./providers/jazzcash";
import { easypaisaProvider } from "./providers/easypaisa";
import { cardProvider } from "./providers/card";
import { cryptoProvider } from "./providers/crypto";
import { manualProvider } from "./providers/manual";
import { bankTransferProvider } from "./providers/bank";

/**
 * The provider registry.
 *
 * Adding a rail is: write an adapter, add it here, add its env vars to
 * .env.example and docs/PAYMENTS.md. Nothing else in the app changes.
 */
const ADAPTERS: readonly PaymentProviderAdapter[] = [
  jazzCashProvider, easypaisaProvider, bankTransferProvider,
  cardProvider, cryptoProvider, manualProvider,
];

export function adapterFor(method: PaymentMethod): PaymentProviderAdapter {
  const adapter = ADAPTERS.find((a) => a.methods.includes(method));
  if (!adapter) throw new Error(`No payment provider handles ${method}`);
  return adapter;
}

export function adapterByKey(key: PaymentProvider): PaymentProviderAdapter | null {
  return ADAPTERS.find((a) => a.key === key) ?? null;
}

export function allAdapters(): readonly PaymentProviderAdapter[] { return ADAPTERS; }

/** Presentation metadata. The UI renders from this rather than a hardcoded list. */
export type MethodDescriptor = {
  method: PaymentMethod;
  provider: PaymentProvider;
  label: string;
  sublabel: string;
  group: "wallet" | "card" | "crypto" | "manual";
  automated: boolean;
  available: boolean;
  sandbox: boolean;
  /** Populated only for admins — never sent to a participant. */
  missingConfig: string[];
};

const PRESENTATION: Record<PaymentMethod, Omit<MethodDescriptor, "method" | "provider" | "available" | "sandbox" | "missingConfig">> = {
  JAZZCASH:     { label: "JazzCash",  sublabel: "Mobile wallet",     group: "wallet", automated: true },
  EASYPAISA:    { label: "Easypaisa", sublabel: "Mobile wallet",     group: "wallet", automated: true },
  CARD:         { label: "Card",      sublabel: "Visa / Mastercard", group: "card",   automated: true },
  BTC:          { label: "Bitcoin",   sublabel: "BTC",               group: "crypto", automated: true },
  USDT_TRC20:   { label: "USDT",      sublabel: "TRC20",             group: "crypto", automated: true },
  USDT_ERC20:   { label: "USDT",      sublabel: "ERC20",             group: "crypto", automated: true },
  USDT_BEP20:   { label: "USDT",      sublabel: "BEP20",             group: "crypto", automated: true },
  MANUAL_BANK:  { label: "Bank transfer",   sublabel: "Confirmed by our team", group: "manual", automated: false },
  MANUAL_CRYPTO:{ label: "Manual crypto",   sublabel: "You send, we verify on-chain", group: "manual", automated: false },
};

/**
 * The methods the UI should offer.
 *
 * An unconfigured automated provider is reported as unavailable rather than
 * hidden, so a participant sees that Bitcoin exists and is temporarily off —
 * and so an operator can see at a glance what still needs credentials.
 */
export function describeMethods(enabled: readonly PaymentMethod[]): MethodDescriptor[] {
  return enabled.map((method) => {
    const adapter = adapterFor(method);
    const presentation = PRESENTATION[method];
    return {
      method,
      provider: adapter.key,
      ...presentation,
      available: adapter.isConfigured(),
      sandbox: adapter.isConfigured() && adapter.isSandbox(),
      missingConfig: adapter.missingConfig(),
    };
  });
}
