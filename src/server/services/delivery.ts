import "server-only";

/**
 * Outbound email and SMS.
 *
 * No provider is configured, so this is an honest seam rather than a pretend
 * one: in development the message is logged in full, including the code or
 * link, and the fact that nothing was actually sent is stated plainly. In
 * production with no provider it THROWS rather than silently swallowing a
 * verification the user is waiting for.
 *
 * Wiring a real provider means implementing these two functions and nothing
 * else — every caller already goes through them.
 */
export type Email = { to: string; subject: string; body: string };
export type Sms = { to: string; body: string };

const configured = {
  email: Boolean(process.env.EMAIL_PROVIDER_KEY),
  sms: Boolean(process.env.SMS_PROVIDER_KEY),
};

function devLog(channel: string, to: string, body: string) {
  console.info(
    `\n──── ${channel} (NOT SENT — no provider configured) ────\n` +
    `to: ${to}\n${body}\n` +
    `────────────────────────────────────────────────────\n`,
  );
}

export async function deliverEmail(email: Email): Promise<void> {
  if (!configured.email) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("EMAIL_PROVIDER_KEY is not set — refusing to pretend an email was sent.");
    }
    devLog("EMAIL", email.to, `subject: ${email.subject}\n\n${email.body}`);
    return;
  }
  throw new Error("Email provider key is set but no transport is implemented yet.");
}

export async function deliverSms(sms: Sms): Promise<void> {
  if (!configured.sms) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SMS_PROVIDER_KEY is not set — refusing to pretend an SMS was sent.");
    }
    devLog("SMS", sms.to, sms.body);
    return;
  }
  throw new Error("SMS provider key is set but no transport is implemented yet.");
}

export const deliveryConfigured = configured;
