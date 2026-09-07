"use client";

import * as React from "react";
import { Button } from "@/components/primitives/Button";
import { Sheet } from "@/components/wallet/DepositPanel";
import { DrawForm, type DrawFormValues } from "./DrawForm";

export function EditDrawButton({ draw }: { draw: DrawFormValues }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="solid" size="sm" onClick={() => setOpen(true)}>Edit draw</Button>
      {open && (
        <Sheet title={`Edit ${draw.name}`} onClose={() => setOpen(false)}>
          <DrawForm initial={draw} onDone={() => setOpen(false)} />
        </Sheet>
      )}
    </>
  );
}
