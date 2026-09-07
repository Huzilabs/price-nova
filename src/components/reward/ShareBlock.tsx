"use client";

import * as React from "react";
import { Card } from "@/components/primitives/Card";
import { Button } from "@/components/primitives/Button";
import { cn } from "@/lib/cn";

/**
 * Copy-and-share.
 *
 * The link is the product's growth loop, so it gets a whole card and the copy
 * button confirms in place — a toast that appears elsewhere on the screen
 * makes people doubt the copy worked. Web Share is used where the browser has
 * it, because on a phone that is one tap to WhatsApp instead of four.
 */
export function ShareBlock({ code }: { code: string }) {
  const [copied, setCopied] = React.useState<"code" | "link" | null>(null);
  const [origin, setOrigin] = React.useState("");
  const [canShare, setCanShare] = React.useState(false);

  React.useEffect(() => {
    setOrigin(window.location.origin);
    setCanShare(typeof navigator !== "undefined" && "share" in navigator);
  }, []);

  const link = `${origin}/signup?ref=${code}`;

  async function copy(value: string, which: "code" | "link") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      /* Clipboard can be blocked; the value is selectable on screen regardless. */
    }
  }

  async function share() {
    try {
      await navigator.share({
        title: "PriceNova",
        text: "Join my team on PriceNova and enter this month's draw.",
        url: link,
      });
    } catch {
      /* User dismissed the sheet. */
    }
  }

  return (
    <Card className="p-4">
      <div className="tag text-faint">Your code</div>
      <div className="mt-2 flex items-center gap-2">
        <code className="mono min-w-0 grow truncate rounded-lg border border-dashed border-gold/40 bg-gold-tint px-3.5 py-3 text-lg font-bold tracking-[0.12em] text-gold">
          {code}
        </code>
        <Button variant="solid" size="lg" onClick={() => copy(code, "code")} className="shrink-0">
          {copied === "code" ? "Copied" : "Copy"}
        </Button>
      </div>

      <div className="tag mt-4 text-faint">Your link</div>
      <div className="mt-2 flex items-center gap-2">
        <span className="mono min-w-0 grow truncate rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm text-mid">
          {origin ? link : "…"}
        </span>
        <Button variant="solid" size="md" onClick={() => copy(link, "link")} className="shrink-0">
          {copied === "link" ? "Copied" : "Copy"}
        </Button>
      </div>

      <Button
        variant="primary"
        size="lg"
        fullWidth
        shine
        className={cn("mt-4")}
        onClick={canShare ? share : () => copy(link, "link")}
      >
        {canShare ? "Share invite" : copied === "link" ? "Link copied" : "Copy invite link"}
      </Button>
    </Card>
  );
}
