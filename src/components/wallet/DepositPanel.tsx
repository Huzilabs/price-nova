"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { Card } from "@/components/primitives/Card";
import { Button } from "@/components/primitives/Button";

/**
 * The wallet's deposit entry point.
 *
 * It no longer holds a payment form. Checkout lives at /join, which is the one
 * place that renders the provider method picker — two implementations of the
 * same flow is how they drift apart.
 *
 * `Sheet` and `Submit` stay exported here because the admin draw forms and the
 * withdraw panel already build on them.
 */
export function DepositPanel({ hasParticipation }: {
  plans?: unknown;
  methods?: unknown;
  hasParticipation: boolean;
}) {
  return (
    <Card tone={hasParticipation ? "default" : "gold"} interactive className="p-5">
      <div className="tag text-faint">{hasParticipation ? "Add" : "Start here"}</div>
      <div className="mt-1.5 font-display text-title font-extrabold tracking-[-0.02em] text-hi">
        {hasParticipation ? "New deposit" : "Enter the draw"}
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-mid">
        {hasParticipation
          ? "Add another participation to increase your entries."
          : "Pay by mobile wallet, card or crypto. Your deposit credits automatically."}
      </p>
      <Button
        href="/join"
        variant={hasParticipation ? "solid" : "gold"}
        size="lg" fullWidth className="mt-4"
        shine={!hasParticipation}
      >
        Deposit
      </Button>
    </Card>
  );
}

export function Sheet({
  title, onClose, children,
}: { title: string; onClose: () => void; children: React.ReactNode }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-base/70 backdrop-blur-sm sm:items-center"
         role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      {/* Bottom sheet on a phone, centred dialog on a desktop. */}
      <div className="animate-rise relative max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-line bg-surface p-5 shadow-lift sm:max-w-md sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="font-display text-title font-extrabold tracking-[-0.02em] text-hi">{title}</h2>
          <button onClick={onClose} aria-label="Close"
                  className="rounded-full p-1.5 text-mid transition-colors hover:bg-surface-3 hover:text-hi">
            <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
              <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" fullWidth loading={pending}>
      {label}
    </Button>
  );
}
