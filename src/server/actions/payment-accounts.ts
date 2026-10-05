"use server";

import { revalidatePath } from "next/cache";
import type { PaymentAccountType } from "@prisma/client";
import { requireAdmin, primaryRole } from "@/lib/guards";
import { db } from "@/lib/db";
import * as audit from "@/server/services/audit";
import { isBep20, isEvmAddress } from "@/server/payments/accounts";

export type AccountState = { error?: string; ok?: string };

function fail(error: unknown): AccountState {
  return { error: error instanceof Error ? error.message : "Something went wrong." };
}

const TYPES: PaymentAccountType[] = ["EASYPAISA", "JAZZCASH", "BANK_TRANSFER", "CRYPTO"];

/** Kept small: it is stored in the row and sent with every checkout render. */
const QR_MAX_BYTES = 300 * 1024;

/**
 * Read an uploaded QR image into a data: URI.
 *
 * The type is decided by the file's magic bytes, not its name or the browser's
 * claimed MIME type. SVG is refused outright — it can carry script, and this
 * image is rendered on every participant's checkout.
 */
async function readQrUpload(file: File): Promise<string> {
  if (file.size > QR_MAX_BYTES) throw new Error("The QR image must be under 300 KB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const starts = (sig: number[], at = 0) => sig.every((b, i) => bytes[at + i] === b);
  const mime =
    starts([0x89, 0x50, 0x4e, 0x47]) ? "image/png"
    : starts([0xff, 0xd8, 0xff]) ? "image/jpeg"
    : starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8) ? "image/webp"
    : null;
  if (!mime) throw new Error("Upload the QR code as a PNG, JPEG or WebP image.");
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

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
      return { error: "Set the network (e.g. BEP20, TRC20, ERC20) before enabling." };
    }
    // A mistyped BEP20 address sends participants' money somewhere nobody
    // controls. Refuse anything that is not a well-formed EVM address.
    if (type === "CRYPTO" && isBep20(data.network) && data.walletAddress && !isEvmAddress(data.walletAddress)) {
      return { error: "A BEP20 wallet address is 0x followed by 40 hex characters. Check it and try again." };
    }

    // QR: a new upload replaces, "remove" clears, otherwise leave it alone.
    let qrCodeImage: string | null | undefined;
    const upload = form.get("qrCodeImage");
    if (type !== "CRYPTO" || form.get("removeQr") === "on") qrCodeImage = null;
    else if (upload instanceof File && upload.size > 0) qrCodeImage = await readQrUpload(upload);

    if (id) {
      const before = await db.paymentAccount.findUniqueOrThrow({ where: { id } });
      const account = await db.paymentAccount.update({
        where: { id },
        data: { ...data, ...(qrCodeImage !== undefined ? { qrCodeImage } : {}) },
      });
      await audit.record({
        actorId: admin.id, actorRole: role,
        action: "payment_account.update", entityType: "PaymentAccount", entityId: id,
        previousState: {
          label: before.label, enabled: before.enabled, autoVerify: before.autoVerify,
          accountNumber: before.accountNumber, walletAddress: before.walletAddress,
          network: before.network, hasQr: Boolean(before.qrCodeImage),
        },
        newState: {
          label: account.label, enabled: account.enabled, autoVerify: account.autoVerify,
          accountNumber: account.accountNumber, walletAddress: account.walletAddress,
          network: account.network, hasQr: Boolean(account.qrCodeImage),
          qrReplaced: qrCodeImage !== undefined,
        },
      });
      revalidatePath("/admin/payment-accounts");
      revalidatePath("/join");
      revalidatePath("/wallet");
      return { ok: `${account.label} updated.` };
    }

    const account = await db.paymentAccount.create({ data: { ...data, qrCodeImage: qrCodeImage ?? null } });
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
