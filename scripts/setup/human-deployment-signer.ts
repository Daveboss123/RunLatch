/** Human-only single Gate signature. The agent never calls the actual credential reader. */
import { createHash, sign } from "node:crypto";
import { deploymentAnswer, encodeDeploymentTransaction, gateAccount, verifyDeploymentSignature } from "./deployment-codec.ts";
import { importGeneratedHumanRecord } from "./human-demo-signer.ts";
import { readHumanContractCredential } from "./human-credential-store.ts";
const permissions = new WeakMap<object, { hash: string; deadline: number; used: boolean }>();
export function admitHumanDeploymentSigner(tx: unknown, code: Uint8Array, answer: string) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || answer !== deploymentAnswer) throw Error("HUMAN_TERMINAL_APPROVAL_REQUIRED");
  const token = Object.freeze({}); permissions.set(token, {
    hash: encodeDeploymentTransaction(tx, code).transaction_hash, deadline: Date.now() + 120000, used: false }); return token;
}
export function signHumanDeployment(tx: unknown, code: Uint8Array, token: object) {
  const encoded = encodeDeploymentTransaction(tx, code), permission = permissions.get(token);
  if (!process.stdin.isTTY || !process.stdout.isTTY || !permission || permission.used
    || Date.now() > permission.deadline || permission.hash !== encoded.transaction_hash) throw Error("HUMAN_TERMINAL_APPROVAL_REQUIRED");
  permission.used = true; // Store/signing failures permanently consume this in-memory permission.
  const blob = readHumanContractCredential(encoded.transaction.public_key);
  try {
    const key = importGeneratedHumanRecord(blob, encoded.transaction.public_key, gateAccount);
    return verifyDeploymentSignature(tx, code, sign(null, createHash("sha256").update(encoded.unsigned_bytes).digest(), key));
  } finally { blob.fill(0); }
}
