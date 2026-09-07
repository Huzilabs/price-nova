import { PrismaClient } from "@prisma/client";
import { createPgAdapter } from "./pg";

/**
 * Prisma client against Supabase Postgres.
 *
 * Cached across hot reloads so dev does not exhaust the connection pooler on
 * every file save — Next re-evaluates modules aggressively and Supabase's
 * session pooler has a modest connection ceiling.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient({ adapter: createPgAdapter() });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
