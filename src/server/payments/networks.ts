/**
 * Pure helpers for crypto networks. No database, no server-only import, so
 * they are unit-testable and safe to share.
 */

/** BEP20 is written many ways: "BEP20", "BEP-20", "BSC", "BNB Smart Chain". */
export function isBep20(network?: string | null): boolean {
  const n = (network ?? "").toUpperCase().replace(/[\s_-]/g, "");
  return n.includes("BEP20") || n === "BSC" || n.includes("BNBSMARTCHAIN") || n.includes("BINANCESMARTCHAIN");
}

/** EVM address: 0x + 20 bytes of hex. Checked on save so a typo cannot go live. */
export function isEvmAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}
