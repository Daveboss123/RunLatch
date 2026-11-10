/** Human own-terminal signer for exactly one demo capsule, quote or restricted AddKey. */
import { createHash, sign } from "node:crypto";
import { demoAnswer, encodeDemoTransaction, verifyDemoSignature, type DemoKind } from "./demo-operation-codec.ts";
import { importGeneratedHumanRecord } from "./human-demo-signer.ts";
import { readHumanAgentRecoveryCredential, readHumanOperatorCredential, readHumanProviderCredential } from "./human-credential-store.ts";
import { DEMO_AGENT_SCOPE, DEMO_OPERATOR_KEY, DEMO_PROVIDER_KEY } from "../../src/lib/near/demo-operations.ts";
function exactHumanKey(tx: ReturnType<typeof encodeDemoTransaction>["transaction"]) {
  if (tx.public_key !== (["project", "capsule"].includes(tx.kind) ? DEMO_OPERATOR_KEY : tx.kind === "quote" ? DEMO_PROVIDER_KEY : DEMO_AGENT_SCOPE.recovery_public_key))
    throw Error("DEMO_HUMAN_KEY_MISMATCH");
}
const permissions = new WeakMap<object, { hash: string; kind: DemoKind; deadline: number; used: boolean }>();
export function admitHumanDemoSigner(tx: unknown, answer: string) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw Error("HUMAN_TERMINAL_APPROVAL_REQUIRED");
  const encoded = encodeDemoTransaction(tx), kind = encoded.transaction.kind;
  exactHumanKey(encoded.transaction);
  if (answer !== demoAnswer[kind]) throw Error("HUMAN_TERMINAL_APPROVAL_REQUIRED");
  const token = Object.freeze({}); permissions.set(token, { hash: encoded.transaction_hash, kind, deadline: Date.now() + 60000, used: false });
  return token;
}
export function signHumanDemo(tx: unknown, token: object) {
  const encoded = encodeDemoTransaction(tx), permission = permissions.get(token);
  exactHumanKey(encoded.transaction);
  if (!process.stdin.isTTY || !process.stdout.isTTY || !permission || permission.used || permission.kind !== encoded.transaction.kind
    || Date.now() > permission.deadline || permission.hash !== encoded.transaction_hash) throw Error("HUMAN_TERMINAL_APPROVAL_REQUIRED");
  permission.used = true;
  const blob = ["project", "capsule"].includes(encoded.transaction.kind) ? readHumanOperatorCredential(encoded.transaction.public_key)
    : encoded.transaction.kind === "quote" ? readHumanProviderCredential(encoded.transaction.public_key)
      : readHumanAgentRecoveryCredential(encoded.transaction.public_key);
  try {
    const key = importGeneratedHumanRecord(blob, encoded.transaction.public_key, encoded.transaction.signer_id);
    return verifyDemoSignature(tx, sign(null, createHash("sha256").update(encoded.unsigned_bytes).digest(), key));
  } finally { blob.fill(0); }
}
