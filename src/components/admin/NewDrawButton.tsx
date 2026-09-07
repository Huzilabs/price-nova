"use client";

import * as React from "react";
import { Button } from "@/components/primitives/Button";
import { Sheet } from "@/components/wallet/DepositPanel";
import { DrawForm } from "./DrawForm";

/** Opens the create-draw sheet. */
export function NewDrawButton() {
  const [open, setOpen] = React.useState(false);
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 16);

  return (
    <>
      <Button variant="primary" size="md" onClick={() => setOpen(true)}>New draw</Button>
      {open && (
        <Sheet title="Create a draw" onClose={() => setOpen(false)}>
          <DrawForm
            onDone={() => setOpen(false)}
            initial={{
              name: "", description: "", imageUrl: "", entryRequirement: "",
              startsAt: iso(now),
              entryCutoffAt: iso(new Date(now.getTime() + 25 * 86_400_000)),
              drawAt: iso(new Date(now.getTime() + 30 * 86_400_000)),
              selectionMode: "MANUAL",
              tiers: [{ name: "Tier 1", winnerCount: 1, prize: "" }],
              tiersLocked: false,
            }}
          />
        </Sheet>
      )}
    </>
  );
}
