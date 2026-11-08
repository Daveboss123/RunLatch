/** Offline cross-language test bridge. Bounded stdin/stdout only; no key/signature/network input.
 * The zero signature tail is INVALID and exists solely to compare the SDK's signed-envelope layout.
 */
import { Buffer } from "node:buffer";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { fail, list, parseBoundedJson } from "../../src/lib/near/records.ts";
import { decodeUnsignedAgentTransaction, encodeUnsignedAgentTransaction } from "./transaction-codec.ts";
import { encodeBase58_32 } from "./base58.ts";
import { inspectSignedAgentEnvelope, verifyAgentSignature } from "./signature-envelope.ts";
const parts: Buffer[] = []; let size = 0;
try {
  for await (const part of process.stdin) {
    const b = Buffer.from(part); size += b.byteLength;
    if (size > 32768) fail("PARITY_INPUT_LIMIT"); parts.push(b);
  }
  const values = list(parseBoundedJson(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts)), 32768), 24);
  if (values.length === 0) fail("PARITY_CASES_REQUIRED");
  const results = values.map(input => {
    const result = encodeUnsignedAgentTransaction(input), bytes = result.unsigned_bytes;
    const decoded = decodeUnsignedAgentTransaction(bytes);
    if (JSON.stringify(decoded) !== JSON.stringify(result.transaction)) fail("PARITY_ROUND_TRIP");
    return { transaction_hash: result.transaction_hash, invalid_placeholder_wire_base64: Buffer.concat([bytes, Buffer.alloc(65)]).toString("base64") };
  });
  // One actual LOCAL ephemeral signature, independently verified by Rust. No secret export/input/persistence.
  const keys = generateKeyPairSync("ed25519"), jwk = keys.publicKey.export({ format: "jwk" });
  if (jwk.crv !== "Ed25519") fail("PARITY_PUBLIC_KEY_TYPE");
  const publicX = typeof jwk.x === "string" ? jwk.x : fail("PARITY_PUBLIC_KEY_TYPE");
  const first = encodeUnsignedAgentTransaction(values[0]).transaction;
  const transaction = { ...first, public_key: `ed25519:${encodeBase58_32(Buffer.from(publicX, "base64url"))}` };
  const unsigned = encodeUnsignedAgentTransaction(transaction);
  const signature = sign(null, createHash("sha256").update(unsigned.unsigned_bytes).digest(), keys.privateKey);
  const verified = verifyAgentSignature(transaction, signature);
  if (inspectSignedAgentEnvelope(verified.signed_bytes).transaction_hash !== verified.transaction_hash) fail("PARITY_SIGNATURE_INSPECTION");
  const ephemeral = { public_key: transaction.public_key, signature_bytes: [...signature], transaction_hash: verified.transaction_hash,
    signed_wire_base64: Buffer.from(verified.signed_bytes).toString("base64") };
  const output = JSON.stringify({ source: "LOCAL_CODEC_PARITY_WITH_EPHEMERAL_SIGNATURE", public_execution: false, results, ephemeral });
  if (Buffer.byteLength(output) > 65536) fail("PARITY_OUTPUT_LIMIT");
  process.stdout.write(output);
} catch {
  process.stderr.write("LOCAL_CODEC_PARITY_FAILED\n"); process.exitCode = 1;
}
