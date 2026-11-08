/** Human-only operator signature after the displayed exact single-call approval. */
import { createHash, sign } from "node:crypto";
import { encodeProjectTransaction, projectAnswer, verifyProjectSignature } from "./project-codec.ts";
import { importGeneratedOperatorRecord } from "./human-demo-signer.ts";
import { readHumanOperatorCredential } from "./human-credential-store.ts";
const permissions = new WeakMap<object, { hash: string; deadline: number; used: boolean }>();
export function admitHumanProjectSigner(tx: unknown, answer: string) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || answer !== projectAnswer) throw Error("HUMAN_TERMINAL_APPROVAL_REQUIRED");
  const token = Object.freeze({}); permissions.set(token, {
    hash: encodeProjectTransaction(tx).transaction_hash, deadline: Date.now() + 60000, used: false }); return token;
}
export function signHumanProject(tx: unknown, token: object) {
  const encoded = encodeProjectTransaction(tx), permission = permissions.get(token);
  if (!process.stdin.isTTY || !process.stdout.isTTY || !permission || permission.used
    || Date.now() > permission.deadline || permission.hash !== encoded.transaction_hash) throw Error("HUMAN_TERMINAL_APPROVAL_REQUIRED");
  permission.used = true; // Failure never falls back, re-signs or restores approval.
  const blob = readHumanOperatorCredential(encoded.transaction.public_key);
  try {
    const key = importGeneratedOperatorRecord(blob, encoded.transaction.public_key);
    return verifyProjectSignature(tx, sign(null, createHash("sha256").update(encoded.unsigned_bytes).digest(), key));
  } finally { blob.fill(0); }
}
