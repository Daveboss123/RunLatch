/** Local unsigned codec tests, no signer/RPC/Sandbox/public transaction execution. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { encodeBase58_32, decodeBase58_32 } from "../../scripts/near/base58.ts";
import { encodeUnsignedAgentTransaction, decodeUnsignedAgentTransaction, parseUnsignedAgentTransaction } from "../../scripts/near/transaction-codec.ts";

const fixture = () => ({ network: "testnet", signer_id: "agent.testnet", public_key: `ed25519:${"1".repeat(32)}`, nonce: "8", receiver_id: "runlatch.testnet",
  block_hash: "1".repeat(32), method: "submit_purchase", args: { proposal: { project_id: "client-work", project_revision: "1", capsule_id: "website",
    request_id: "database", quote_id: "database-one-use", expected_quote_hash: "00".repeat(32) } }, gas: "100000000000000", attached_deposit: "0" });
test("fixed public base58 preserves leading zeros and all 32-byte patterns", () => {
  for (const b of [new Uint8Array(32), new Uint8Array(32).fill(255), Uint8Array.from({length:32}, (_, i) => i), new Uint8Array(32).fill(1)]) {
    const result = encodeBase58_32(b); assert.deepEqual(decodeBase58_32(result), b);
  }
  assert.equal(encodeBase58_32(new Uint8Array(32)), "1".repeat(32));
  for (const input of ["1".repeat(31), "1".repeat(33), "z".repeat(44), "0".repeat(32), "O".repeat(32), "11 ", 1, null]) assert.throws(() => decodeBase58_32(input));
  assert.throws(() => encodeBase58_32(new Uint8Array(64)), /WIRE_BASE58_SIZE/u);
});
test("ordinary V0 is unprefixed, one FunctionCall tag2/Ed25519 tag0 and zero u128 deposit", () => {
  const r = encodeUnsignedAgentTransaction(fixture()), bytes = Buffer.from(r.unsigned_bytes);
  assert.equal(bytes.readUInt32LE(), 13); assert.equal(bytes.subarray(4, 17).toString(), "agent.testnet");
  assert.equal(bytes[17], 0); assert.equal(bytes.readBigUInt64LE(50), 8n);
  const actionOffset = 58 + 4 + Buffer.byteLength("runlatch.testnet") + 32;
  assert.equal(bytes.readUInt32LE(actionOffset), 1); assert.equal(bytes[actionOffset + 4], 2);
  assert.deepEqual(bytes.subarray(-16), Buffer.alloc(16));
  assert.equal(r.transaction_hash, encodeBase58_32(createHash("sha256").update(bytes).digest()));
  assert.deepEqual(decodeUnsignedAgentTransaction(bytes), parseUnsignedAgentTransaction(fixture()));
  assert.equal(r.signing_enabled, false); assert.equal(r.public_execution, false); assert.equal(r.grants_payment_authority, false);
});
test("nonce/revision >2^53 through u64 max remains exact strings and bytes", () => {
  for (const nonce of ["9007199254740993", ((1n << 64n) - 1n).toString()]) {
    const input = fixture(); input.nonce = nonce; input.args.proposal.project_revision = nonce;
    const r = encodeUnsignedAgentTransaction(input), bytes = Buffer.from(r.unsigned_bytes);
    assert.equal(bytes.readBigUInt64LE(50).toString(), nonce); assert.deepEqual(decodeUnsignedAgentTransaction(bytes), r.transaction);
  }
  for (const nonce of ["0", "18446744073709551616", "01", "1e3", "-1", 9007199254740992]) assert.throws(() => encodeUnsignedAgentTransaction({...fixture(), nonce}));
});
test("every public action/identity/args/gas/nonce/block field changes the hash", () => {
  const input = fixture(), original = encodeUnsignedAgentTransaction(input).transaction_hash;
  for (const value of [{...input, signer_id:"other.testnet"}, {...input, receiver_id:"other.testnet"}, {...input, public_key:`ed25519:${encodeBase58_32(new Uint8Array(32).fill(3))}`},
    {...input, nonce:"9"}, {...input, block_hash:encodeBase58_32(new Uint8Array(32).fill(1))}, {...input, gas:"100000000000001"},
    {...input, args:{proposal:{...input.args.proposal, quote_id:"different"}}}]) assert.notEqual(encodeUnsignedAgentTransaction(value).transaction_hash, original);
});
test("no owner/admin/arbitrary transfer/deposit/network/gas-key/version/key fallback", () => {
  const input = fixture();
  for (const value of [{...input, network:"mainnet"}, {...input, signer_id:"agent.near"}, {...input, receiver_id:input.signer_id},
    {...input, method:"approve_purchase"}, {...input, method:"pay"}, {...input, attached_deposit:"1"}, {...input, attached_deposit:0}, {...input, nonce_index:0},
    {...input, version:1}, {...input, actions:[]}, {...input, secret_key:"NOT_A_KEY"}, {...input, public_key:`secp256k1:${"1".repeat(64)}`},
    {...input, gas:"0"}, {...input, gas:"300000000000001"}, {...input, args:{proposal:{...input.args.proposal, recipient_id:"attacker.testnet"}}}]) assert.throws(() => encodeUnsignedAgentTransaction(value));
});
test("input/result detached/frozen and each byte view is a copy", () => {
  const input = fixture(), r = encodeUnsignedAgentTransaction(input), before = r.unsigned_bytes;
  input.args.proposal.request_id = "mutated"; r.unsigned_bytes.fill(0);
  assert.deepEqual(r.unsigned_bytes, before); assert.equal(r.transaction.args.proposal.request_id, "database");
  assert.ok(Object.isFrozen(r)); assert.ok(Object.isFrozen(r.transaction.args.proposal));
  assert.throws(() => { (r.transaction.args.proposal as unknown as Record<string, unknown>).request_id = "cannot-mutate"; });
});
test("getters/toJSON/cycles/oversize/missing/extra args rejected without executing supplied code", () => {
  let invoked = false;
  assert.throws(() => encodeUnsignedAgentTransaction({...fixture(), get args() { invoked = true; return {}; }})); assert.equal(invoked, false);
  assert.throws(() => encodeUnsignedAgentTransaction({...fixture(), toJSON() { invoked = true; return {}; }})); assert.equal(invoked, false);
  for (const value of [{...fixture(), args:{}}, {...fixture(), args:{proposal:{...fixture().args.proposal, quote_id:"x".repeat(9000)}}},
    {...fixture(), args:{proposal:{...fixture().args.proposal, request_id:"x".repeat(65)}}}]) assert.throws(() => encodeUnsignedAgentTransaction(value));
});
test("decoder rejects every truncation and any signed/trailing data", () => {
  const bytes = encodeUnsignedAgentTransaction(fixture()).unsigned_bytes;
  for (let i = 0; i < bytes.byteLength; i++) assert.throws(() => decodeUnsignedAgentTransaction(bytes.subarray(0, i)));
  for (const tail of [Buffer.from([0]), Buffer.alloc(65)]) assert.throws(() => decodeUnsignedAgentTransaction(Buffer.concat([bytes, tail])), /WIRE_TRAILING_BYTES/u);
  assert.throws(() => decodeUnsignedAgentTransaction(new Uint8Array(8193)), /WIRE_TRANSACTION_LIMIT/u);
});
test("decoder rejects V1/foreign key/action count/action tag/deposit and malformed UTF8 lengths", () => {
  const bytes = Buffer.from(encodeUnsignedAgentTransaction(fixture()).unsigned_bytes), actionOffset = 110;
  for (const [offset, value] of [[0,1], [17,1], [actionOffset,2], [actionOffset+4,3], [bytes.length-16,1], [4,255]] as const) {
    const altered = Buffer.from(bytes); altered[offset] = value; assert.throws(() => decodeUnsignedAgentTransaction(altered));
  }
  const huge = Buffer.from(bytes); huge.writeUInt32LE(0xffff_ffff); assert.throws(() => decodeUnsignedAgentTransaction(huge), /WIRE_STRING_LIMIT/u);
});
test("equivalent object key order encodes identical bytes, but decoder never accepts duplicate keys", () => {
  const input = fixture(), reversed = {...input, args:{proposal:Object.fromEntries(Object.entries(input.args.proposal).reverse())}};
  const r = encodeUnsignedAgentTransaction(input); assert.deepEqual(encodeUnsignedAgentTransaction(reversed).unsigned_bytes, r.unsigned_bytes);
  // Replace a same-length field with its already existing name to create a valid-JSON duplicate.
  const bytes = Buffer.from(r.unsigned_bytes), marker = Buffer.from('"project_id"');
  const offset = bytes.indexOf(marker); assert.ok(offset > 0);
  Buffer.from('"request_id"').copy(bytes, offset); assert.throws(() => decodeUnsignedAgentTransaction(bytes), /DUPLICATE_CONTRACT_FIELD/u);
});
test("decoder rejects semantically equal noncanonical argument bytes", () => {
  const bytes = Buffer.from(encodeUnsignedAgentTransaction(fixture()).unsigned_bytes), argsLengthOffset = 134, argsStart = 138;
  const altered = Buffer.concat([bytes.subarray(0, argsStart), Buffer.from(" "), bytes.subarray(argsStart)]);
  altered.writeUInt32LE(bytes.readUInt32LE(argsLengthOffset) + 1, argsLengthOffset);
  assert.throws(() => decodeUnsignedAgentTransaction(altered), /WIRE_NONCANONICAL_ARGUMENTS/u);
});
