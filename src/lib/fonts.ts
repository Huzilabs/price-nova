import { Bricolage_Grotesque, Archivo, IBM_Plex_Mono, Noto_Nastaliq_Urdu } from "next/font/google";

/**
 * The voice changed. The old pairing (Newsreader serif + Public Sans) read as
 * a bank statement — correct for the previous direction, wrong for this one.
 *
 * Bricolage Grotesque is the display face: heavy, slightly irregular, with
 * real character. It makes a prize figure feel like an event rather than a
 * balance. Archivo carries the interface: a wide, confident grotesque that
 * holds up at 13px and at 900 weight. Plex Mono survives only where digits
 * must line up in a column — admin tables, ledger rows, reference codes.
 */

/** Prize figures, countdowns, page titles. Loud on purpose. */
export const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

/** Everything else. */
export const sans = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

/** Ledger rows, IDs, admin tables — anywhere a column must align. */
export const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const nastaliq = Noto_Nastaliq_Urdu({
  subsets: ["arabic"],
  weight: ["400", "500", "600"],
  variable: "--font-nastaliq",
  display: "swap",
});

export const fontVariables = [
  display.variable, sans.variable, mono.variable, nastaliq.variable,
].join(" ");
