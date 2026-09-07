"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/guards";
import { parseMoney } from "@/lib/money";
import * as participation from "@/server/services/participation";
import * as withdrawals from "@/server/services/withdrawal";
import type { PaymentMethod, WithdrawalSource } from "@prisma/client";

export type WalletState = { error?: string; ok?: string };

function fail(error: unknown): WalletState {
  return { error: error instanceof Error ? error.message : "Something went wrong." };
}

/**
 * Submit a deposit for review.
 *
 * This records the intent and the payment reference; it does not credit
 * anything. An administrator confirms it, and only that confirmation moves
 * money. When a real provider is wired in, its callback replaces the manual
 * confirm and nothing else here changes.
 */
export async function submitDeposit(_prev: WalletState, form: FormData): Promise<WalletState> {
  try {
    const user = await requireUser();
    const planId = String(form.get("planId") ?? "");
    const method = String(form.get("method") ?? "") as PaymentMethod;
    const externalRef = String(form.get("externalRef") ?? "").trim() || null;

    if (!planId) return { error: "Choose a plan." };
    if (!method) return { error: "Choose a payment method." };

    await participation.createDeposit({ userId: user.id, planId, method, externalRef });
    revalidatePath("/wallet");
    return { ok: "Deposit submitted. It activates as soon as our team confirms the payment." };
  } catch (error) { return fail(error); }
}

export async function requestWithdrawal(_prev: WalletState, form: FormData): Promise<WalletState> {
  try {
    const user = await requireUser();
    const amount = parseMoney(String(form.get("amount") ?? "0"));
    const sourceKind = String(form.get("sourceKind") ?? "COMMISSION") as WithdrawalSource;
    const method = String(form.get("method") ?? "") as PaymentMethod;
    const destination = String(form.get("destination") ?? "").trim();

    if (!destination) return { error: "Where should we send it?" };

    await withdrawals.requestWithdrawal({ userId: user.id, amount, sourceKind, method, destination });
    revalidatePath("/wallet");
    return { ok: "Withdrawal requested. Your funds are reserved while our team reviews it." };
  } catch (error) { return fail(error); }
}
