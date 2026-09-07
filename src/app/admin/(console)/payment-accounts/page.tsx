import { listAllAccounts } from "@/server/payments/accounts";
import { allAdapters } from "@/server/payments/registry";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Card, EmptyState } from "@/components/primitives/Card";
import { Badge } from "@/components/primitives/Badge";
import { AccountEditor, NewAccountButton } from "@/components/admin/PaymentAccountEditor";

export const metadata = { title: "Payment accounts" };
export const dynamic = "force-dynamic";

/**
 * Receiving accounts.
 *
 * This page decides where participants send money, which makes it the highest
 * consequence screen in the console. Every change is audited, an account
 * cannot be enabled without a destination, and nothing here holds an API
 * credential — those stay in the environment.
 */
export default async function PaymentAccountsPage() {
  const accounts = await listAllAccounts();
  const enabled = accounts.filter((a) => a.enabled);

  const providers = allAdapters().map((a) => ({
    key: a.key,
    configured: a.isConfigured(),
    sandbox: a.isConfigured() && a.isSandbox(),
    missing: a.missingConfig(),
  }));

  return (
    <>
      <PageHeader
        title="Payment accounts"
        description="What participants see at checkout. An account with no destination cannot be enabled."
        action={<NewAccountButton />}
      />

      <Card className="mb-5 p-3">
        <div className="tag mb-2 text-faint">Provider API status — controls automatic verification</div>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {providers.map((p) => (
            <span key={p.key} className="flex items-center gap-1.5 text-micro">
              <Badge tone={p.configured ? (p.sandbox ? "warn" : "mint") : "neutral"} dot={p.configured}>
                {p.key.replace(/_/g, " ")}
              </Badge>
              <span className="text-mid">
                {p.configured
                  ? (p.sandbox ? "sandbox credentials" : "live credentials")
                  : p.missing.length > 0 ? `missing ${p.missing.join(", ")}` : "manual only"}
              </span>
            </span>
          ))}
        </div>
        <p className="mt-2.5 text-micro leading-relaxed text-faint">
          Turning on <span className="text-hi">Auto-verify</span> for an account only has an
          effect if that provider has credentials. Without them every payment into the
          account goes to manual review, which is the honest outcome rather than a
          pretended one.
        </p>
      </Card>

      {enabled.length === 0 && (
        <Card tone="raised" className="mb-5 p-4">
          <Badge tone="warn" dot>No methods enabled</Badge>
          <p className="mt-2 text-sm leading-relaxed text-mid">
            Participants currently cannot deposit — the checkout shows an empty state.
            Add an account and enable it.
          </p>
        </Card>
      )}

      {accounts.length === 0 ? (
        <EmptyState
          title="No payment accounts"
          description="Add the Easypaisa, JazzCash, bank or crypto accounts participants should pay into."
        />
      ) : (
        <div className="space-y-2">
          {accounts.map((account) => (
            <AccountEditor
              key={account.id}
              account={{
                id: account.id,
                type: account.type,
                label: account.label,
                enabled: account.enabled,
                autoVerify: account.autoVerify,
                sortOrder: account.sortOrder,
                accountName: account.accountName ?? "",
                accountNumber: account.accountNumber ?? "",
                bankName: account.bankName ?? "",
                iban: account.iban ?? "",
                network: account.network ?? "",
                walletAddress: account.walletAddress ?? "",
                instructions: account.instructions ?? "",
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}
