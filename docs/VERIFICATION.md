# Email & phone verification

Users verify from **Profile**. Both are **required before any withdrawal**
(checked server-side in `withdrawal.requestWithdrawal`); signing up, depositing
and entering draws do not need them.

| | Channel | Lifetime | Limits |
|---|---|---|---|
| Email | link via Gmail SMTP | 24 h, single use | 3 emails / 5 min |
| Phone | 6-digit code via WhatsApp | 10 min | 3 codes / 15 min, 5 wrong guesses burns the code |

Tokens and codes are stored SHA-256 hashed. Phone numbers are stored in E.164
(`0300 1234567` → `+923001234567`, see `src/lib/phone.ts`); a number can belong
to one account only.

Unconfigured channels log the link/code in development and refuse in
production ("temporarily unavailable") — nothing is ever reported as sent when
it was not.

## Gmail setup (email)

1. Use a Gmail account for sending (a dedicated one is better).
2. Turn on 2-Step Verification: Google Account → Security.
3. Create an App Password: Security → 2-Step Verification → App passwords.
4. In Vercel set `SMTP_USER` (the address) and `SMTP_PASS` (the 16-character
   App Password). Optional: `EMAIL_FROM="PriceNova <address>"`.

Gmail allows ~500 recipients/day. Mail may land in spam until the address has
some sending history; a custom domain with SPF/DKIM (e.g. via Resend) fixes that
later without code changes beyond `delivery.ts`.

## WhatsApp setup (phone)

1. Meta Business account → WhatsApp Manager → add a phone number that is not
   already on the WhatsApp app.
2. Create a message template, category **Authentication**, with a **Copy code**
   button, e.g. name `pricenova_otp`, language English (US). Wait for approval.
3. Create a System User (Business settings → Users → System users), give it the
   WhatsApp app, generate a **permanent** token with `whatsapp_business_messaging`.
4. In Vercel set `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` (API setup
   page), `WHATSAPP_OTP_TEMPLATE` (the template name) and, if not en_US,
   `WHATSAPP_OTP_LANGUAGE`.

Meta charges per authentication message (Pakistan is one of the cheaper rates).
A number not on WhatsApp gets a clear "can't receive WhatsApp messages" error.
