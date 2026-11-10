import assert from "node:assert/strict";
import { test } from "node:test";
import { confirmFreshAgentKeyInstallReview, prepareAgentKeyInstallReview } from "../../src/lib/near/agent-key-review.ts";
import { createTestnetReader } from "../../src/lib/near/testnet-rpc.ts";
import { scope } from "./helpers/action-review.ts";
import { setupFixture, setupTransport } from "./helpers/setup-review.ts";
import { target } from "./helpers/testnet-evidence.ts";

const context = () => ({ block: setupFixture().context.block, access_keys: { keys: [{ public_key: scope.recovery_public_key,
  access_key: { nonce: 1, permission: "FullAccess" } }] as unknown[] }, transport_source: "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE" as const });

test("restricted key install review binds recovery signer, agent account, Gate, method and finite allowance", async () => {
  const review = await prepareAgentKeyInstallReview(target, scope, context());
  assert.equal(review.call.signer_id, scope.agent_id); assert.equal(review.call.public_key, scope.recovery_public_key);
  assert.equal(review.call.receiver_id, scope.agent_id); assert.equal(review.call.contract_id, target.contract_id);
  assert.deepEqual(review.call.action, { type: "AddKey", params: { publicKey: scope.public_key, accessKey: { nonce: 0,
    permission: { receiverId: target.contract_id, allowance: scope.max_allowance, methodNames: ["submit_purchase"] } } } });
  assert.equal(review.signing_enabled, false); assert.equal(review.grants_payment_authority, false);
});

test("install review rejects existing restricted key, unknown authority and reconstructed confirmations", async () => {
  const existing = context(); existing.access_keys.keys.push({ public_key: scope.public_key,
    access_key: { nonce: 0, permission: { FunctionCall: { allowance: scope.max_allowance, receiver_id: target.contract_id, method_names: ["submit_purchase"] } } } });
  await assert.rejects(prepareAgentKeyInstallReview(target, scope, existing), /ALREADY_EXISTS/u);
  const unknown = context(); unknown.access_keys.keys.push({ public_key: `ed25519:${"3".repeat(44)}`, access_key: { nonce: 2, permission: "FullAccess" } });
  await assert.rejects(prepareAgentKeyInstallReview(target, scope, unknown), /AUTHORITY_UNEXPECTED/u);
  const original = await prepareAgentKeyInstallReview(target, scope, context()), fresh = await prepareAgentKeyInstallReview(target, scope, context());
  assert.equal(confirmFreshAgentKeyInstallReview(original, fresh, { review_hash: original.review_hash, consent: true }).call.action.type, "AddKey");
  assert.throws(() => confirmFreshAgentKeyInstallReview({ ...original }, fresh, { review_hash: original.review_hash, consent: true }), /UNISSUED/u);
});

test("testnet reader composes exact install review from one final-block access-key list", async () => {
  const f = setupFixture(), rpc = setupTransport(f), review = await createTestnetReader(target, rpc.transport).readAgentKeyInstallReview(scope);
  assert.equal(review.call.action.params.accessKey.permission.receiverId, target.contract_id);
  assert.equal(rpc.calls.filter(call => call.method === "query" && call.params.request_type === "view_access_key_list").length, 1);
  assert.ok(rpc.calls.every(call => ["status", "block", "query"].includes(call.method)));
});
