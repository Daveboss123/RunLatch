/** Node-only, unsigned V0 codec. No signing, network, keystore, generic actions or payment authority.
 * Reviewed source and independent Rust parity: docs/TESTNET_TRANSACTION_CODEC.md.
 */
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { fail, object, parseBoundedJson, parseProposal, time } from "../../src/lib/near/records.ts";
import { publicKey } from "../../src/lib/near/testnet-evidence.ts";
import { namedTestnetAccount } from "../../src/lib/near/testnet-target.ts";
import { canonicalReviewContent } from "../../src/lib/near/review-content.ts";
import { decodeBase58_32, encodeBase58_32 } from "./base58.ts";

const MAX_WIRE = 8192, MAX_ARGS = 4096;
export function parseUnsignedAgentTransaction(value: unknown) {
  // Detach strict JSON data, reject getters/cycles/extra fields before encoding any action.
  const v = object(parseBoundedJson(canonicalReviewContent(value), MAX_WIRE), ["network", "signer_id", "public_key", "nonce", "receiver_id",
    "block_hash", "method", "args", "gas", "attached_deposit"]);
  if (v.network !== "testnet" || v.method !== "submit_purchase" || v.attached_deposit !== "0") return fail("WIRE_RESTRICTED_ACTION_REQUIRED");
  const signer = namedTestnetAccount(v.signer_id), receiver = namedTestnetAccount(v.receiver_id), key = publicKey(v.public_key);
  const nonce = time(v.nonce), gas = time(v.gas), args = object(v.args, ["proposal"]);
  if (signer === receiver || nonce === "0" || gas === "0" || BigInt(gas) > 300_000_000_000_000n) return fail("WIRE_TRANSACTION_BOUNDS");
  decodeBase58_32(key.slice(8)); decodeBase58_32(v.block_hash);
  return Object.freeze({ network: "testnet" as const, signer_id: signer, public_key: key, nonce, receiver_id: receiver,
    block_hash: v.block_hash as string, method: "submit_purchase" as const, args: Object.freeze({ proposal: parseProposal(args.proposal) }),
    gas, attached_deposit: "0" as const });
}
export type UnsignedAgentTransaction = ReturnType<typeof parseUnsignedAgentTransaction>;
function integer(value: bigint, size: number): Buffer {
  if (value < 0n || value >= (1n << BigInt(size * 8))) return fail("WIRE_INTEGER_LIMIT");
  const b = Buffer.alloc(size);
  for (let i = 0; i < size; i++) { b[i] = Number(value & 255n); value >>= 8n; }
  return b;
}
function vector(bytes: Uint8Array): Buffer { return Buffer.concat([integer(BigInt(bytes.byteLength), 4), bytes]); }
function string(value: string): Buffer { return vector(Buffer.from(value, "utf8")); }
function encodeEnvelope(tx: UnsignedAgentTransaction): Buffer {
  const args = Buffer.from(canonicalReviewContent(tx.args), "utf8");
  if (args.byteLength > MAX_ARGS) return fail("WIRE_ARGUMENT_LIMIT");
  // Transaction::V0 has NO enum prefix. PublicKey::ED25519 = 0; Action::FunctionCall = 2.
  return Buffer.concat([string(tx.signer_id), Buffer.from([0]), decodeBase58_32(tx.public_key.slice(8)), integer(BigInt(tx.nonce), 8),
    string(tx.receiver_id), decodeBase58_32(tx.block_hash), integer(1n, 4), Buffer.from([2]), string(tx.method), vector(args),
    integer(BigInt(tx.gas), 8), integer(0n, 16)]);
}
export function encodeUnsignedAgentTransaction(input: unknown) {
  const transaction = parseUnsignedAgentTransaction(input), bytes = encodeEnvelope(transaction);
  if (bytes.byteLength > MAX_WIRE) return fail("WIRE_TRANSACTION_LIMIT");
  const transactionHash = encodeBase58_32(createHash("sha256").update(bytes).digest());
  return Object.freeze({ source: "LOCAL_UNSIGNED_V0_TRANSACTION" as const, transaction, transaction_hash: transactionHash,
    // Copies prevent a caller from changing the bytes behind the captured identity.
    get unsigned_bytes(): Uint8Array { return new Uint8Array(bytes); },
    signing_enabled: false as const, grants_payment_authority: false as const, public_execution: false as const });
}

/** Parse exact unsigned bytes before any future signer is admitted; trailing/signed bytes are rejected. */
export function decodeUnsignedAgentTransaction(input: Uint8Array): UnsignedAgentTransaction {
  if (!(input instanceof Uint8Array) || input.byteLength > MAX_WIRE) return fail("WIRE_TRANSACTION_LIMIT");
  const bytes = Buffer.from(input); let offset = 0;
  function take(size: number): Buffer {
    if (!Number.isSafeInteger(size) || size < 0 || size > bytes.byteLength - offset) return fail("WIRE_TRUNCATED");
    const result = bytes.subarray(offset, offset + size); offset += size; return result;
  }
  function unsigned(size: number): bigint {
    const b = take(size); let n = 0n;
    for (let i = size - 1; i >= 0; i--) n = (n << 8n) | BigInt(b[i]);
    return n;
  }
  function text(max: number): string {
    const size = Number(unsigned(4));
    if (size > max) return fail("WIRE_STRING_LIMIT");
    try { return new TextDecoder("utf-8", { fatal: true }).decode(take(size)); }
    catch { return fail("WIRE_TEXT_INVALID"); }
  }
  const signer = text(64);
  if (unsigned(1) !== 0n) return fail("WIRE_ED25519_REQUIRED");
  const key = `ed25519:${encodeBase58_32(take(32))}`, nonce = unsigned(8).toString(), receiver = text(64), blockHash = encodeBase58_32(take(32));
  if (unsigned(4) !== 1n || unsigned(1) !== 2n) return fail("WIRE_SINGLE_FUNCTION_CALL_REQUIRED");
  const method = text(64), argsText = text(MAX_ARGS), gas = unsigned(8).toString(), deposit = unsigned(16).toString();
  if (offset !== bytes.byteLength) return fail("WIRE_TRAILING_BYTES");
  const tx = parseUnsignedAgentTransaction({ network: "testnet", signer_id: signer, public_key: key, nonce, receiver_id: receiver,
    block_hash: blockHash, method, args: parseBoundedJson(argsText, MAX_ARGS), gas, attached_deposit: deposit });
  if (!encodeEnvelope(tx).equals(bytes)) return fail("WIRE_NONCANONICAL_ARGUMENTS");
  return tx;
}
