"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { selectWinner, type ActionState } from "@/server/actions/admin";
import { Button } from "@/components/primitives/Button";
import { Field, Select } from "@/components/primitives/Field";

type Candidate = { userId: string; name: string; entryNumber: string };

/**
 * Winner selection.
 *
 * Section 8 requires admin-controlled selection for the MVP but the same call
 * supports random. Either way the choice, the admin, the entry number and the
 * IP are written to the audit log before the prize is credited — manual
 * selection is only defensible if it is attributable.
 */
export function WinnerSelector({
  drawId, tierId, tierName, prize, mode, candidates,
}: {
  drawId: string; tierId: string; tierName: string; prize: string;
  mode: string; candidates: Candidate[];
}) {
  const [state, action] = useActionState<ActionState, FormData>(selectWinner, {});
  const [open, setOpen] = React.useState(false);
  const [chosen, setChosen] = React.useState("");

  React.useEffect(() => { if (state.ok) setOpen(false); }, [state.ok]);

  const selected = candidates.find((c) => c.userId === chosen);

  return (
    <>
      <Button size="sm" variant="gold" onClick={() => setOpen(true)} disabled={candidates.length === 0}>
        Select winner
      </Button>
      {state.ok && !open && <p className="mt-1 text-micro text-mint">{state.ok}</p>}
      {state.error && !open && <p className="mt-1 text-micro text-bad">{state.error}</p>}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-xl border border-line bg-surface p-5 text-start shadow-lift">
            <h2 className="font-display text-h2 tracking-[-0.01em]">Select winner — {tierName}</h2>
            <p className="mt-1 text-sm text-mid">
              {candidates.length.toLocaleString()} eligible entries · prize {prize}
            </p>

            <form action={action} className="mt-4">
              <input type="hidden" name="drawId" value={drawId} />
              <input type="hidden" name="prizeTierId" value={tierId} />

              {mode === "RANDOM" ? (
                <p className="border-s-2 border-mint/30 bg-mint-tint px-3 py-2 text-sm text-mid">
                  This draw is set to <strong>RANDOM</strong>. A winner will be chosen with a
                  cryptographic random source from the frozen entry list.
                </p>
              ) : (
                <Field label="Winner" htmlFor="winner" required hint="Recorded against your admin account.">
                  <Select
                    id="winner" name="userId" required
                    value={chosen} onChange={(event) => setChosen(event.target.value)}
                  >
                    <option value="">Choose a participant…</option>
                    {candidates.map((candidate) => (
                      <option key={candidate.userId} value={candidate.userId}>
                        {candidate.entryNumber} — {candidate.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}

              <div className="mt-4 border-s-2 border-gold/30 bg-gold-tint px-3 py-2.5 text-sm leading-relaxed text-mid">
                <strong>{selected ? selected.name : mode === "RANDOM" ? "A randomly chosen participant" : "The selected participant"}</strong>{" "}
                will be credited <strong>{prize}</strong> immediately through the ledger, a prize
                record will be created, and they will be notified. This cannot be undone — a
                mistake requires a compensating adjustment, which is also permanent.
              </div>

              {state.error && <p className="mt-2 text-micro text-bad">{state.error}</p>}

              <div className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="ghost" size="md" onClick={() => setOpen(false)}>Cancel</Button>
                <Confirm disabled={mode !== "RANDOM" && !chosen} />
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function Confirm({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="gold" size="md" loading={pending} disabled={disabled}>
      Confirm winner
    </Button>
  );
}
