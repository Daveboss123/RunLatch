/** Node-only signature consistency. Accepts PUBLIC signature bytes, never secrets or signing ports.
 * A valid signature is not owner approval, key permission readback, submission or settlement.
 */
import { createHash, createPublicKey, verify } from "node:crypto";
import { Buffer } from "node:buffer";
import { fail } from "../../src/lib/near/records.ts";
import { decodeBase58_32 } from "./base58.ts";
import { decodeUnsignedAgentTransaction, encodeUnsignedAgentTransaction } from "./transaction-codec.ts";

export function verifyAgentSignature(input: unknown, inputSignature: Uint8Array) {
  if (!(inputSignature instanceof Uint8Array) || inputSignature.byteLength !== 64) return fail("WIRE_SIGNATURE_SIZE");
  const signature = Buffer.from(inputSignature), unsigned = encodeUnsignedAgentTransaction(input), bytes = unsigned.unsigned_bytes;
  const hash = createHash("sha256").update(bytes).digest();
  try {
    // Supported public JWK import, not handwritten DER or cryptographic implementation.
    const key = createPublicKey({ format: "jwk", key: { kty: "OKP", crv: "Ed25519",
      x: Buffer.from(decodeBase58_32(unsigned.transaction.public_key.slice(8))).toString("base64url") } });
    if (!verify(null, hash, key, signature)) return fail("WIRE_SIGNATURE_INVALID");
  } catch { return fail("WIRE_SIGNATURE_INVALID"); }
  const signed = Buffer.concat([bytes, Buffer.from([0]), signature]);
  return Object.freeze({ source: "LOCAL_VERIFIED_ED25519_ENVELOPE" as const, transaction: unsigned.transaction, transaction_hash: unsigned.transaction_hash,
    get signed_bytes(): Uint8Array { return new Uint8Array(signed); }, signature_verified: true as const,
    signing_enabled: false as const, grants_payment_authority: false as const, public_execution: false as const,
    limitation: "Signature verifies exact V0 bytes only; it does not establish account/key permissions, human consent, submission, settlement or delivery." });
}
export function inspectSignedAgentEnvelope(input: Uint8Array) {
  if (!(input instanceof Uint8Array) || input.byteLength <= 65 || input.byteLength > 8257) return fail("WIRE_SIGNED_SIZE");
  const bytes = Buffer.from(input), boundary = bytes.byteLength - 65;
  if (bytes[boundary] !== 0) return fail("WIRE_ED25519_SIGNATURE_REQUIRED");
  const unsigned = decodeUnsignedAgentTransaction(bytes.subarray(0, boundary));
  return verifyAgentSignature(unsigned, bytes.subarray(boundary + 1));
}
