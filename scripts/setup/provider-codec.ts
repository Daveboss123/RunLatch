/** Exactly one fictional database-provider registration, not an admin dispatcher. */
import { createHash, createPublicKey, verify } from "node:crypto";
import { object, parseBoundedJson, parseProvider, time } from "../../src/lib/near/records.ts";
import { canonicalReviewContent } from "../../src/lib/near/review-content.ts";
import { parseSetupAction } from "../../src/lib/near/setup-review.ts";
import { decodeBase58_32, encodeBase58_32 } from "../near/base58.ts";
import { checkedPublicKey, parentAccount } from "./child-account-codec.ts";
import { gateAccount } from "./deployment-codec.ts";
import { checkedDemoProject } from "./project-codec.ts";

export const providerTerms = Object.freeze({ provider_id: "db_demo_1108", publisher_id: "db.runlatch-demo-1108.testnet",
  recipient_id: "db.runlatch-demo-1108.testnet" });
export const providerGas = "50000000000000", providerDeposit = "40960000000000000000000";
export const providerAnswer = `REGISTER PROVIDER ${providerTerms.provider_id} ON ${gateAccount} USING LOCAL NODE SIGNER`;
/** The already-created project is a prerequisite, not an argument or mutation of registration. */
export function checkedProviderProject(value: unknown, now: string) {
  const p = object(value, ["input", "owner_id", "revision", "status", "allocated_authority", "capsule_ids", "created_at_ns", "updated_at_ns"]);
  const input = checkedDemoProject(p.input);
  if (input.expires_at_ns !== "1794335720864706128" || p.owner_id !== parentAccount || p.revision !== "1" || p.status !== "ACTIVE"
    || p.allocated_authority !== "0" || !Array.isArray(p.capsule_ids) || p.capsule_ids.length
    || p.created_at_ns !== "1794162977277689269" || p.updated_at_ns !== p.created_at_ns
    || BigInt(time(now)) < BigInt(p.created_at_ns) || BigInt(now) >= BigInt(input.expires_at_ns)) throw Error("PROVIDER_PROJECT_AUTHORITY_CHANGED");
  return Object.freeze({ input, owner_id: parentAccount, revision: "1", status: "ACTIVE", allocated_authority: "0",
    capsule_ids: Object.freeze([] as string[]), created_at_ns: p.created_at_ns, updated_at_ns: p.updated_at_ns });
}
export function checkedDatabaseProvider(value: unknown) {
  const provider = parseProvider(value);
  if (Object.entries(providerTerms).some(([k, v]) => provider[k as keyof typeof provider] !== v)
    || !provider.active || provider.quote_count !== 0) throw Error("PROVIDER_RECORD_UNPROVEN");
  return Object.freeze(provider);
}
export function providerAction(publicKey: string) {
  return parseSetupAction({ method: "register_provider", signer_id: parentAccount, public_key: publicKey, gas: providerGas, args: providerTerms });
}
export function parseProviderTransaction(input: unknown) {
  const tx = object(parseBoundedJson(canonicalReviewContent(input), 4096),
    ["network", "signer_id", "receiver_id", "public_key", "nonce", "block_hash", "method", "args", "gas", "deposit"]);
  if (tx.network !== "testnet" || tx.signer_id !== parentAccount || tx.receiver_id !== gateAccount
    || tx.method !== "register_provider" || tx.gas !== providerGas || tx.deposit !== providerDeposit) throw Error("PROVIDER_SCOPE_INVALID");
  const action = providerAction(checkedPublicKey(tx.public_key)), args = object(tx.args, ["provider_id", "publisher_id", "recipient_id"]);
  if (canonicalReviewContent(args) !== canonicalReviewContent(providerTerms)) throw Error("PROVIDER_TERMS_CHANGED");
  const nonce = time(tx.nonce); if (nonce === "0") throw Error("PROVIDER_NONCE_INVALID"); decodeBase58_32(tx.block_hash);
  return Object.freeze({ network: "testnet" as const, signer_id: parentAccount, receiver_id: gateAccount, public_key: action.public_key,
    nonce, block_hash: tx.block_hash as string, method: "register_provider" as const, args: providerTerms, gas: providerGas, deposit: providerDeposit });
}
export type ProviderTransaction = ReturnType<typeof parseProviderTransaction>;
function integer(value: bigint, size: number) {
  if (value < 0n || value >= 1n << BigInt(size * 8)) throw Error("PROVIDER_INTEGER_LIMIT");
  const bytes = Buffer.alloc(size); for (let i = 0; i < size; i++) { bytes[i] = Number(value & 255n); value >>= 8n; } return bytes;
}
function vector(bytes: Uint8Array) { return Buffer.concat([integer(BigInt(bytes.length), 4), bytes]); }
export function encodeProviderTransaction(input: unknown) {
  const tx = parseProviderTransaction(input), bytes = Buffer.concat([vector(Buffer.from(tx.signer_id)), Buffer.from([0]),
    decodeBase58_32(tx.public_key.slice(8)), integer(BigInt(tx.nonce), 8), vector(Buffer.from(tx.receiver_id)), decodeBase58_32(tx.block_hash),
    integer(1n, 4), Buffer.from([2]), vector(Buffer.from(tx.method)), vector(Buffer.from(JSON.stringify(tx.args))),
    integer(BigInt(tx.gas), 8), integer(BigInt(tx.deposit), 16)]);
  return Object.freeze({ transaction: tx, transaction_hash: encodeBase58_32(createHash("sha256").update(bytes).digest()),
    get unsigned_bytes() { return new Uint8Array(bytes); } });
}
export function verifyProviderSignature(input: unknown, signature: Uint8Array) {
  const encoded = encodeProviderTransaction(input);
  if (!(signature instanceof Uint8Array) || signature.length !== 64) throw Error("PROVIDER_SIGNATURE_INVALID");
  const key = createPublicKey({ format: "jwk", key: { kty: "OKP", crv: "Ed25519",
    x: Buffer.from(decodeBase58_32(encoded.transaction.public_key.slice(8))).toString("base64url") } });
  if (!verify(null, createHash("sha256").update(encoded.unsigned_bytes).digest(), key, signature)) throw Error("PROVIDER_SIGNATURE_INVALID");
  const bytes = Buffer.concat([encoded.unsigned_bytes, Buffer.from([0]), signature]);
  return Object.freeze({ ...encoded, get signed_bytes() { return new Uint8Array(bytes); } });
}
