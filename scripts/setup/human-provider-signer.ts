/** Human own-terminal operator key only, after exact one-registration approval. */
import { createHash, sign } from "node:crypto";
import { encodeProviderTransaction, providerAnswer, verifyProviderSignature } from "./provider-codec.ts";
import { importGeneratedOperatorRecord } from "./human-demo-signer.ts";
import { readHumanOperatorCredential } from "./human-credential-store.ts";
const permissions = new WeakMap<object, { hash: string; deadline: number; used: boolean }>();
export function admitHumanProviderSigner(tx: unknown, answer: string) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || answer !== providerAnswer) throw Error("HUMAN_TERMINAL_APPROVAL_REQUIRED");
  const token = Object.freeze({}); permissions.set(token, {
    hash: encodeProviderTransaction(tx).transaction_hash, deadline: Date.now() + 60000, used: false }); return token;
}
export function signHumanProvider(tx: unknown, token: object) {
  const encoded = encodeProviderTransaction(tx), permission = permissions.get(token);
  if (!process.stdin.isTTY || !process.stdout.isTTY || !permission || permission.used
    || Date.now() > permission.deadline || permission.hash !== encoded.transaction_hash) throw Error("HUMAN_TERMINAL_APPROVAL_REQUIRED");
  permission.used = true;
  const blob = readHumanOperatorCredential(encoded.transaction.public_key);
  try {
    const key = importGeneratedOperatorRecord(blob, encoded.transaction.public_key);
    return verifyProviderSignature(tx, sign(null, createHash("sha256").update(encoded.unsigned_bytes).digest(), key));
  } finally { blob.fill(0); }
}
