"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createDraw, updateDraw, type ActionState } from "@/server/actions/admin";
import { Button } from "@/components/primitives/Button";
import { Field, Input, Select, MoneyInput, Textarea } from "@/components/primitives/Field";
import { DrawImage } from "@/components/draw/DrawImage";
import { parseMoney } from "@/lib/money";

export type DrawFormValues = {
  id?: string;
  name: string;
  description: string;
  imageUrl: string;
  entryRequirement: string;
  startsAt: string;      // yyyy-MM-ddTHH:mm, UTC
  entryCutoffAt: string;
  drawAt: string;
  selectionMode: string;
  tiers: Array<{ name: string; winnerCount: number; prize: string }>;
  tiersLocked: boolean;
};

/**
 * Create and edit a draw.
 *
 * Everything a participant sees comes from here, which is the point: no draw
 * copy, prize or image is written into the frontend. The image field takes a
 * URL and previews it live, so an admin sees what the card will show before
 * saving instead of after.
 */
export function DrawForm({ initial, onDone }: { initial: DrawFormValues; onDone?: () => void }) {
  const isEdit = Boolean(initial.id);
  const [state, action] = useActionState<ActionState, FormData>(
    isEdit ? updateDraw : createDraw, {},
  );
  const [tiers, setTiers] = React.useState(initial.tiers.length ? initial.tiers : [
    { name: "Tier 1", winnerCount: 1, prize: "" },
  ]);
  const [imageUrl, setImageUrl] = React.useState(initial.imageUrl);

  React.useEffect(() => { if (state.ok) onDone?.(); }, [state.ok, onDone]);

  const total = tiers.reduce((sum, tier) => {
    try { return sum + parseMoney(tier.prize || "0") * BigInt(tier.winnerCount || 0); }
    catch { return sum; }
  }, 0n);

  return (
    <form action={action} className="space-y-5">
      {initial.id && <input type="hidden" name="drawId" value={initial.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Draw name" htmlFor="name" required className="sm:col-span-2">
          <Input id="name" name="name" defaultValue={initial.name} required placeholder="Monthly Mega Draw" />
        </Field>

        <Field label="Description" htmlFor="description" className="sm:col-span-2"
               hint="Shown on the card and the detail page. Leave blank to show none.">
          <Textarea id="description" name="description" rows={3} defaultValue={initial.description} />
        </Field>

        <Field label="Image URL" htmlFor="imageUrl" className="sm:col-span-2"
               hint="Leave blank and the card shows the prize instead — no placeholder image.">
          <Input
            id="imageUrl" name="imageUrl" value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…" className="mono"
          />
        </Field>

        <div className="sm:col-span-2">
          <div className="tag mb-1.5 text-faint">Preview</div>
          <div className="overflow-hidden rounded-xl border border-line">
            <DrawImage src={imageUrl || null} name={initial.name || "Draw"} prize={tiers[0] ? safeMoney(tiers[0].prize) : null} className="h-32" />
          </div>
        </div>

        <Field label="Participation opens" htmlFor="startsAt" required hint="UTC.">
          <Input id="startsAt" name="startsAt" type="datetime-local" defaultValue={initial.startsAt} required />
        </Field>
        <Field label="Entries close" htmlFor="entryCutoffAt" required hint="UTC.">
          <Input id="entryCutoffAt" name="entryCutoffAt" type="datetime-local" defaultValue={initial.entryCutoffAt} required />
        </Field>
        <Field label="Draw date" htmlFor="drawAt" required hint="UTC.">
          <Input id="drawAt" name="drawAt" type="datetime-local" defaultValue={initial.drawAt} required />
        </Field>
        <Field label="Winner selection" htmlFor="selectionMode">
          <Select id="selectionMode" name="selectionMode" defaultValue={initial.selectionMode}>
            <option value="MANUAL">Manual — an admin picks</option>
            <option value="RANDOM">Random — cryptographic</option>
          </Select>
        </Field>

        <Field label="Entry requirement" htmlFor="entryRequirement" className="sm:col-span-2"
               hint="Plain words, shown under 'How this draw works'. Blank uses the default rule.">
          <Input id="entryRequirement" name="entryRequirement" defaultValue={initial.entryRequirement}
                 placeholder="Anyone with an active participation before entries close." />
        </Field>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-bold text-hi">Prize tiers</span>
          {initial.tiersLocked && (
            <span className="text-micro text-gold">Locked — a winner has already been drawn</span>
          )}
        </div>

        <div className="space-y-2">
          {tiers.map((tier, index) => (
            <div key={index} className="grid grid-cols-[1fr_5rem_7rem_auto] items-end gap-2">
              <Field label={index === 0 ? "Name" : ""} htmlFor={`tn${index}`}>
                <Input
                  id={`tn${index}`} name="tierName" value={tier.name}
                  disabled={initial.tiersLocked}
                  onChange={(e) => setTiers(t => t.map((x, i) => i === index ? { ...x, name: e.target.value } : x))}
                />
              </Field>
              <Field label={index === 0 ? "Winners" : ""} htmlFor={`tw${index}`}>
                <Input
                  id={`tw${index}`} name="tierWinners" type="number" min={1} value={tier.winnerCount}
                  disabled={initial.tiersLocked} numeric
                  onChange={(e) => setTiers(t => t.map((x, i) => i === index ? { ...x, winnerCount: Number(e.target.value) } : x))}
                />
              </Field>
              <Field label={index === 0 ? "Each" : ""} htmlFor={`tp${index}`}>
                <MoneyInput
                  id={`tp${index}`} name="tierPrize" value={tier.prize} placeholder="0.00"
                  disabled={initial.tiersLocked}
                  onChange={(e) => setTiers(t => t.map((x, i) => i === index ? { ...x, prize: e.target.value } : x))}
                />
              </Field>
              <Button
                type="button" variant="ghost" size="md"
                disabled={initial.tiersLocked || tiers.length === 1}
                onClick={() => setTiers(t => t.filter((_, i) => i !== index))}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>

        {!initial.tiersLocked && (
          <Button
            type="button" variant="outline" size="sm" className="mt-2"
            onClick={() => setTiers(t => [...t, { name: `Tier ${t.length + 1}`, winnerCount: 1, prize: "" }])}
          >
            Add tier
          </Button>
        )}

        <p className="mt-3 text-sm text-mid">
          Total prize pool:{" "}
          <span className="mono font-bold text-gold">
            ${(Number(total) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </p>
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg border border-bad/30 bg-bad-tint px-3 py-2 text-sm text-bad">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="rounded-lg border border-mint/30 bg-mint-tint px-3 py-2 text-sm text-mint">{state.ok}</p>
      )}

      <Submit isEdit={isEdit} />
    </form>
  );
}

function safeMoney(value: string) {
  try { return parseMoney(value || "0") || null; } catch { return null; }
}

function Submit({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" loading={pending}>
      {isEdit ? "Save draw" : "Create draw"}
    </Button>
  );
}
