"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updateSetting, type ActionState } from "@/server/actions/admin";
import { Button } from "@/components/primitives/Button";

export function SettingEditor({
  settingKey, value, description,
}: {
  settingKey: string; value: string; description: string | null;
}) {
  const [state, action] = useActionState<ActionState, FormData>(updateSetting, {});
  const [open, setOpen] = React.useState(false);

  return (
    <div className="py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="num min-w-[16rem] text-sm text-hi">{settingKey}</span>
        <span className="num min-w-0 grow truncate text-micro text-mid">{value}</span>
        <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
          {open ? "Close" : "Edit"}
        </Button>
      </div>
      {description && <p className="mt-0.5 text-micro text-faint">{description}</p>}

      {open && (
        <form action={action} className="mt-2 rounded-lg border border-line bg-surface p-3">
          <input type="hidden" name="key" value={settingKey} />
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-mid">Value (JSON)</span>
            <textarea
              name="value" defaultValue={value} rows={3} required spellCheck={false}
              className="num w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-sm transition-colors duration-(--dur-1) focus:border-mint focus:bg-surface"
            />
          </label>
          {state.error && <p className="mt-1.5 text-micro text-bad">{state.error}</p>}
          {state.ok && <p className="mt-1.5 text-micro text-mint">{state.ok}</p>}
          <div className="mt-2"><Save /></div>
        </form>
      )}
    </div>
  );
}

function Save() {
  const { pending } = useFormStatus();
  return <Button type="submit" variant="primary" size="sm" loading={pending}>Save</Button>;
}
