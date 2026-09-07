import { db } from "@/lib/db";
import { PageHeader } from "@/components/primitives/PageHeader";
import { SettingEditor } from "@/components/admin/SettingEditor";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await db.setting.findMany({ orderBy: { key: "asc" } });

  const groups = settings.reduce<Record<string, typeof settings>>((acc, setting) => {
    const group = setting.key.split(".")[0] ?? "other";
    (acc[group] ??= []).push(setting);
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        title="Settings"
        description="Business rules live here, not in code. Withdrawal windows, the entry cutoff day, prize tiers and thresholds are all editable without a deploy."
      />

      {Object.entries(groups).map(([group, rows]) => (
        <section key={group} className="mb-7">
          <h2 className="mb-2 border-b border-line pb-1.5 text-lg font-semibold capitalize">{group}</h2>
          <div className="divide-y divide-line-soft">
            {rows.map((setting) => (
              <SettingEditor
                key={setting.key}
                settingKey={setting.key}
                value={JSON.stringify(setting.value, null, 0)}
                description={setting.description}
              />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
