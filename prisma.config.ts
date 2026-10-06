import path from "node:path";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 takes the connection URL here rather than in the schema, and does
 * NOT load .env on its own — hence the explicit loadEnvFile. Without it the
 * CLI silently falls back and reports a confusing "invalid protocol" error.
 */
try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // .env is optional when DATABASE_URL is already exported (CI, production).
}

// `prisma generate` (run on every install and build) only writes client code
// and needs no database, so a missing URL must not fail it — that is what
// broke a Vercel project with an empty DATABASE_URL. Commands that do touch the
// database (db push, studio, seed) still fail clearly, as Prisma reports the
// missing datasource itself.
const url = process.env.DATABASE_URL?.trim();

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  ...(url ? { datasource: { url } } : {}),
  migrations: { seed: "tsx prisma/seed.ts" },
});
