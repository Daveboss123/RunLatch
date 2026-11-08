/** One fictional owner project call only. No arbitrary admin/agent transaction dispatcher. */
import { createHash, createPublicKey, verify } from "node:crypto";
import { object, parseBoundedJson, time } from "../../src/lib/near/records.ts";
import { canonicalReviewContent } from "../../src/lib/near/review-content.ts";
import { parseProjectInput, parseSetupAction } from "../../src/lib/near/setup-review.ts";
import { resourceCriteriaHash } from "../../src/lib/validation/resource.ts";
import { decodeBase58_32, encodeBase58_32 } from "../near/base58.ts";
import { checkedPublicKey, parentAccount } from "./child-account-codec.ts";
import { deploymentArtifact, gateAccount } from "./deployment-codec.ts";

export const projectIds = Object.freeze({ project_id: "project_demo_1108", organisation_id: "org_demo_1108", client_ref: "client_demo_1108" });
export const projectGas = "50000000000000";
export const projectDeposit = "81920000000000000000000";
export const projectCeiling = "300000000000000000000000";
export const projectLifetimeNs = 172800000000000n; // Exactly48h from the reviewed chain block, not workstation time.
export const projectCriteriaHash = await resourceCriteriaHash();
export const projectAnswer = `CREATE PROJECT ${projectIds.project_id} ON ${gateAccount} USING LOCAL NODE SIGNER`;
export const projectTarget = Object.freeze({ network: "testnet" as const, rpc_url: "https://rpc.testnet.near.org/",
  contract_id: gateAccount, operator_id: parentAccount, expected_code_hash: deploymentArtifact.code_hash });
export function projectAction(publicKey: string, expires: string) {
  return parseSetupAction({ method: "create_project", signer_id: parentAccount, public_key: publicKey, gas: projectGas,
    args: { project: { ...projectIds, budget_ceiling: projectCeiling, expires_at_ns: expires, outcome_definition_hash: projectCriteriaHash } } });
}
export function checkedDemoProject(value: unknown) {
  const project = parseProjectInput(value);
  if (Object.entries(projectIds).some(([key, v]) => project[key as keyof typeof project] !== v)
    || project.budget_ceiling !== projectCeiling || project.outcome_definition_hash !== projectCriteriaHash) throw Error("PROJECT_TERMS_CHANGED");
  return project;
}
export function parseProjectTransaction(input: unknown) {
  const tx = object(parseBoundedJson(canonicalReviewContent(input), 4096),
    ["network", "signer_id", "receiver_id", "public_key", "nonce", "block_hash", "method", "args", "gas", "deposit"]);
  if (tx.network !== "testnet" || tx.signer_id !== parentAccount || tx.receiver_id !== gateAccount
    || tx.method !== "create_project" || tx.gas !== projectGas || tx.deposit !== projectDeposit) throw Error("PROJECT_SCOPE_INVALID");
  const args = object(tx.args, ["project"]), project = checkedDemoProject(args.project), nonce = time(tx.nonce);
  if (nonce === "0") throw Error("PROJECT_NONCE_INVALID");
  decodeBase58_32(tx.block_hash);
  return Object.freeze({ network: "testnet" as const, signer_id: parentAccount, receiver_id: gateAccount,
    public_key: checkedPublicKey(tx.public_key), nonce, block_hash: tx.block_hash as string, method: "create_project" as const,
    args: Object.freeze({ project }), gas: projectGas, deposit: projectDeposit });
}
export type ProjectTransaction = ReturnType<typeof parseProjectTransaction>;
function integer(value: bigint, size: number) {
  if (value < 0n || value >= 1n << BigInt(size * 8)) throw Error("PROJECT_INTEGER_LIMIT");
  const bytes = Buffer.alloc(size);
  for (let i = 0; i < size; i++) { bytes[i] = Number(value & 255n); value >>= 8n; }
  return bytes;
}
function vector(bytes: Uint8Array) { return Buffer.concat([integer(BigInt(bytes.length), 4), bytes]); }
export function encodeProjectTransaction(input: unknown) {
  const tx = parseProjectTransaction(input);
  const bytes = Buffer.concat([vector(Buffer.from(tx.signer_id)), Buffer.from([0]), decodeBase58_32(tx.public_key.slice(8)),
    integer(BigInt(tx.nonce), 8), vector(Buffer.from(tx.receiver_id)), decodeBase58_32(tx.block_hash), integer(1n, 4),
    Buffer.from([2]), vector(Buffer.from(tx.method)), vector(Buffer.from(JSON.stringify(tx.args))),
    integer(BigInt(tx.gas), 8), integer(BigInt(tx.deposit), 16)]);
  return Object.freeze({ transaction: tx, transaction_hash: encodeBase58_32(createHash("sha256").update(bytes).digest()),
    get unsigned_bytes() { return new Uint8Array(bytes); } });
}
export function verifyProjectSignature(input: unknown, signature: Uint8Array) {
  const encoded = encodeProjectTransaction(input);
  if (!(signature instanceof Uint8Array) || signature.length !== 64) throw Error("PROJECT_SIGNATURE_INVALID");
  const key = createPublicKey({ format: "jwk", key: { kty: "OKP", crv: "Ed25519",
    x: Buffer.from(decodeBase58_32(encoded.transaction.public_key.slice(8))).toString("base64url") } });
  if (!verify(null, createHash("sha256").update(encoded.unsigned_bytes).digest(), key, signature)) throw Error("PROJECT_SIGNATURE_INVALID");
  const bytes = Buffer.concat([encoded.unsigned_bytes, Buffer.from([0]), signature]);
  return Object.freeze({ ...encoded, get signed_bytes() { return new Uint8Array(bytes); } });
}
