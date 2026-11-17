import { randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";

// OWASP's scrypt floor is N=2^17 with r=8; 2^15 keeps a login near 50 ms on the small server and still costs
// 32 MiB per guess, behind the 5-tries limit.
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_BYTES = 32;
const MAX_MEM = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_BYTES, { N: n, r, p, maxmem: MAX_MEM }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

/** `scrypt$N$r$p$salt$key`, so a later change of cost still reads the old hashes. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64url");
  const actual = await derive(password, Buffer.from(salt, "base64url"), Number(n), Number(r), Number(p));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** No 0/o, 1/l/i: read aloud or typed on a phone without a mistake. 12 characters ≈ 60 bits. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function newPassword(): string {
  const groups = Array.from({ length: 3 }, () =>
    Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(""),
  );
  return groups.join("-");
}
