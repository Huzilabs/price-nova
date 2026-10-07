import "server-only";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { db } from "@/lib/db";
import * as audit from "./audit";
import { deliverEmail, deliverPhoneCode } from "./delivery";
import { normalisePhone } from "@/lib/phone";
import { appUrl } from "@/lib/app-url";

/**
 * Email and phone verification.
 *
 * Two rules shape everything here:
 *
 *   1. **Nothing verifiable is stored in a usable form.** The email token and
 *      the SMS code are SHA-256 hashed exactly like a password. The plain value
 *      exists only in the message that goes out. A database dump does not let
 *      anyone verify somebody else's account.
 *   2. **The server decides.** `emailVerifiedAt` / `phoneVerifiedAt` are only
 *      ever written by these functions after checking a hash. No client input
 *      sets them.
 */

const EMAIL_TOKEN_TTL_MIN = 60 * 24;
const OTP_TTL_MIN = 10;
const OTP_MAX_ATTEMPTS = 5;
/** No more than this many codes per phone per window. */
const OTP_RATE_LIMIT = 3;
const OTP_RATE_WINDOW_MIN = 15;

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export class VerificationError extends Error {}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

export async function sendEmailVerification(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.emailVerifiedAt) return { alreadyVerified: true as const };

  const recent = await db.emailVerificationToken.count({
    where: { userId, createdAt: { gte: new Date(Date.now() - 5 * 60_000) } },
  });
  if (recent >= 3) throw new VerificationError("Too many emails requested. Try again in a few minutes.");

  // Invalidate anything outstanding so only the newest link works.
  await db.emailVerificationToken.updateMany({
    where: { userId, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const token = randomBytes(32).toString("base64url");
  await db.emailVerificationToken.create({
    data: {
      userId,
      tokenHash: hash(token),
      email: user.email,
      expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MIN * 60_000),
    },
  });

  const link = `${appUrl()}/verify/email?token=${token}`;
  await deliverEmail({
    to: user.email,
    subject: "Verify your PriceNova email",
    text: `Confirm your email address to finish setting up your account:\n\n${link}\n\nThe link expires in 24 hours.`,
    html: emailHtml({
      heading: "Confirm your email",
      body: "Tap the button to confirm this is your email address. You need a verified email and phone number before you can withdraw.",
      cta: "Verify email", link,
      footer: "The link expires in 24 hours. If you did not create a PriceNova account, ignore this email.",
    }),
  });

  return { sent: true as const };
}

export async function confirmEmail(token: string) {
  const record = await db.emailVerificationToken.findUnique({
    where: { tokenHash: hash(token) },
  });

  if (!record) throw new VerificationError("That verification link is not valid.");
  if (record.consumedAt) throw new VerificationError("That link has already been used.");
  if (record.expiresAt < new Date()) throw new VerificationError("That link has expired. Request a new one.");

  await db.$transaction([
    db.emailVerificationToken.update({
      where: { id: record.id }, data: { consumedAt: new Date() },
    }),
    db.user.update({
      where: { id: record.userId }, data: { emailVerifiedAt: new Date() },
    }),
  ]);

  await audit.record({
    actorId: record.userId, action: "verification.email_confirmed",
    entityType: "User", entityId: record.userId,
  });

  return { userId: record.userId };
}

// ---------------------------------------------------------------------------
// Phone
// ---------------------------------------------------------------------------

export async function sendPhoneOtp(userId: string, phone: string) {
  const normalised = normalisePhone(phone);
  if (!normalised) {
    throw new VerificationError("That phone number does not look right. Use 03001234567 or include the country code, e.g. +44….");
  }

  const taken = await db.user.findFirst({
    where: { phone: normalised, NOT: { id: userId } }, select: { id: true },
  });
  if (taken) throw new VerificationError("That number is already registered to another account.");

  // Rate limit per user, so an attacker cannot burn somebody's SMS budget
  // or use the endpoint as an SMS relay.
  const since = new Date(Date.now() - OTP_RATE_WINDOW_MIN * 60_000);
  const recent = await db.phoneVerification.count({ where: { userId, createdAt: { gte: since } } });
  if (recent >= OTP_RATE_LIMIT) {
    throw new VerificationError(
      `Too many codes requested. Try again in ${OTP_RATE_WINDOW_MIN} minutes.`,
    );
  }

  await db.phoneVerification.updateMany({
    where: { userId, consumedAt: null }, data: { consumedAt: new Date() },
  });

  // randomInt is cryptographically secure; Math.random is not.
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.phoneVerification.create({
    data: {
      userId, phone: normalised, codeHash: hash(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MIN * 60_000),
    },
  });

  await deliverPhoneCode({ to: normalised, code });

  return { sent: true as const, phone: normalised };
}

export async function confirmPhoneOtp(userId: string, code: string) {
  const record = await db.phoneVerification.findFirst({
    where: { userId, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!record) throw new VerificationError("Request a code first.");
  if (record.expiresAt < new Date()) throw new VerificationError("That code has expired. Request a new one.");
  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    throw new VerificationError("Too many incorrect attempts. Request a new code.");
  }

  if (record.codeHash !== hash(code.trim())) {
    // Count the miss, and burn the record once the ceiling is reached — an OTP
    // must not be brute-forceable inside its validity window.
    const attempts = record.attempts + 1;
    await db.phoneVerification.update({
      where: { id: record.id },
      data: { attempts, consumedAt: attempts >= OTP_MAX_ATTEMPTS ? new Date() : null },
    });
    const left = OTP_MAX_ATTEMPTS - attempts;
    throw new VerificationError(
      left > 0 ? `That code is not right. ${left} ${left === 1 ? "try" : "tries"} left.`
               : "Too many incorrect attempts. Request a new code.",
    );
  }

  await db.$transaction([
    db.phoneVerification.update({ where: { id: record.id }, data: { consumedAt: new Date() } }),
    db.user.update({
      where: { id: userId },
      data: { phone: record.phone, phoneVerifiedAt: new Date() },
    }),
  ]);

  await audit.record({
    actorId: userId, action: "verification.phone_confirmed",
    entityType: "User", entityId: userId,
  });

  return { verified: true as const };
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

export async function sendPasswordReset(email: string) {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });

  // Always report success. Telling a stranger whether an address is registered
  // turns this form into an account-enumeration oracle.
  if (!user || user.status !== "ACTIVE") return { sent: true as const };

  await db.passwordResetToken.updateMany({
    where: { userId: user.id, consumedAt: null }, data: { consumedAt: new Date() },
  });

  const token = randomBytes(32).toString("base64url");
  await db.passwordResetToken.create({
    data: {
      userId: user.id, tokenHash: hash(token),
      expiresAt: new Date(Date.now() + 60 * 60_000),
    },
  });

  const link = `${appUrl()}/reset?token=${token}`;
  await deliverEmail({
    to: user.email,
    subject: "Reset your PriceNova password",
    text: `Reset your password:\n\n${link}\n\nThe link expires in one hour. If you did not ask for this, ignore it.`,
    html: emailHtml({
      heading: "Reset your password",
      body: "Someone asked to reset the password for your PriceNova account. Tap the button to choose a new one.",
      cta: "Reset password", link,
      footer: "The link expires in one hour. If you did not ask for this, ignore this email — your password stays the same.",
    }),
  });

  return { sent: true as const };
}

export async function consumePasswordReset(token: string, newPasswordHash: string) {
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: hash(token) } });

  if (!record) throw new VerificationError("That reset link is not valid.");
  if (record.consumedAt) throw new VerificationError("That link has already been used.");
  if (record.expiresAt < new Date()) throw new VerificationError("That link has expired.");

  await db.$transaction([
    db.passwordResetToken.update({ where: { id: record.id }, data: { consumedAt: new Date() } }),
    db.user.update({ where: { id: record.userId }, data: { passwordHash: newPasswordHash } }),
  ]);

  await audit.record({
    actorId: record.userId, action: "auth.password_reset",
    entityType: "User", entityId: record.userId,
  });

  return { userId: record.userId };
}

// ---------------------------------------------------------------------------
// Email template — inline styles only, since mail clients strip <style>.
// ---------------------------------------------------------------------------

function escape(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function emailHtml(input: { heading: string; body: string; cta: string; link: string; footer: string }): string {
  const link = escape(input.link);
  return `<!doctype html><html><body style="margin:0;background:#0b1210;font-family:Arial,Helvetica,sans-serif;color:#e8f0ec">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b1210;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#121c19;border:1px solid #23302b;border-radius:16px;padding:28px">
<tr><td style="font-size:18px;font-weight:bold;color:#f5c451;padding-bottom:18px">PriceNova</td></tr>
<tr><td style="font-size:22px;font-weight:bold;color:#ffffff;padding-bottom:10px">${escape(input.heading)}</td></tr>
<tr><td style="font-size:15px;line-height:1.55;color:#b8c6bf;padding-bottom:22px">${escape(input.body)}</td></tr>
<tr><td style="padding-bottom:22px"><a href="${link}" style="display:inline-block;background:#ff6b3d;color:#0b1210;font-weight:bold;font-size:15px;text-decoration:none;padding:13px 22px;border-radius:12px">${escape(input.cta)}</a></td></tr>
<tr><td style="font-size:12px;line-height:1.5;color:#7d8c85;padding-bottom:6px">Or open this link:<br><a href="${link}" style="color:#5ee0a8;word-break:break-all">${link}</a></td></tr>
<tr><td style="font-size:12px;line-height:1.5;color:#7d8c85;padding-top:14px;border-top:1px solid #23302b">${escape(input.footer)}</td></tr>
</table></td></tr></table></body></html>`;
}
