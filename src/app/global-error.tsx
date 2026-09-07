"use client";

/**
 * Last-resort boundary: catches failures in the root layout itself, where the
 * normal error boundary cannot render because the layout it lives inside is
 * the thing that broke. It must supply its own <html> and <body>, and cannot
 * rely on the design system's fonts or tokens being available.
 */
export default function GlobalError({
  error, reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center",
          background: "#0b1210", color: "#f2f7f3", padding: 24,
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <div style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>PriceNova could not load</h1>
          <p style={{ color: "#a9bdb1", lineHeight: 1.6, fontSize: 15 }}>
            Something failed before the page could start. Your account and balances
            are unaffected.
          </p>
          {error.digest && (
            <p style={{ color: "#55675d", fontSize: 12, fontFamily: "ui-monospace, monospace" }}>
              Reference: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: 16, padding: "12px 24px", borderRadius: 12, border: "none",
              background: "#ff6b3d", color: "#1a1206", fontWeight: 700, fontSize: 15,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
