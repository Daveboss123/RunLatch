/** Exactly one public demo capsule, canonical quote or restricted AddKey; no dispatcher or free terms. */
import { createHash, createPublicKey, verify } from "node:crypto";
import { object, parseBoundedJson, time } from "../../src/lib/near/records.ts";
import { canonicalReviewContent } from "../../src/lib/near/review-content.ts";
import { parseSetupAction } from "../../src/lib/near/setup-review.ts";
import { DEMO_AGENT_SCOPE, DEMO_CAPSULE_ACTION, DEMO_PROJECT_ACTION, DEMO_QUOTE_ACTION, RUNLATCH_TESTNET_TARGET } from "../../src/lib/near/demo-operations.ts";
import { decodeBase58_32, encodeBase58_32 } from "../near/base58.ts";
import { checkedPublicKey } from "./child-account-codec.ts";
import { gateAccount } from "./deployment-codec.ts";

export const demoKinds = ["project", "capsule", "quote", "agent-key"] as const;
export type DemoKind = typeof demoKinds[number];
export const demoGas = "50000000000000";
// Exact attached deposits from the contract's checked storage requirements (docs/DEMO_ACCOUNT_PACKAGE.md).
export const demoCapsuleDeposit = "2921440000000000000000000";
export const demoProjectDeposit = "81920000000000000000000", demoQuoteDeposit = demoProjectDeposit;
export const demoAnswer: Readonly<Record<DemoKind, string>> = Object.freeze({
  project: `CREATE PROJECT ${DEMO_PROJECT_ACTION.args.project.project_id} ON ${gateAccount} USING LOCAL NODE SIGNER`,
  capsule: `CREATE CAPSULE ${DEMO_CAPSULE_ACTION.args.capsule_id} ON ${gateAccount} USING LOCAL NODE SIGNER`,
  quote: `PUBLISH QUOTE ${DEMO_QUOTE_ACTION.args.quote.quote_id} ON ${gateAccount} USING LOCAL NODE SIGNER`,
  "agent-key": `INSTALL AGENT KEY ${DEMO_AGENT_SCOPE.public_key} ON ${DEMO_AGENT_SCOPE.agent_id} USING LOCAL RECOVERY KEY`,
});
const setupActions = Object.freeze({ capsule: DEMO_CAPSULE_ACTION, quote: DEMO_QUOTE_ACTION });
const allSetupActions = Object.freeze({ project: DEMO_PROJECT_ACTION, ...setupActions });
export function demoSetupAction(kind: DemoKind) {
  return kind === "agent-key" ? null : parseSetupAction(allSetupActions[kind]);
}

interface FunctionCallTransaction {
  readonly kind: "project" | "capsule" | "quote"; readonly network: "testnet"; readonly signer_id: string; readonly receiver_id: string;
  readonly public_key: string; readonly nonce: string; readonly block_hash: string; readonly method: "create_project" | "create_capsule" | "publish_quote";
  readonly args: Readonly<Record<string, unknown>>; readonly gas: string; readonly deposit: string;
}
interface AgentKeyTransaction {
  readonly kind: "agent-key"; readonly network: "testnet"; readonly signer_id: string; readonly receiver_id: string;
  readonly public_key: string; readonly nonce: string; readonly block_hash: string;
  readonly action: { readonly type: "AddKey"; readonly params: { readonly publicKey: string; readonly accessKey: { readonly nonce: number;
    readonly permission: { readonly receiverId: string; readonly allowance: string; readonly methodNames: readonly string[] } } } };
}
export type DemoTransaction = FunctionCallTransaction | AgentKeyTransaction;

function exactAction(kind: DemoKind) {
  const action = demoSetupAction(kind), expected = kind === "capsule" ? demoCapsuleDeposit : demoProjectDeposit;
  if (!action) throw Error("DEMO_KIND_INVALID");
  const method = kind === "project" ? "create_project" : kind === "capsule" ? "create_capsule" : "publish_quote";
  if (action.method !== method || action.signer_id !== (kind === "quote" ? "db.runlatch-demo-1108.testnet" : RUNLATCH_TESTNET_TARGET.operator_id)
    || action.gas !== demoGas) throw Error("DEMO_TERMS_CHANGED");
  return Object.freeze({ action, deposit: expected });
}
function checkedNonce(value: unknown) {
  const nonce = time(value); if (nonce === "0") throw Error("DEMO_NONCE_INVALID"); return nonce;
}
export function parseDemoTransaction(input: unknown) {
  const raw = object(parseBoundedJson(canonicalReviewContent(input), 8192)), kind = raw.kind;
  if (raw.network !== "testnet") throw Error("DEMO_SCOPE_INVALID");
  if (kind === "project" || kind === "capsule" || kind === "quote") {
    const value = object(raw, ["kind", "network", "signer_id", "receiver_id", "public_key", "nonce", "block_hash", "method", "args", "gas", "deposit"]);
    const { action, deposit } = exactAction(kind);
    const args = object(value.args, kind === "project" ? ["project"] : kind === "capsule" ? ["capsule_id", "policy", "storage_credit"] : ["quote"]);
    if (value.receiver_id !== gateAccount || value.signer_id !== action.signer_id
      || value.method !== action.method || value.gas !== demoGas || value.deposit !== deposit
      || canonicalReviewContent(args) !== canonicalReviewContent(action.args)) throw Error("DEMO_SCOPE_INVALID");
    decodeBase58_32(value.block_hash);
    return Object.freeze({ kind, network: "testnet" as const, signer_id: action.signer_id, receiver_id: gateAccount,
      public_key: checkedPublicKey(value.public_key), nonce: checkedNonce(value.nonce), block_hash: value.block_hash as string,
      method: kind === "project" ? "create_project" as const : kind === "capsule" ? "create_capsule" as const : "publish_quote" as const,
      args: action.args, gas: demoGas, deposit });
  }
  if (kind !== "agent-key") throw Error("DEMO_KIND_INVALID");
  const value = object(raw, ["kind", "network", "signer_id", "receiver_id", "public_key", "nonce", "block_hash", "action"]);
  const action = object(value.action, ["type", "params"]), params = object(action.params, ["publicKey", "accessKey"]);
  const accessKey = object(params.accessKey, ["nonce", "permission"]), permission = object(accessKey.permission, ["receiverId", "allowance", "methodNames"]);
  if (action.type !== "AddKey" || params.publicKey !== DEMO_AGENT_SCOPE.public_key || value.signer_id !== DEMO_AGENT_SCOPE.agent_id
    || value.receiver_id !== DEMO_AGENT_SCOPE.agent_id || value.public_key === DEMO_AGENT_SCOPE.public_key || accessKey.nonce !== 0
    || permission.receiverId !== gateAccount || permission.allowance !== DEMO_AGENT_SCOPE.max_allowance
    || !Array.isArray(permission.methodNames) || permission.methodNames.length !== 1 || permission.methodNames[0] !== "submit_purchase") throw Error("DEMO_SCOPE_INVALID");
  decodeBase58_32(value.block_hash);
  return Object.freeze({ kind: "agent-key" as const, network: "testnet" as const, signer_id: DEMO_AGENT_SCOPE.agent_id,
    receiver_id: DEMO_AGENT_SCOPE.agent_id,
    public_key: checkedPublicKey(value.public_key),
    nonce: checkedNonce(value.nonce), block_hash: value.block_hash as string,
    action: Object.freeze({ type: "AddKey" as const, params: Object.freeze({ publicKey: DEMO_AGENT_SCOPE.public_key,
      accessKey: Object.freeze({ nonce: 0, permission: Object.freeze({ receiverId: gateAccount,
        allowance: DEMO_AGENT_SCOPE.max_allowance, methodNames: Object.freeze(["submit_purchase"]) }) }) }) }) });
}
export type ParsedDemoTransaction = ReturnType<typeof parseDemoTransaction>;
function integer(value: bigint, size: number) {
  if (value < 0n || value >= 1n << BigInt(size * 8)) throw Error("DEMO_INTEGER_LIMIT");
  const bytes = Buffer.alloc(size);
  for (let i = 0; i < size; i++) { bytes[i] = Number(value & 255n); value >>= 8n; }
  return bytes;
}
function text(value: string) { const bytes = Buffer.from(value); return Buffer.concat([integer(BigInt(bytes.length), 4), bytes]); }
function envelope(tx: ParsedDemoTransaction) {
  const head = [text(tx.signer_id), Buffer.from([0]), decodeBase58_32(tx.public_key.slice(8)), integer(BigInt(tx.nonce), 8),
    text(tx.receiver_id), decodeBase58_32(tx.block_hash), integer(1n, 4)] as const;
  if (tx.kind === "agent-key") {
    const key = decodeBase58_32(tx.action.params.publicKey.slice(8)), permission = tx.action.params.accessKey.permission;
    return Buffer.concat([...head, Buffer.from([5, 0]), key, integer(0n, 8), Buffer.from([0, 1]), integer(BigInt(permission.allowance), 16),
      text(permission.receiverId), integer(1n, 4), text(permission.methodNames[0])]);
  }
  return Buffer.concat([...head, Buffer.from([2]), text(tx.method), vectorBuffer(Buffer.from(JSON.stringify(tx.args))),
    integer(BigInt(tx.gas), 8), integer(BigInt(tx.deposit), 16)]);
}
function vectorBuffer(bytes: Uint8Array) { return Buffer.concat([integer(BigInt(bytes.length), 4), bytes]); }
export function encodeDemoTransaction(input: unknown) {
  const transaction = parseDemoTransaction(input), bytes = envelope(transaction);
  if (bytes.length > 8192) throw Error("DEMO_TRANSACTION_LIMIT");
  return Object.freeze({ transaction, transaction_hash: encodeBase58_32(createHash("sha256").update(bytes).digest()),
    get unsigned_bytes(): Uint8Array { return new Uint8Array(bytes); } });
}
export function verifyDemoSignature(input: unknown, signature: Uint8Array) {
  const encoded = encodeDemoTransaction(input);
  if (!(signature instanceof Uint8Array) || signature.length !== 64) throw Error("DEMO_SIGNATURE_INVALID");
  const key = createPublicKey({ format: "jwk", key: { kty: "OKP", crv: "Ed25519",
    x: Buffer.from(decodeBase58_32(encoded.transaction.public_key.slice(8))).toString("base64url") } });
  if (!verify(null, createHash("sha256").update(encoded.unsigned_bytes).digest(), key, signature)) throw Error("DEMO_SIGNATURE_INVALID");
  const signed = Buffer.concat([encoded.unsigned_bytes, Buffer.from([0]), new Uint8Array(signature)]);
  return Object.freeze({ ...encoded, get signed_bytes(): Uint8Array { return new Uint8Array(signed); } });
}
