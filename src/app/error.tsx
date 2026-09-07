"use client";

import * as React from "react";
import { Button } from "@/components/primitives/Button";
import { Card } from "@/components/primitives/Card";

/**
 * Route error boundary.
 *
 * Its main job is a specific, recurring failure: a browser tab holding an old
 * client bundle posts a Server Action ID that no longer exists on the server.
 * Next raises `UnrecognizedActionError` and, without this, the user sees a
 * crash overlay for what is really just a stale tab.
 *
 * It happens in development whenever the build is replaced under an open tab,
 * and in production on any deploy where a user has a page open. The correct
 * response in both cases is identical: fetch the new bundle. So we reload,
 * once, guarded against a loop — if the reload does not fix it, the problem is
 * real and the user gets a proper error screen instead of an endless refresh.
 */
const STALE_ACTION = /server action .* was not found|failed to find server action/i;
const RELOAD_GUARD = "pn:reloaded-for-stale-action";

export default function RouteError({
  error, reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const stale = STALE_ACTION.test(error.message);
  const [recovering, setRecovering] = React.useState(stale);

  React.useEffect(() => {
    if (!stale) return;

    let alreadyTried = false;
    try {
      alreadyTried = sessionStorage.getItem(RELOAD_GUARD) === "1";
      sessionStorage.setItem(RELOAD_GUARD, "1");
    } catch {
      // Private mode or blocked storage: fall through to a manual retry.
    }

    if (alreadyTried) {
      setRecovering(false);
      return;
    }
    window.location.reload();
  }, [stale]);

  // Clear the guard once a render succeeds, so a future stale bundle can also
  // self-heal rather than being permanently locked out of the one free reload.
  React.useEffect(() => {
    if (!stale) {
      try { sessionStorage.removeItem(RELOAD_GUARD); } catch { /* ignore */ }
    }
  }, [stale]);

  if (recovering) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-5">
        <p className="text-sm text-mid">Updating to the latest version…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-12">
      <Card className="w-full max-w-md p-6">
        <div className="tag text-coral">Something went wrong</div>
        <h1 className="font-display mt-2 text-h2 font-extrabold tracking-[-0.025em] text-hi">
          {stale ? "This page is out of date" : "We hit an error"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-mid">
          {stale
            ? "Reloading did not pick up the newer version. Try again, and if it keeps happening close the tab and reopen it."
            : "The page failed to load. Nothing you were doing has been lost — no money moves without a confirmed action."}
        </p>

        {error.digest && (
          <p className="mono mt-3 text-micro text-faint">Reference: {error.digest}</p>
        )}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Button onClick={reset} variant="primary" size="lg" fullWidth>Try again</Button>
          <Button href="/" variant="outline" size="lg" fullWidth>Back to home</Button>
        </div>
      </Card>
    </div>
  );
}
