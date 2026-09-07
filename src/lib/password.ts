import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { promisify } from "node:util";

// promisify collapses scrypt's overloads and drops the options argument, so
// the signature is restated here rather than lost.
const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * Password hashing with scrypt.
 *
 * scrypt over bcrypt/argon2 because it is in Node's standard library: no
 * native compilation step, nothing to break on a deploy, and it is a
 * memory-hard KDF that OWASP still lists as acceptable. Parameters below are
 * the OWASP minimum (N=2^17, r=8, p=1).
 *
 * Stored format: scrypt$N$r$p$<salt-b64>$<hash-b64>
 * The parameters travel with the hash so they can be raised later without
 * invalidating everyone's password.
 */
const N = 2 ** 17;
const R = 8;
const P = 1;
const KEY_LEN = 64;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(plain.normalize("NFKC"), salt, KEY_LEN, {
    N, r: R, p: P, maxmem: 256 * 1024 * 1024,
  });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts;
  const salt = Buffer.from(saltRaw!, "base64");
  const expected = Buffer.from(hashRaw!, "base64");

  const key = await scrypt(plain.normalize("NFKC"), salt, expected.length, {
    N: Number(nRaw), r: Number(rRaw), p: Number(pRaw), maxmem: 256 * 1024 * 1024,
  });

  // Constant time: a length check first, because timingSafeEqual throws on
  // mismatched lengths and that throw would itself be an oracle.
  if (key.length !== expected.length) return false;
  return timingSafeEqual(key, expected);
}
