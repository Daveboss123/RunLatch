/** Fixed default Gate self-deployment only; never relax the restricted-agent/child codecs. */
import { createHash, createPublicKey, verify } from "node:crypto";
import { object, parseBoundedJson, time } from "../../src/lib/near/records.ts";
import { canonicalReviewContent } from "../../src/lib/near/review-content.ts";
import { decodeBase58_32, encodeBase58_32 } from "../near/base58.ts";
import { checkedPublicKey, parentAccount } from "./child-account-codec.ts";

export const gateAccount = `gate.${parentAccount}`;
export const deploymentArtifact = Object.freeze({ bytes: 415910,
  sha256: "d0397fc992cb8f0624076c59314dbe1339461f38ea4c66980dd3d39720c57964",
  code_hash: "F1pev22VSu86qxxWicXpCixtzzNoQxEi1FHRF2eGXjGP" });
export const initArgs = JSON.stringify({ operator_id: parentAccount });
export const initGas = "100000000000000";
export const deploymentAnswer = `DEPLOY AND INIT ${gateAccount} USING LOCAL NODE SIGNER`;
export function checkedDeploymentCode(input: Uint8Array) {
  if (!(input instanceof Uint8Array) || input.byteLength !== deploymentArtifact.bytes
    || createHash("sha256").update(input).digest("hex") !== deploymentArtifact.sha256) throw Error("DEPLOYMENT_ARTIFACT_CHANGED");
  return Buffer.from(input);
}
export function parseDeploymentTransaction(input: unknown) {
  const tx = object(parseBoundedJson(canonicalReviewContent(input), 2048),
    ["network", "signer_id", "receiver_id", "public_key", "nonce", "block_hash", "code_sha256", "code_bytes", "init_args", "gas", "deposit"]);
  if (tx.network !== "testnet" || tx.signer_id !== gateAccount || tx.receiver_id !== gateAccount
    || tx.code_sha256 !== deploymentArtifact.sha256 || tx.code_bytes !== deploymentArtifact.bytes
    || tx.init_args !== initArgs || tx.gas !== initGas || tx.deposit !== "0") throw Error("DEPLOYMENT_SCOPE_INVALID");
  const nonce = time(tx.nonce); if (nonce === "0") throw Error("DEPLOYMENT_NONCE_INVALID");
  decodeBase58_32(tx.block_hash);
  return Object.freeze({ network: "testnet" as const, signer_id: gateAccount, receiver_id: gateAccount,
    public_key: checkedPublicKey(tx.public_key), nonce, block_hash: tx.block_hash as string,
    code_sha256: deploymentArtifact.sha256, code_bytes: deploymentArtifact.bytes, init_args: initArgs, gas: initGas, deposit: "0" });
}
export type DeploymentTransaction = ReturnType<typeof parseDeploymentTransaction>;
function integer(value: bigint, size: number) {
  if (value < 0n || value >= 1n << BigInt(size * 8)) throw Error("DEPLOYMENT_INTEGER_LIMIT");
  const bytes = Buffer.alloc(size);
  for (let i = 0; i < size; i++) { bytes[i] = Number(value & 255n); value >>= 8n; }
  return bytes;
}
function vector(bytes: Uint8Array) { return Buffer.concat([integer(BigInt(bytes.length), 4), bytes]); }
export function encodeDeploymentTransaction(input: unknown, code: Uint8Array) {
  const tx = parseDeploymentTransaction(input), wasm = checkedDeploymentCode(code);
  // Ordinary V0, two ordered actions: DeployContract=1; FunctionCall=2 (init, exact args,100Tgas,0 deposit).
  const bytes = Buffer.concat([vector(Buffer.from(tx.signer_id)), Buffer.from([0]), decodeBase58_32(tx.public_key.slice(8)),
    integer(BigInt(tx.nonce), 8), vector(Buffer.from(tx.receiver_id)), decodeBase58_32(tx.block_hash), integer(2n, 4),
    Buffer.from([1]), vector(wasm), Buffer.from([2]), vector(Buffer.from("init")), vector(Buffer.from(initArgs)),
    integer(BigInt(initGas), 8), integer(0n, 16)]);
  return Object.freeze({ transaction: tx, transaction_hash: encodeBase58_32(createHash("sha256").update(bytes).digest()),
    get unsigned_bytes() { return new Uint8Array(bytes); } });
}
export function verifyDeploymentSignature(input: unknown, code: Uint8Array, signature: Uint8Array) {
  const encoded = encodeDeploymentTransaction(input, code);
  if (!(signature instanceof Uint8Array) || signature.length !== 64) throw Error("DEPLOYMENT_SIGNATURE_INVALID");
  const key = createPublicKey({ format: "jwk", key: { kty: "OKP", crv: "Ed25519",
    x: Buffer.from(decodeBase58_32(encoded.transaction.public_key.slice(8))).toString("base64url") } });
  if (!verify(null, createHash("sha256").update(encoded.unsigned_bytes).digest(), key, signature)) throw Error("DEPLOYMENT_SIGNATURE_INVALID");
  const bytes = Buffer.concat([encoded.unsigned_bytes, Buffer.from([0]), signature]);
  return Object.freeze({ ...encoded, get signed_bytes() { return new Uint8Array(bytes); } });
}
