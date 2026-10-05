/**
 * Manual USDT (BEP20) — the parts that need no database.
 */
import { describe, it, expect } from "vitest";
import { normaliseBep20TxHash, manualUsdtBep20Provider } from "@/server/payments/providers/manual-usdt";
import { isBep20, isEvmAddress } from "@/server/payments/networks";
import { displayStatus, explorerUrl } from "@/lib/payment-status";

const HASH = "0x" + "ab".repeat(32);

describe("BEP20 transaction ID normalisation", () => {
  it("canonicalises case, whitespace and a missing 0x to one spelling", () => {
    for (const raw of [HASH, HASH.toUpperCase().replace("0X", "0x"), `  ${HASH} `, "ab".repeat(32), `0x ${"AB".repeat(32)}`]) {
      expect(normaliseBep20TxHash(raw)).toEqual({ ok: true, value: HASH });
    }
  });

  it("takes the hash off a pasted BscScan link", () => {
    expect(normaliseBep20TxHash(`https://bscscan.com/tx/${HASH}`)).toEqual({ ok: true, value: HASH });
  });

  it("refuses anything that is not a 32-byte hash", () => {
    for (const raw of ["", "0x123", "hello", "0x" + "zz".repeat(32), "0x" + "ab".repeat(33)]) {
      expect(normaliseBep20TxHash(raw).ok).toBe(false);
    }
  });
});

describe("manual USDT provider", () => {
  it("never reports success — a pasted hash is a claim, not proof", async () => {
    const result = await manualUsdtBep20Provider.verifyTransaction({
      reference: "PN-X", submittedReference: HASH, submittedMinor: 2500n, expectedMinor: 2500n,
      currency: "USD", method: "MANUAL_USDT_BEP20", account: null,
    });
    expect(result.status).toBe("MANUAL_REVIEW_REQUIRED");
    expect(result.message).toBe("Payment submitted successfully. Your payment is waiting for verification.");
    expect(result.txHash).toBe(HASH);
  });

  it("is always available and needs no credentials", () => {
    expect(manualUsdtBep20Provider.isConfigured()).toBe(true);
    expect(manualUsdtBep20Provider.missingConfig()).toEqual([]);
  });
});

describe("network helpers", () => {
  it("recognises the ways admins write BEP20", () => {
    for (const n of ["BEP20", "bep-20", "BSC", "BNB Smart Chain", "USDT BEP20"]) expect(isBep20(n)).toBe(true);
    for (const n of ["TRC20", "ERC20", "Bitcoin", "", null]) expect(isBep20(n)).toBe(false);
  });

  it("validates EVM receiving addresses", () => {
    expect(isEvmAddress("0x" + "a1".repeat(20))).toBe(true);
    expect(isEvmAddress("0x" + "a1".repeat(19))).toBe(false);
    expect(isEvmAddress("TXyz" + "a".repeat(30))).toBe(false);
  });
});

describe("display status", () => {
  it("collapses the provider lifecycle into the four statuses people use", () => {
    expect(displayStatus({ status: "MANUAL_REVIEW_REQUIRED", provider: "MANUAL", userSubmittedReference: HASH })).toBe("PENDING");
    expect(displayStatus({ status: "WAITING_FOR_PAYMENT", provider: "MANUAL", userSubmittedReference: null })).toBe("AWAITING_TXID");
    expect(displayStatus({ status: "SUCCESS" })).toBe("APPROVED");
    expect(displayStatus({ status: "REJECTED" })).toBe("REJECTED");
    expect(displayStatus({ status: "CANCELLED" })).toBe("CANCELLED");
  });

  it("links BEP20 hashes to BscScan", () => {
    expect(explorerUrl("BEP20", HASH)).toBe(`https://bscscan.com/tx/${HASH}`);
    expect(explorerUrl(null, HASH)).toBeNull();
  });
});
