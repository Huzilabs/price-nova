import "server-only";
import type { PaymentAccountType, PaymentMethod } from "@prisma/client";
import { db } from "@/lib/db";

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
      const n = (network ?? "").toUpperCase();
      if (n.includes("TRC")) return "USDT_TRC20";
      if (n.includes("ERC")) return "USDT_ERC20";
      if (n.includes("BEP")) return "USDT_BEP20";
      if (n.includes("BTC") || n.includes("BITCOIN")) return "BTC";
      // An unrecognised network is treated as hand-verified rather than
      // silently mapped to a chain we do not monitor.
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
    autoVerify: account.autoVerify,
    isCrypto,
  };
}

/** Enabled accounts that are actually usable — a blank number is not. */
export async function publicAccounts(): Promise<PublicAccount[]> {
  const accounts = await listEnabledAccounts();
  return accounts.map(toPublicAccount).filter((a) => a.payTo.trim().length > 0);
}
