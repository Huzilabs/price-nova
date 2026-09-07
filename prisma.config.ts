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

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set — copy .env.example to .env");
}

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: { url },
  migrations: { seed: "tsx prisma/seed.ts" },
});
