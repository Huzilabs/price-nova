import { PrismaClient } from "@prisma/client";
import { createPgAdapter } from "./pg";

/**
 * Prisma client against Supabase Postgres.
 *
 * Created lazily, on the first query rather than when this module is imported.
 * `next build` imports every route to collect page data without running a
 * single query, so an eager client made the build itself depend on
 * DATABASE_URL and the CA. Now only a real request needs them.
 *
 * Cached on globalThis so dev does not exhaust the connection pooler on every
 * hot reload, and so each serverless instance holds exactly one client.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function client(): PrismaClient {
  return (globalForPrisma.prisma ??= new PrismaClient({ adapter: createPgAdapter() }));
}

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const instance = client();
    const value = Reflect.get(instance, property, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
