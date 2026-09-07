import { EmptyState } from "@/components/primitives/Card";
import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Table, TableWrap, THead, TH, TR, TD, CellStack } from "@/components/primitives/Table";
import { StatusBadge } from "@/components/primitives/Badge";

import { FilterTabs } from "@/components/admin/FilterTabs";
import { formatMoney } from "@/lib/money";
import { formatDateShort } from "@/lib/format";

export const metadata = { title: "Users" };
export const dynamic = "force-dynamic";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { status = "ALL", q = "" } = await searchParams;

  const users = await db.user.findMany({
    where: {
      ...(status === "ALL" ? {} : { status: status as never }),
      ...(q
        ? { OR: [
            { fullName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { referralCode: { contains: q, mode: "insensitive" } },
          ] }
        : {}),
    },
    include: {
      wallet: true,
      participations: { where: { status: "ACTIVE" }, include: { plan: true }, take: 1 },
      _count: { select: { referralsMade: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const counts = await db.user.groupBy({ by: ["status"], _count: true });
  const countFor = (key: string) => counts.find((c) => c.status === key)?._count ?? 0;

  return (
    <>
      <PageHeader title="Users" description={`${users.length} shown`} />

      <FilterTabs
        basePath="/admin/users"
        current={status}
        query={q}
        tabs={[
          { key: "ALL", label: "All" },
          { key: "ACTIVE", label: "Active", count: countFor("ACTIVE") },
          { key: "SUSPENDED", label: "Suspended", count: countFor("SUSPENDED") },
          { key: "CLOSED", label: "Closed", count: countFor("CLOSED") },
        ]}
      />

      {users.length === 0 ? (
        <EmptyState title="No users match" description="Try a different filter or search term." />
      ) : (
        <TableWrap>
          <Table>
            <THead>
              <TR>
                <TH>User</TH><TH>Code</TH><TH>Plan</TH><TH>Status</TH>
                <TH align="right">Referrals</TH><TH align="right">Available</TH>
                <TH align="right">Locked</TH><TH>Joined</TH>
              </TR>
            </THead>
            <tbody>
              {users.map((user) => (
                <TR key={user.id} interactive>
                  <TD>
                    <Link href={`/admin/users/${user.id}`} className="block">
                      <CellStack primary={user.fullName} secondary={user.email} />
                    </Link>
                  </TD>
                  <TD className="num text-micro text-mid">{user.referralCode}</TD>
                  <TD className="text-mid">{user.participations[0]?.plan.name ?? "—"}</TD>
                  <TD><StatusBadge status={user.status} /></TD>
                  <TD numeric className="text-mid">{user._count.referralsMade}</TD>
                  <TD numeric>{formatMoney(user.wallet?.available ?? 0n)}</TD>
                  <TD numeric className="text-mid">{formatMoney(user.wallet?.locked ?? 0n)}</TD>
                  <TD className="num text-micro text-mid">{formatDateShort(user.createdAt)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </>
  );
}
