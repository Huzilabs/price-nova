/**
 * Phone numbers in E.164 ("+923001234567"), the one form WhatsApp accepts and
 * the one form uniqueness can be checked on — "0300 1234567", "+92 300
 * 1234567" and "00923001234567" are the same number and must collide.
 *
 * Numbers without a country code are assumed Pakistani (the main market):
 * a leading 0 becomes +92. Anything else must carry its own country code.
 */
export function normalisePhone(raw: string): string | null {
  let value = raw.trim().replace(/[\s\-().]/g, "");
  if (value.startsWith("00")) value = `+${value.slice(2)}`;
  if (!value.startsWith("+")) {
    if (/^0\d{10}$/.test(value)) value = `+92${value.slice(1)}`;      // 03001234567
    else if (/^92\d{10}$/.test(value)) value = `+${value}`;           // 923001234567
    else if (/^3\d{9}$/.test(value)) value = `+92${value}`;           // 3001234567
    else return null;
  }
  return /^\+[1-9]\d{7,14}$/.test(value) ? value : null;
}
