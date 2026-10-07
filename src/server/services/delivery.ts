import "server-only";
import nodemailer from "nodemailer";

/**
 * Outbound email (Gmail SMTP) and phone codes (WhatsApp).
 *
 * Unconfigured is an honest state, never a pretend one: in development the
 * message is logged in full, with a plain statement that nothing was sent. In
 * production an unconfigured channel refuses, so a user is never told "code
 * sent" when it was not. Errors shown to users are generic; the provider's own
 * error goes to the server log.
 *
 * Email — any SMTP server; defaults suit Gmail with an App Password:
 *   SMTP_USER, SMTP_PASS (16-char App Password), optional SMTP_HOST,
 *   SMTP_PORT, EMAIL_FROM.
 * WhatsApp — Meta WhatsApp Cloud API with an approved AUTHENTICATION template:
 *   WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_OTP_TEMPLATE,
 *   optional WHATSAPP_OTP_LANGUAGE (default en_US).
 */
export type Email = { to: string; subject: string; text: string; html?: string };
export type PhoneCode = { to: string; code: string };

export class DeliveryError extends Error {}

const env = (key: string) => process.env[key]?.trim() ?? "";

export function emailConfigured(): boolean {
  return Boolean(env("SMTP_USER") && env("SMTP_PASS"));
}

export function whatsappConfigured(): boolean {
  return Boolean(env("WHATSAPP_ACCESS_TOKEN") && env("WHATSAPP_PHONE_NUMBER_ID") && env("WHATSAPP_OTP_TEMPLATE"));
}

function devLog(channel: string, to: string, body: string) {
  console.info(
    `\n──── ${channel} (NOT SENT — no provider configured) ────\n` +
    `to: ${to}\n${body}\n` +
    `────────────────────────────────────────────────────\n`,
  );
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

let transport: nodemailer.Transporter | null = null;

function smtp(): nodemailer.Transporter {
  if (transport) return transport;
  const port = Number(env("SMTP_PORT") || 465);
  transport = nodemailer.createTransport({
    host: env("SMTP_HOST") || "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: { user: env("SMTP_USER"), pass: env("SMTP_PASS").replace(/\s+/g, "") },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });
  return transport;
}

export async function deliverEmail(email: Email): Promise<void> {
  if (!emailConfigured()) {
    if (process.env.NODE_ENV === "production") {
      console.error("[delivery] email refused: SMTP_USER / SMTP_PASS not set");
      throw new DeliveryError("Email is temporarily unavailable. Please try again later.");
    }
    devLog("EMAIL", email.to, `subject: ${email.subject}\n\n${email.text}`);
    return;
  }

  try {
    await smtp().sendMail({
      from: env("EMAIL_FROM") || `PriceNova <${env("SMTP_USER")}>`,
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
  } catch (error) {
    console.error("[delivery] email failed", error);
    throw new DeliveryError("We could not send the email. Please try again in a few minutes.");
  }
}

// ---------------------------------------------------------------------------
// WhatsApp verification code
// ---------------------------------------------------------------------------

/**
 * Send a one-time code through a WhatsApp authentication template.
 *
 * Authentication templates carry the code twice: as the body's {{1}} and as
 * the parameter of the "Copy code" button. Meta rejects the message if the
 * button parameter is missing.
 */
export async function deliverPhoneCode({ to, code }: PhoneCode): Promise<void> {
  if (!whatsappConfigured()) {
    if (process.env.NODE_ENV === "production") {
      console.error("[delivery] WhatsApp refused: WHATSAPP_* not set");
      throw new DeliveryError("Phone verification is temporarily unavailable. Please try again later.");
    }
    devLog("WHATSAPP", to, `code: ${code}`);
    return;
  }

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${env("WHATSAPP_PHONE_NUMBER_ID")}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env("WHATSAPP_ACCESS_TOKEN")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to.replace(/^\+/, ""),
        type: "template",
        template: {
          name: env("WHATSAPP_OTP_TEMPLATE"),
          language: { code: env("WHATSAPP_OTP_LANGUAGE") || "en_US" },
          components: [
            { type: "body", parameters: [{ type: "text", text: code }] },
            { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
          ],
        },
      }),
      signal: AbortSignal.timeout(15_000),
    },
  ).catch((error: unknown) => {
    console.error("[delivery] WhatsApp unreachable", error);
    throw new DeliveryError("We could not send the code. Please try again in a few minutes.");
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(`[delivery] WhatsApp ${response.status}`, detail.slice(0, 500));
    // 131026: the number is not on WhatsApp / cannot receive messages.
    if (detail.includes("131026")) {
      throw new DeliveryError("That number can't receive WhatsApp messages. Check it, or use a number that has WhatsApp.");
    }
    throw new DeliveryError("We could not send the code. Please try again in a few minutes.");
  }
}
