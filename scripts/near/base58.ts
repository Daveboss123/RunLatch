/** Fixed 32-byte public hashes/keys only. No secret-key or arbitrary-length codec. */
import { fail } from "../../src/lib/near/records.ts";
const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function encodeBase58_32(value: Uint8Array): string {
  if (!(value instanceof Uint8Array) || value.byteLength !== 32) return fail("WIRE_BASE58_SIZE");
  const bytes = new Uint8Array(value);
  let n = 0n, leading = 0;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  for (const b of bytes) { if (b !== 0) break; leading++; }
  let result = "";
  while (n > 0n) { result = alphabet[Number(n % 58n)] + result; n /= 58n; }
  return "1".repeat(leading) + result;
}
export function decodeBase58_32(value: unknown): Uint8Array {
  if (typeof value !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/u.test(value)) return fail("WIRE_BASE58_FORMAT");
  let n = 0n;
  for (const c of value) n = n * 58n + BigInt(alphabet.indexOf(c));
  if (n >= (1n << 256n)) return fail("WIRE_BASE58_SIZE");
  const bytes = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) { bytes[i] = Number(n & 255n); n >>= 8n; }
  if (encodeBase58_32(bytes) !== value) return fail("WIRE_BASE58_SIZE");
  return bytes;
}
