import { describe, it, expect } from "vitest";
import { parseMoney, formatMoney, dollars, splitMoney } from "@/lib/money";

describe("money", () => {
  it("parses decimal input into minor units", () => {
    expect(parseMoney("10")).toBe(1000n);
    expect(parseMoney("10.50")).toBe(1050n);
    expect(parseMoney("$1,234.5")).toBe(123450n);
    expect(parseMoney("0.01")).toBe(1n);
    expect(parseMoney("-18")).toBe(-1800n);
  });

  it("rejects input that is not a monetary amount", () => {
    for (const bad of ["", "abc", "1.234", "1.2.3", "-", "1e5"]) {
      expect(() => parseMoney(bad)).toThrow();
    }
  });

  it("survives the float trap that motivates integer minor units", () => {
    // 0.1 + 0.2 !== 0.3 in floating point. In minor units it is exact.
    expect(parseMoney("0.1") + parseMoney("0.2")).toBe(parseMoney("0.3"));
  });

  it("formats with grouping, signs and optional cents", () => {
    expect(formatMoney(1000n)).toBe("$10.00");
    expect(formatMoney(123450n)).toBe("$1,234.50");
    expect(formatMoney(1000n, { compactCents: true })).toBe("$10");
    expect(formatMoney(1050n, { compactCents: true })).toBe("$10.50");
    expect(formatMoney(300n, { signed: true })).toBe("+$3.00");
    expect(formatMoney(-1800n)).toBe("−$18.00");
  });

  it("round-trips through parse and format", () => {
    for (const value of ["0.00", "0.07", "9.99", "10.00", "1,234.56"]) {
      expect(formatMoney(parseMoney(value))).toBe(`$${value}`);
    }
  });

  it("splits a figure for typographic treatment", () => {
    expect(splitMoney(dollars(1234))).toEqual({ sign: "", whole: "1,234", cents: "00" });
    expect(splitMoney(-5n)).toEqual({ sign: "−", whole: "0", cents: "05" });
  });
});
