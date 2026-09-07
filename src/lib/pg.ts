import fs from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Postgres connection factory.
 *
 * Supabase's pooler presents its own private root ("Supabase Root 2021 CA"),
 * which node-postgres will not accept from the system trust store. Rather than
 * blanket-disabling verification, the CA is pinned — and it can arrive two
 * ways, because a serverless deploy has no writable filesystem to put a file on:
 *
 *   1. SUPABASE_CA_CERT — the PEM itself, or base64 of it. Use this on Vercel.
 *   2. certs/supabase-ca.crt — a file. Convenient locally; gitignored, so it
 *      never travels with the repo.
 *
 * With neither present, TLS is still encrypted but the server certificate is
 * NOT verified, which is a real MITM exposure for a database holding financial
 * records. That is tolerable on a laptop and refused in production.
 */
const CA_PATH = path.join(process.cwd(), "certs", "supabase-ca.crt");

let warned = false;

/** The pinned CA, from the environment or from disk. */
function certificateAuthority(): string | null {
  const inline = process.env.SUPABASE_CA_CERT?.trim();
  if (inline) {
    // Accept a raw PEM or base64, since some dashboards mangle newlines.
    if (inline.includes("BEGIN CERTIFICATE")) return inline.replace(/\\n/g, "\n");
    try {
      const decoded = Buffer.from(inline, "base64").toString("utf8");
      if (decoded.includes("BEGIN CERTIFICATE")) return decoded;
    } catch {
      // Fall through to the file.
    }
  }
  if (fs.existsSync(CA_PATH)) return fs.readFileSync(CA_PATH, "utf8");
  return null;
}

export function createPgAdapter(connectionString?: string): PrismaPg {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — copy .env.example to .env");

  const ca = certificateAuthority();
  if (ca) {
    return new PrismaPg({ connectionString: url, ssl: { ca, rejectUnauthorized: true } });
  }

  if (!warned) {
    warned = true;
    console.warn(
      "[pg] No pinned CA found (SUPABASE_CA_CERT or certs/supabase-ca.crt). " +
      "TLS is encrypted but the server certificate is NOT verified. " +
      "Download the CA from the Supabase dashboard (Settings -> Database -> " +
      "SSL Configuration) before deploying.",
    );
  }

  // `next build` executes server components to collect page data, so it needs a
  // connection — but a build is not serving traffic, and failing it would only
  // push people toward disabling verification permanently. Refuse at runtime
  // instead, where a real request would actually be exposed.
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";
  if (process.env.NODE_ENV === "production" && !isBuild
      && process.env.ALLOW_UNVERIFIED_TLS !== "true") {
    throw new Error(
      "Refusing to serve production traffic without a pinned CA. Set " +
      "SUPABASE_CA_CERT (recommended) or certs/supabase-ca.crt. " +
      "ALLOW_UNVERIFIED_TLS=true overrides this only if you accept the risk.",
    );
  }

  return new PrismaPg({ connectionString: url, ssl: { rejectUnauthorized: false } });
}
