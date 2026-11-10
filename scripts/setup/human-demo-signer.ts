/** Human terminal only. Real WinCred values never leave this process or appear in public outputs. */
import { createHash, createPrivateKey, createPublicKey, sign } from "node:crypto";
import { object, parseBoundedJson } from "../../src/lib/near/records.ts";
import { decodeBase58_32, encodeBase58_32 } from "../near/base58.ts";
import { encodeChildTransaction, parentAccount, verifyChildSignature } from "./child-account-codec.ts";
import { readHumanOperatorCredential } from "./human-credential-store.ts";

/** Testable with generated in-memory records only; no real store access. */
export function importGeneratedOperatorRecord(input: Buffer, expectedKey: string) {
  return importGeneratedHumanRecord(input, expectedKey, parentAccount);
}
/** Generated in-memory test records only; no credential access. */
export function importGeneratedHumanRecord(input: Buffer, expectedKey: string, expectedAccount: string) {
  const humanAccounts = [parentAccount, `gate.${parentAccount}`, `db.${parentAccount}`, `agent.${parentAccount}`];
  if (!humanAccounts.includes(expectedAccount)) throw Error("HUMAN_KEY_BINDING_INVALID");
  const record = object(parseBoundedJson(input.toString("utf16le"), 2048), ["account_id", "public_key", "private_key"]);
  if (record.account_id !== expectedAccount || record.public_key !== expectedKey
    || typeof record.private_key !== "string" || !/^ed25519:[1-9A-HJ-NP-Za-km-z]{64,88}$/u.test(record.private_key)) throw Error("HUMAN_KEY_BINDING_INVALID");
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const encoded = record.private_key.slice(8), bytes = Buffer.alloc(64);
  let n = 0n;
  for (const c of encoded) n = n * 58n + BigInt(alphabet.indexOf(c));
  if (n >= 1n << 512n) throw Error("HUMAN_KEY_BINDING_INVALID");
  for (let i = 63; i >= 0; i--) { bytes[i] = Number(n & 255n); n >>= 8n; }
  const leading = encoded.match(/^1*/u)?.[0].length ?? 0;
  const byteLeading = bytes.findIndex(byte => byte !== 0);
  if (leading !== (byteLeading < 0 ? 64 : byteLeading)) { bytes.fill(0); throw Error("HUMAN_KEY_BINDING_INVALID"); }
  try {
    const x = Buffer.from(decodeBase58_32(expectedKey.slice(8)));
    if (!bytes.subarray(32).equals(x)) throw Error("HUMAN_KEY_BINDING_INVALID");
    const key = createPrivateKey({ format: "jwk", key: { kty: "OKP", crv: "Ed25519",
      d: bytes.subarray(0, 32).toString("base64url"), x: x.toString("base64url") } });
    const derived = createPublicKey(key).export({ format: "jwk" });
    if (typeof derived.x !== "string" || `ed25519:${encodeBase58_32(Buffer.from(derived.x, "base64url"))}` !== expectedKey) throw Error("HUMAN_KEY_BINDING_INVALID");
    return key;
  } finally { bytes.fill(0); record.private_key = undefined; }
}
const permissions = new WeakMap<object, { hashes: string[] }>();
/** Called only AFTER the exact batch prompt in the human entry point, never by an agent run. */
export function admitHumanChildSigner(transactions: readonly unknown[], exactAnswer: string) {
  if (!process.stdin.isTTY || !process.stdout.isTTY
    || exactAnswer !== `CREATE THREE CHILDREN ${parentAccount} USING LOCAL NODE SIGNER`) throw Error("HUMAN_TERMINAL_APPROVAL_REQUIRED");
  if (transactions.length !== 3) throw Error("HUMAN_TERMINAL_APPROVAL_REQUIRED");
  const hashes = transactions.map(tx => encodeChildTransaction(tx).transaction_hash);
  if (new Set(hashes).size !== 3) throw Error("HUMAN_TERMINAL_APPROVAL_REQUIRED");
  const token = Object.freeze({}); permissions.set(token, { hashes }); return token;
}
export function signHumanChild(input: unknown, approval: object) {
  const encoded = encodeChildTransaction(input), permission = permissions.get(approval);
  if (!process.stdin.isTTY || !process.stdout.isTTY || !permission
    || permission.hashes[0] !== encoded.transaction_hash) throw Error("HUMAN_TERMINAL_APPROVAL_REQUIRED");
  permission.hashes.shift(); // No fallback/retry, including store/signature failure.
  const blob = readHumanOperatorCredential(encoded.transaction.public_key);
  try {
    const key = importGeneratedOperatorRecord(blob, encoded.transaction.public_key);
    return verifyChildSignature(encoded.transaction, sign(null, createHash("sha256").update(encoded.unsigned_bytes).digest(), key));
  } finally { blob.fill(0); }
}
