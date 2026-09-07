import Link from "next/link";
import { listAllDraws, categorise } from "@/server/services/draw";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Table, TableWrap, THead, TH, TR, TD, CellStack } from "@/components/primitives/Table";
import { StatusBadge, Badge } from "@/components/primitives/Badge";
import { EmptyState } from "@/components/primitives/Card";
import { MainDrawToggle } from "@/components/admin/MainDrawToggle";
import { NewDrawButton } from "@/components/admin/NewDrawButton";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Draws" };
export const dynamic = "force-dynamic";

export default async function AdminDrawsPage() {
  const draws = await listAllDraws();
  const main = draws.find((d) => d.isMain === true) ?? null;

  return (
    <>
      <PageHeader
        title="Draws"
        description={
          main
            ? <>Homepage is showing <strong className="text-gold">{main.name}</strong>.</>
            : "No main draw is selected — the homepage is showing an empty state."
        }
        action={<NewDrawButton />}
      />

      {draws.length === 0 ? (
        <EmptyState
          title="No draws yet"
          description="Create the first draw. It starts as a draft and is invisible to participants until you open entries."
        />
      ) : (
        <TableWrap>
          <Table>
            <THead>
              <TR>
                <TH>Draw</TH><TH>Status</TH><TH>Opens</TH><TH>Entries close</TH><TH>Draw date</TH>
                <TH align="right">Entries</TH><TH align="right">Prize pool</TH><TH align="right">Homepage</TH>
              </TR>
            </THead>
            <tbody>
              {draws.map((draw) => {
                const pool = draw.prizeTiers.reduce(
                  (t, tier) => t + tier.prizeAmount * BigInt(tier.winnerCount), 0n,
                );
                const category = categorise(draw);
                return (
                  <TR key={draw.id}>
                    <TD>
                      <Link href={`/admin/draws/${draw.id}`} className="block hover:underline">
                        <CellStack
                          primary={
                            <span className="flex items-center gap-2">
                              {draw.isMain === true && <span aria-label="Main draw" title="Main draw">⭐</span>}
                              {draw.name}
                            </span>
                          }
                          secondary={`${draw.prizeTiers.length} tier${draw.prizeTiers.length === 1 ? "" : "s"} · ${draw.selectionMode}`}
                        />
                      </Link>
                    </TD>
                    <TD>
                      <span className="flex flex-wrap items-center gap-1">
                        <StatusBadge status={draw.status} />
                        <Badge tone={category === "ACTIVE" ? "mint" : category === "UPCOMING" ? "info" : "neutral"}>
                          {category}
                        </Badge>
                      </span>
                    </TD>
                    <TD className="mono text-micro text-mid">{formatDate(draw.startsAt)}</TD>
                    <TD className="mono text-micro text-mid">{formatDate(draw.entryCutoffAt)}</TD>
                    <TD className="mono text-micro text-mid">{formatDate(draw.drawAt)}</TD>
                    <TD numeric>{draw._count.entries.toLocaleString()}</TD>
                    <TD numeric className="text-gold">{formatMoney(pool, { compactCents: true })}</TD>
                    <TD align="right">
                      <MainDrawToggle
                        drawId={draw.id}
                        drawName={draw.name}
                        isMain={draw.isMain === true}
                        isDraft={draw.status === "DRAFT"}
                      />
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      )}

      <p className="mt-4 max-w-[70ch] text-sm leading-relaxed text-mid">
        Exactly one draw can be the homepage main draw. Setting a new one clears the
        previous designation in the same database transaction — the constraint is
        enforced by a unique index, so two admins acting at once cannot produce two
        main draws. Drafts are hidden from participants and cannot be featured.
      </p>
    </>
  );
}
