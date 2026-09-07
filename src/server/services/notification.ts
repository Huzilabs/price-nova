import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/** Section 23. Email delivery plugs in behind this same call later. */
export async function notify(
  input: { userId: string; type: string; title: string; body: string; linkPath?: string },
  client: Prisma.TransactionClient | null = null,
) {
  const tx = client ?? db;
  return tx.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      linkPath: input.linkPath ?? null,
    },
  });
}

export async function markRead(userId: string, notificationId: string) {
  return db.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  });
}
