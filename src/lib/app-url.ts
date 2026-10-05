/**
 * The public origin of this deployment, e.g. https://pricenova.com.
 *
 * Used for links that leave the app — email verification, password reset and
 * provider callbacks. Development falls back to localhost. Production refuses
 * to guess: a reset email pointing at localhost is a broken product, and a
 * webhook URL built from a spoofable Host header is worse.
 *
 * `requestOrigin` is accepted only as a fallback for request-scoped callers
 * outside production.
 */
export function appUrl(requestOrigin?: string): string {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_URL is not set. Set it to the public origin, e.g. https://pricenova.com.");
  }
  return requestOrigin ?? "http://localhost:3000";
}
