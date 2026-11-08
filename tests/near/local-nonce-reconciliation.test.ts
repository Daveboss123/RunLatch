import assert from "node:assert/strict";
import { test } from "node:test";
import { signedRunFixture } from "./helpers/signed-run.ts";
import { reconciliationFixture } from "./helpers/nonce-reconciliation.ts";
import { assertIssuedLocalReconciliation, parseLocalSignedIdentity } from "../../scripts/near/local-nonce-reconciliation.ts";

test("exact finalized payment and current pinned restricted nonce produce only issued local reconciliation", async () => {
  for (const state of ["SETTLED", "SETTLEMENT_FAILED", "DENIED"]) {
    const f = await signedRunFixture(), e = await reconciliationFixture(f, undefined, state), r = e.reconcile();
    assert.equal(r.payment_evidence, state === "DENIED" ? "NOT_ATTEMPTED" : state);
    assert.equal(r.access.nonce, "8"); assert.equal(r.public_execution, false); assert.equal(r.grants_payment_authority, false);
    assert.doesNotThrow(() => assertIssuedLocalReconciliation(r));
    assert.throws(() => assertIssuedLocalReconciliation({ ...r }), /UNISSUED_NONCE_RECONCILIATION/u);
  }
});
test("pending, missing callback/receipts and approval-pending are not nonce advancement evidence", async () => {
  for (const state of ["SETTLEMENT_PENDING", "APPROVAL_PENDING"]) {
    const e = await reconciliationFixture(await signedRunFixture(), undefined, state);
    assert.throws(e.reconcile, /PRIOR_PURCHASE_UNRESOLVED/u);
  }
  const missing = await reconciliationFixture(await signedRunFixture()); missing.input.execution.receipts.splice(2, 1);
  assert.throws(missing.reconcile, /PRIOR_PURCHASE_UNRESOLVED/u);
  const inclusion = await reconciliationFixture(await signedRunFixture()); inclusion.input.execution.final_execution_status = "INCLUDED_FINAL";
  assert.throws(inclusion.reconcile, /PRIOR_TRANSACTION_NOT_FINAL/u);
});
test("observed nonce must be exact in BOTH transaction and pinned key; higher/lower/unsafe numbers are refused", async () => {
  for (const nonce of [7, 9, 9007199254740992, -1, 8.5]) {
    const tx = await reconciliationFixture(await signedRunFixture()); tx.input.execution.transaction.nonce = nonce;
    assert.throws(tx.reconcile, /NONCE_MISMATCH|INVALID_CONTRACT_COUNT/u);
    const key = await reconciliationFixture(await signedRunFixture()); key.input.key_query.nonce = nonce;
    key.input.key_list_query.keys[0].access_key = { ...key.input.key_query };
    assert.throws(key.reconcile);
  }
});
test("mixed final query blocks/heights, missing recovery or broadened permission fail closed", async () => {
  const mixed = await reconciliationFixture(await signedRunFixture()); mixed.input.key_list_query.block_hash = "1".repeat(32);
  assert.throws(mixed.reconcile, /MIXED_RECONCILIATION_BLOCKS/u);
  const height = await reconciliationFixture(await signedRunFixture()); height.input.key_query.block_height--;
  assert.throws(height.reconcile, /MIXED_RECONCILIATION_BLOCKS/u);
  const recovery = await reconciliationFixture(await signedRunFixture()); recovery.input.key_list_query.keys.pop();
  assert.throws(recovery.reconcile, /RECOVERY_ACCESS_NOT_OBSERVED/u);
  const methods = await reconciliationFixture(await signedRunFixture()); methods.input.key_query.permission.FunctionCall.method_names.push("pay");
  assert.throws(methods.reconcile, /ACCESS_KEY_SCOPE_MISMATCH/u);
});
test("wrong captured identity/action/hash/target or unadmitted source cannot reconcile", async () => {
  const f = await signedRunFixture(), e = await reconciliationFixture(f);
  assert.throws(() => parseLocalSignedIdentity({ ...e.identity, transaction_hash: "1".repeat(32) }), /IDENTITY_HASH_MISMATCH/u);
  e.input.execution.transaction.actions[0].FunctionCall.deposit = "1";
  assert.throws(e.reconcile, /TRANSACTION_ACTION_MISMATCH/u);
  const target = await reconciliationFixture(f, e.identity); target.input.target = { ...f.target, contract_id: "other.testnet" };
  assert.throws(target.reconcile, /RECONCILIATION_SCOPE_MISMATCH/u);
  const source = await reconciliationFixture(f, e.identity);
  Object.defineProperty(source.input, "source", { value: "EXPLICIT_TESTNET_HTTP_READBACK" });
  assert.throws(source.reconcile, /PUBLIC_NONCE_RECONCILIATION_NOT_ADMITTED/u);
});
test("rolled-back initiating call permits a new distinct request only, without inventing a denial record", async () => {
  const e = await reconciliationFixture(await signedRunFixture(), undefined, "DENIED");
  e.input.execution.receipts_outcome[0].outcome.status = { Failure: { private: "PRIVATE_CANARY" } };
  e.input.execution.status = { Failure: { private: "PRIVATE_CANARY" } }; e.input.context.purchase = null;
  const r = e.reconcile(); assert.equal(r.record_source, "TRANSACTION_EXECUTION_FAILURE"); assert.equal(r.actual_decision, null);
  assert.equal(r.payment_evidence, "NOT_ATTEMPTED"); assert.ok(!JSON.stringify(r).includes("CANARY"));
});
test("reconciliation never changes reservations, spend, future authority or acceptance and snapshots are immutable", async () => {
  for (const state of ["SETTLED", "SETTLEMENT_FAILED", "SETTLEMENT_PENDING"]) {
    const e = await reconciliationFixture(await signedRunFixture(), undefined, state), before = JSON.stringify(e.input);
    if (state === "SETTLEMENT_PENDING") assert.throws(e.reconcile, /PRIOR_PURCHASE_UNRESOLVED/u);
    else {
      const r = e.reconcile(); assert.ok(Object.isFrozen(r)); assert.ok(Object.isFrozen(r.identity.transaction));
      assert.ok(!("release" in r)); assert.ok(!("human_acceptance" in r));
    }
    assert.equal(JSON.stringify(e.input), before);
  }
});
