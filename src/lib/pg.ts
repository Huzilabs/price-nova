import fs from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Postgres connection factory.
 *
 * Supabase's pooler presents a self-signed root that node-postgres will not
 * accept under the default `sslmode=require`. Rather than blanket-disabling
 * verification, this pins Supabase's CA when it is available:
 *
 *   Supabase dashboard -> Settings -> Database -> SSL Configuration
 *   -> Download certificate, save it as certs/supabase-ca.crt
 *
 * With the file present the chain is properly verified. Without it we fall
 * back to an encrypted-but-unverified connection and say so loudly, because
 * an unverified TLS connection to a database holding financial records is a
 * real MITM exposure — acceptable on a laptop, not in production.
 */
const CA_PATH = path.join(process.cwd(), "certs", "supabase-ca.crt");

let warned = false;

export function createPgAdapter(connectionString?: string): PrismaPg {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — copy .env.example to .env");

  if (fs.existsSync(CA_PATH)) {
    return new PrismaPg({
      connectionString: url,
      ssl: { ca: fs.readFileSync(CA_PATH, "utf8"), rejectUnauthorized: true },
    });
  }

  if (!warned) {
    warned = true;
    console.warn(
      "[pg] certs/supabase-ca.crt not found — TLS is encrypted but the server " +
      "certificate is NOT verified. Download it from the Supabase dashboard " +
      "(Settings -> Database -> SSL Configuration) before deploying.",
    );
  }
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_UNVERIFIED_TLS !== "true") {
    throw new Error(
      "Refusing to connect in production without certs/supabase-ca.crt. " +
      "Set ALLOW_UNVERIFIED_TLS=true only if you genuinely accept the risk.",
    );
  }
  return new PrismaPg({ connectionString: url, ssl: { rejectUnauthorized: false } });
}
