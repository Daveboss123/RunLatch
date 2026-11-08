/** Actual local ephemeral signatures, never human/registered/public-account keys. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { Buffer } from "node:buffer";
import { encodeBase58_32 } from "../../scripts/near/base58.ts";
import { encodeUnsignedAgentTransaction } from "../../scripts/near/transaction-codec.ts";
import { inspectSignedAgentEnvelope, verifyAgentSignature } from "../../scripts/near/signature-envelope.ts";

function ephemeral() {
  const keys = generateKeyPairSync("ed25519"), publicJwk = keys.publicKey.export({ format: "jwk" });
  assert.equal(publicJwk.crv, "Ed25519"); assert.equal(typeof publicJwk.x, "string");
  const transaction = { network: "testnet", signer_id: "agent.testnet", receiver_id: "runlatch.testnet", public_key: `ed25519:${encodeBase58_32(Buffer.from(publicJwk.x!, "base64url"))}`,
    nonce: "1", block_hash: "1".repeat(32), method: "submit_purchase", gas: "100000000000000", attached_deposit: "0",
    args: { proposal: { project_id: "client-work", project_revision: "1", capsule_id: "website", request_id: "database", quote_id: "database-one-use", expected_quote_hash: "00".repeat(32) } } };
  const unsigned = encodeUnsignedAgentTransaction(transaction), signature = sign(null, createHash("sha256").update(unsigned.unsigned_bytes).digest(), keys.privateKey);
  return { transaction, unsigned, signature, keys };
}
test("valid ephemeral Ed25519 signature covers SHA256 of exact unsigned bytes, not the envelope", () => {
  const e = ephemeral(), verified = verifyAgentSignature(e.transaction, e.signature), wire = verified.signed_bytes;
  assert.deepEqual(wire.subarray(0, -65), e.unsigned.unsigned_bytes); assert.equal(wire.at(-65), 0);
  assert.deepEqual(wire.subarray(-64), new Uint8Array(e.signature));
  const inspected = inspectSignedAgentEnvelope(wire); assert.equal(inspected.transaction_hash, e.unsigned.transaction_hash);
  assert.equal(inspected.signature_verified, true); assert.equal(inspected.signing_enabled, false); assert.equal(inspected.grants_payment_authority, false);
  assert.equal(inspected.public_execution, false); assert.match(inspected.limitation, /does not establish/u);
});
test("wrong signature, key, transaction or signing unhashed bytes fails closed", () => {
  const e = ephemeral(), other = ephemeral();
  const altered = Buffer.from(e.signature); altered[0] ^= 1;
  for (const signature of [altered, other.signature, Buffer.alloc(64), sign(null, e.unsigned.unsigned_bytes, e.keys.privateKey)]) {
    assert.throws(() => verifyAgentSignature(e.transaction, signature), /^Error: WIRE_SIGNATURE_INVALID$/u);
  }
  for (const transaction of [{...e.transaction, nonce:"2"}, {...e.transaction, receiver_id:"different.testnet"}, {...e.transaction, public_key:other.transaction.public_key}]) {
    assert.throws(() => verifyAgentSignature(transaction, e.signature), /WIRE_SIGNATURE_INVALID/u);
  }
});
test("signature sizes/types/unknown curves/truncation/trailing bytes rejected", () => {
  const e = ephemeral(), wire = Buffer.from(verifyAgentSignature(e.transaction, e.signature).signed_bytes);
  for (const size of [0,32,63,65,3309]) assert.throws(() => verifyAgentSignature(e.transaction, new Uint8Array(size)), /WIRE_SIGNATURE_SIZE/u);
  const differentCurve = Buffer.from(wire); differentCurve[differentCurve.length-65] = 1;
  assert.throws(() => inspectSignedAgentEnvelope(differentCurve), /WIRE_ED25519_SIGNATURE_REQUIRED/u);
  for (const bytes of [wire.subarray(0,65), wire.subarray(0,-1), Buffer.concat([wire, Buffer.from([0])]), new Uint8Array(8258)]) assert.throws(() => inspectSignedAgentEnvelope(bytes));
});
test("signature input and output bytes are detached; no key/secret returned or persisted", () => {
  const e = ephemeral(), r = verifyAgentSignature(e.transaction, e.signature), before = r.signed_bytes;
  e.signature.fill(0); r.signed_bytes.fill(0); e.transaction.args.proposal.request_id = "changed";
  assert.deepEqual(r.signed_bytes, before); assert.equal(r.transaction.args.proposal.request_id, "database");
  assert.ok(!JSON.stringify(r).includes("privateKey")); assert.ok(Object.isFrozen(r));
});
