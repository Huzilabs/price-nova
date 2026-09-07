"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { setMainDraw, type ActionState } from "@/server/actions/admin";
import { Button } from "@/components/primitives/Button";
import { Badge } from "@/components/primitives/Badge";

/**
 * The homepage main-draw switch.
 *
 * Writes through the server action to the database — never local state — so
 * the homepage reflects it for everyone, not just this admin's browser.
 */
export function MainDrawToggle({
  drawId, drawName, isMain, isDraft,
}: { drawId: string; drawName: string; isMain: boolean; isDraft: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(setMainDraw, {});

  if (isDraft) {
    return <span className="text-micro text-faint">Draft — publish first</span>;
  }

  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="drawId" value={isMain ? "none" : drawId} />
      {isMain && <Badge tone="gold" dot>Main</Badge>}
      <Submit isMain={isMain} drawName={drawName} />
      {state.error && <span className="text-micro text-bad">{state.error}</span>}
    </form>
  );
}

function Submit({ isMain, drawName }: { isMain: boolean; drawName: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      variant={isMain ? "ghost" : "outline"}
      loading={pending}
      aria-label={isMain ? `Remove ${drawName} from the homepage` : `Set ${drawName} as the main draw`}
    >
      {isMain ? "Remove" : "⭐ Set as main"}
    </Button>
  );
}
