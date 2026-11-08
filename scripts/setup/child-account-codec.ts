/** Fixed human bootstrap actions only. Separate from the unchanged restricted-agent codec. */
import { createHash, createPublicKey, verify } from "node:crypto";
import { object, parseBoundedJson, time } from "../../src/lib/near/records.ts";
import { canonicalReviewContent } from "../../src/lib/near/review-content.ts";
import { decodeBase58_32, encodeBase58_32 } from "../near/base58.ts";

export const parentAccount = "runlatch-demo-1108.testnet";
export const childAccounts = Object.freeze([
  { role: "contract", account_id: `gate.${parentAccount}`, amount: "4500000000000000000000000" },
  { role: "provider", account_id: `db.${parentAccount}`, amount: "300000000000000000000000" },
  { role: "agent_recovery", account_id: `agent.${parentAccount}`, amount: "100000000000000000000000" },
].map(value => Object.freeze(value)));
export function checkedPublicKey(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("ed25519:")) throw Error("CHILD_KEY_INVALID");
  decodeBase58_32(value.slice(8)); return value;
}
export function parseChildTransaction(input: unknown) {
  const tx = object(parseBoundedJson(canonicalReviewContent(input), 2048),
    ["network", "signer_id", "public_key", "nonce", "receiver_id", "block_hash", "child_public_key", "amount"]);
  if (tx.network !== "testnet" || tx.signer_id !== parentAccount
    || !childAccounts.some(child => tx.receiver_id === child.account_id && tx.amount === child.amount)) throw Error("CHILD_SCOPE_INVALID");
  const nonce = time(tx.nonce); if (nonce === "0") throw Error("CHILD_NONCE_INVALID");
  decodeBase58_32(tx.block_hash);
  const key = checkedPublicKey(tx.public_key), childKey = checkedPublicKey(tx.child_public_key);
  if (key === childKey) throw Error("CHILD_KEYS_NOT_DISTINCT");
  return Object.freeze({ network: "testnet" as const, signer_id: parentAccount, public_key: key, nonce,
    receiver_id: tx.receiver_id as string, block_hash: tx.block_hash as string,
    child_public_key: childKey, amount: tx.amount as string });
}
export type ChildTransaction = ReturnType<typeof parseChildTransaction>;
function integer(value: bigint, size: number) {
  if (value < 0n || value >= 1n << BigInt(size * 8)) throw Error("CHILD_INTEGER_LIMIT");
  const bytes = Buffer.alloc(size);
  for (let i = 0; i < size; i++) { bytes[i] = Number(value & 255n); value >>= 8n; }
  return bytes;
}
function text(value: string) {
  const bytes = Buffer.from(value); return Buffer.concat([integer(BigInt(bytes.length), 4), bytes]);
}
export function encodeChildTransaction(input: unknown) {
  const tx = parseChildTransaction(input);
  // Ordinary V0 has no enum prefix. Actions: CreateAccount=0, Transfer=3, AddKey=5.
  // AccessKey nonce=0, permission FullAccess=1. No gas/deposit FunctionCall or generic transfer API.
  const bytes = Buffer.concat([text(tx.signer_id), Buffer.from([0]), decodeBase58_32(tx.public_key.slice(8)),
    integer(BigInt(tx.nonce), 8), text(tx.receiver_id), decodeBase58_32(tx.block_hash), integer(3n, 4),
    Buffer.from([0, 3]), integer(BigInt(tx.amount), 16), Buffer.from([5, 0]),
    decodeBase58_32(tx.child_public_key.slice(8)), integer(0n, 8), Buffer.from([1])]);
  return Object.freeze({ transaction: tx, transaction_hash: encodeBase58_32(createHash("sha256").update(bytes).digest()),
    get unsigned_bytes() { return new Uint8Array(bytes); } });
}
export function verifyChildSignature(input: unknown, signature: Uint8Array) {
  const encoded = encodeChildTransaction(input);
  if (!(signature instanceof Uint8Array) || signature.byteLength !== 64) throw Error("CHILD_SIGNATURE_INVALID");
  const key = createPublicKey({ format: "jwk", key: { kty: "OKP", crv: "Ed25519",
    x: Buffer.from(decodeBase58_32(encoded.transaction.public_key.slice(8))).toString("base64url") } });
  if (!verify(null, createHash("sha256").update(encoded.unsigned_bytes).digest(), key, signature)) throw Error("CHILD_SIGNATURE_INVALID");
  const bytes = Buffer.concat([encoded.unsigned_bytes, Buffer.from([0]), signature]);
  return Object.freeze({ ...encoded, get signed_bytes() { return new Uint8Array(bytes); } });
}
