import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Audit log. Append-only: this module exposes no update or delete, and no
 * other module writes to the table. Section 22.
 */
export type AuditInput = {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  previousState?: Prisma.InputJsonValue;
  newState?: Prisma.InputJsonValue;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function record(
  input: AuditInput,
  client: Prisma.TransactionClient | null = null,
) {
  const tx = client ?? db;
  return tx.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      actorRole: input.actorRole ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      previousState: input.previousState ?? Prisma.JsonNull,
      newState: input.newState ?? Prisma.JsonNull,
      reason: input.reason ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}
