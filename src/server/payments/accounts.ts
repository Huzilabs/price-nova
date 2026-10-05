import "server-only";
import type { PaymentAccountType, PaymentMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { isBep20 } from "./networks";

export { isBep20, isEvmAddress } from "./networks";

/**
 * Receiving accounts.
 *
 * The number or address a participant pays into comes from here and nowhere
 * else — never a constant, never the frontend. Changing where money goes is an
 * admin action with an audit trail.
 */

/** Which payment method a given account type produces at checkout. */
export function methodForAccount(
  type: PaymentAccountType, network?: string | null,
): PaymentMethod {
  switch (type) {
    case "EASYPAISA": return "EASYPAISA";
    case "JAZZCASH": return "JAZZCASH";
    case "BANK_TRANSFER": return "MANUAL_BANK";
    case "CRYPTO": {
      // An address an admin publishes is, by definition, one no gateway is
      // watching — gateways assign their own address per payment. So every
      // configured crypto account is a manual rail, verified by a person.
      // The gateway methods (USDT_BEP20, USDT_TRC20 …) are reserved for a
      // hosted checkout such as Cryptomus, which never shows this address.
      if (isBep20(network)) return "MANUAL_USDT_BEP20";
      return "MANUAL_CRYPTO";
    }
  }
}

export async function listEnabledAccounts() {
  return db.paymentAccount.findMany({
    where: { enabled: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function listAllAccounts() {
  return db.paymentAccount.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function getAccount(id: string) {
  return db.paymentAccount.findUnique({ where: { id } });
}

/**
 * What the checkout shows for one account.
 *
 * Deliberately shaped so nothing secret can leak: it is built field by field
 * from the columns that are safe to display, rather than spreading the row.
 */
export type PublicAccount = {
  id: string;
  type: PaymentAccountType;
  label: string;
  method: PaymentMethod;
  /** The thing the user copies: a number, an IBAN or an address. */
  payTo: string;
  payToLabel: string;
  accountName: string | null;
  bankName: string | null;
  iban: string | null;
  network: string | null;
  instructions: string | null;
  /** Admin-uploaded QR (data: URI). Null means checkout generates one from payTo. */
  qrCodeImage: string | null;
  /** True for USDT on BNB Smart Chain — drives the network warning at checkout. */
  isBep20: boolean;
  /** Whether a provider API will be asked, or a person will check. */
  autoVerify: boolean;
  isCrypto: boolean;
};

export function toPublicAccount(account: {
  id: string; type: PaymentAccountType; label: string;
  accountName: string | null; accountNumber: string | null;
  bankName: string | null; iban: string | null;
  network: string | null; walletAddress: string | null;
  instructions: string | null; autoVerify: boolean;
  qrCodeImage?: string | null;
}): PublicAccount {
  const isCrypto = account.type === "CRYPTO";
  return {
    id: account.id,
    type: account.type,
    label: account.label,
    method: methodForAccount(account.type, account.network),
    payTo: (isCrypto ? account.walletAddress : account.accountNumber) ?? "",
    payToLabel: isCrypto
      ? "Wallet address"
      : account.type === "BANK_TRANSFER" ? "Account number" : "Mobile number",
    accountName: account.accountName,
    bankName: account.bankName,
    iban: account.iban,
    network: account.network,
    instructions: account.instructions,
    qrCodeImage: isCrypto ? (account.qrCodeImage ?? null) : null,
    isBep20: isCrypto && isBep20(account.network),
    // Manual rails are never auto-verified, whatever the flag says.
    autoVerify: isCrypto ? false : account.autoVerify,
    isCrypto,
  };
}

/** Enabled accounts that are actually usable — a blank number is not. */
export async function publicAccounts(): Promise<PublicAccount[]> {
  const accounts = await listEnabledAccounts();
  return accounts.map(toPublicAccount).filter((a) => a.payTo.trim().length > 0);
}
