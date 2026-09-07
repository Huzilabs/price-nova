import { EmptyState } from "@/components/primitives/Card";
import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Table, TableWrap, THead, TH, TR, TD, CellStack } from "@/components/primitives/Table";
import { Badge } from "@/components/primitives/Badge";

import { SearchBox } from "@/components/admin/SearchBox";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;

  const logs = await db.auditLog.findMany({
    where: q
      ? { OR: [{ action: { contains: q, mode: "insensitive" } }, { entityType: { contains: q, mode: "insensitive" } }, { entityId: { contains: q } }] }
      : {},
    include: { actor: true },
    orderBy: { createdAt: "desc" },
    take: 150,
  });

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Append-only. No update or delete path exists in the application, by design."
        action={<SearchBox basePath="/admin/audit" status="" defaultValue={q} placeholder="Search action or entity" />}
      />

      {logs.length === 0 ? (
        <EmptyState title="Nothing recorded" description="Administrative and financial actions are written here as they happen." />
      ) : (
        <TableWrap>
          <Table>
            <THead>
              <TR><TH>When</TH><TH>Action</TH><TH>Actor</TH><TH>Entity</TH><TH>Detail</TH></TR>
            </THead>
            <tbody>
              {logs.map((log) => (
                <TR key={log.id}>
                  <TD className="num text-micro text-mid whitespace-nowrap">{formatDateTime(log.createdAt)}</TD>
                  <TD><Badge tone={log.action.includes("reject") || log.action.includes("suspend") ? "bad" : "neutral"}>{log.action}</Badge></TD>
                  <TD>
                    {log.actor
                      ? <CellStack primary={log.actor.fullName} secondary={log.actorRole ?? undefined} />
                      : <span className="text-faint">system</span>}
                  </TD>
                  <TD>
                    {log.entityType === "User" ? (
                      <Link href={`/admin/users/${log.entityId}`} className="text-sm hover:underline">
                        {log.entityType}
                      </Link>
                    ) : (
                      <span className="text-sm text-mid">{log.entityType}</span>
                    )}
                    <div className="num text-micro text-faint">{log.entityId.slice(-10)}</div>
                  </TD>
                  <TD className="max-w-md">
                    {log.reason && <div className="text-micro italic text-mid">“{log.reason}”</div>}
                    {log.newState != null && (
                      <div className="num truncate text-micro text-mid">{JSON.stringify(log.newState)}</div>
                    )}
                    {log.ipAddress && <div className="num text-micro text-faint">{log.ipAddress}</div>}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </>
  );
}
