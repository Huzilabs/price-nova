"use server";

import { revalidatePath } from "next/cache";
import type { PaymentAccountType } from "@prisma/client";
import { requireAdmin, primaryRole } from "@/lib/guards";
import { db } from "@/lib/db";
import * as audit from "@/server/services/audit";

export type AccountState = { error?: string; ok?: string };

function fail(error: unknown): AccountState {
  return { error: error instanceof Error ? error.message : "Something went wrong." };
}

const TYPES: PaymentAccountType[] = ["EASYPAISA", "JAZZCASH", "BANK_TRANSFER", "CRYPTO"];

/**
 * Create or update a receiving account.
 *
 * Every change is audited with the before/after, because this table decides
 * where participants send money — a silent edit here is the highest-value
 * attack in the product.
 */
export async function savePaymentAccount(
  _prev: AccountState, form: FormData,
): Promise<AccountState> {
  try {
    const admin = await requireAdmin();
    const role = primaryRole(admin);

    const id = String(form.get("id") ?? "").trim();
    const type = String(form.get("type") ?? "") as PaymentAccountType;
    if (!TYPES.includes(type)) return { error: "Choose a valid account type." };

    const label = String(form.get("label") ?? "").trim();
    if (!label) return { error: "Give the method a label participants will recognise." };

    const data = {
      type,
      label,
      enabled: form.get("enabled") === "on",
      autoVerify: form.get("autoVerify") === "on",
      sortOrder: Number(form.get("sortOrder") ?? 0) || 0,
      accountName: String(form.get("accountName") ?? "").trim() || null,
      accountNumber: String(form.get("accountNumber") ?? "").trim() || null,
      bankName: String(form.get("bankName") ?? "").trim() || null,
      iban: String(form.get("iban") ?? "").trim() || null,
      network: String(form.get("network") ?? "").trim() || null,
      walletAddress: String(form.get("walletAddress") ?? "").trim() || null,
      instructions: String(form.get("instructions") ?? "").trim() || null,
    };

    // An enabled method with nowhere to send money would show participants a
    // blank field, so refuse it here rather than filtering it out silently.
    const destination = type === "CRYPTO" ? data.walletAddress : data.accountNumber;
    if (data.enabled && !destination) {
      return {
        error: type === "CRYPTO"
          ? "Add the wallet address before enabling this method."
          : "Add the account number before enabling this method.",
      };
    }
    if (data.enabled && type === "CRYPTO" && !data.network) {
      return { error: "Set the network (e.g. TRC20, ERC20, Bitcoin) before enabling." };
    }

    if (id) {
      const before = await db.paymentAccount.findUniqueOrThrow({ where: { id } });
      const account = await db.paymentAccount.update({ where: { id }, data });
      await audit.record({
        actorId: admin.id, actorRole: role,
        action: "payment_account.update", entityType: "PaymentAccount", entityId: id,
        previousState: {
          label: before.label, enabled: before.enabled, autoVerify: before.autoVerify,
          accountNumber: before.accountNumber, walletAddress: before.walletAddress,
          network: before.network,
        },
        newState: {
          label: account.label, enabled: account.enabled, autoVerify: account.autoVerify,
          accountNumber: account.accountNumber, walletAddress: account.walletAddress,
          network: account.network,
        },
      });
      revalidatePath("/admin/payment-accounts");
      revalidatePath("/join");
      return { ok: `${account.label} updated.` };
    }

    const account = await db.paymentAccount.create({ data });
    await audit.record({
      actorId: admin.id, actorRole: role,
      action: "payment_account.create", entityType: "PaymentAccount", entityId: account.id,
      newState: { label: account.label, type: account.type, enabled: account.enabled },
    });
    revalidatePath("/admin/payment-accounts");
    revalidatePath("/join");
    return { ok: `${account.label} created.` };
  } catch (error) { return fail(error); }
}

export async function togglePaymentAccount(
  _prev: AccountState, form: FormData,
): Promise<AccountState> {
  try {
    const admin = await requireAdmin();
    const role = primaryRole(admin);
    const id = String(form.get("id") ?? "");

    const before = await db.paymentAccount.findUniqueOrThrow({ where: { id } });
    const destination = before.type === "CRYPTO" ? before.walletAddress : before.accountNumber;
    if (!before.enabled && !destination) {
      return { error: "Add the receiving details before enabling this method." };
    }

    const account = await db.paymentAccount.update({
      where: { id }, data: { enabled: !before.enabled },
    });
    await audit.record({
      actorId: admin.id, actorRole: role,
      action: account.enabled ? "payment_account.enable" : "payment_account.disable",
      entityType: "PaymentAccount", entityId: id,
      previousState: { enabled: before.enabled },
      newState: { enabled: account.enabled },
    });
    revalidatePath("/admin/payment-accounts");
    revalidatePath("/join");
    return { ok: `${account.label} ${account.enabled ? "enabled" : "disabled"}.` };
  } catch (error) { return fail(error); }
}
