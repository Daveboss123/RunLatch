/** Synthetic owner controls/evidence, never actual testnet settlement or wallet signatures. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOwnerAction, prepareOwnerReview, confirmFreshOwnerReview } from "../../src/lib/near/owner-review.ts";
import { createTestnetReader } from "../../src/lib/near/testnet-rpc.ts";
import { validateResourceFixture } from "../../src/lib/validation/resource.ts";
import { commercialQuoteHash } from "../../src/lib/purchasing/hashing.ts";
import { ownerFixture, ownerTransport } from "./helpers/owner-review.ts";
import { target } from "./helpers/testnet-evidence.ts";

test("owner project status/revision uses exact Rust args/one yocto and never rewrites capsule policy", async () => {
  const d = await ownerFixture();
  for (const a of [d.actions.project, d.actions.revision]) {
    const t = ownerTransport(d), r = await createTestnetReader(target, t.transport).readOwnerReview(a);
    assert.deepEqual(r.call.args, a.args); assert.equal(r.call.attached_deposit, "1"); assert.equal(r.projected_project_revision, "2");
    assert.equal(r.signing_enabled, false); assert.equal(r.grants_payment_authority, false); assert.equal(r.financials, null); assert.equal(t.calls.length, 9);
  }
});
test("project no-op and terminal/overflow/revision behavior matches current contract review", async () => {
  const d = await ownerFixture(), context = { ...d.context, snapshot: null };
  assert.equal((await prepareOwnerReview(target, { ...d.actions.project, args: { ...d.actions.project.args, status: "ACTIVE" } }, context)).projected_project_revision, "1");
  for (const status of ["COMPLETED", "CANCELLED"]) {
    const project = { ...d.snapshot.project, status };
    await assert.rejects(prepareOwnerReview(target, d.actions.project, { ...context, project }), /PROJECT_TERMINAL/u);
    assert.equal((await prepareOwnerReview(target, { ...d.actions.project, args: { ...d.actions.project.args, status } }, { ...context, project })).projected_project_revision, "1");
  }
  await assert.rejects(prepareOwnerReview(target, { ...d.actions.revision, args: { ...d.actions.revision.args, expected_revision: "2" } }, context), /PROJECT_REVISION_CONFLICT/u);
  const max = ((1n << 64n) - 1n).toString();
  await assert.rejects(prepareOwnerReview(target, { ...d.actions.revision, args: { ...d.actions.revision.args, expected_revision: max } },
    { ...context, project: { ...d.snapshot.project, revision: max } }), /INVALID_CONTRACT_TIME/u);
});
test("provider suspension reviews canonical identity only, with no new recipient or funding", async () => {
  const d = await ownerFixture(), t = ownerTransport(d), r = await createTestnetReader(target, t.transport).readOwnerReview(d.actions.provider);
  assert.deepEqual(r.call.args, d.actions.provider.args); assert.equal(r.reviewed_state.provider?.publisher_id, "publisher.testnet");
  assert.equal(r.call.attached_deposit, "1"); assert.equal(r.potential_owner_return, null); assert.equal(t.calls.length, 9);
});
test("pause/revoke keeps pending money and does not report settlement/release/resend", async () => {
  const d = await ownerFixture("SETTLEMENT_PENDING");
  for (const a of [d.actions.pause, d.actions.revoke]) {
    const t = ownerTransport(d), r = await createTestnetReader(target, t.transport).readOwnerReview(a);
    assert.equal(r.financials?.reserved, "50"); assert.equal(r.financials?.spent, "0");
    assert.equal(r.settlement_verification, "UNVERIFIED_WITHOUT_TRANSACTION_TRANSFER_CALLBACK_READBACK"); assert.equal(t.calls.length, 10);
  }
  assert.equal(d.snapshot.capsule.status, "ACTIVE"); assert.equal(d.snapshot.purchases[0].status, "SETTLEMENT_PENDING");
});
test("pause expiry/revoke terminal behavior is fail closed without disallowing expired revocation", async () => {
  const d = await ownerFixture();
  const expired = { ...d.context, block: { ...d.context.block, timestamp_ns: d.snapshot.capsule.policy.expires_at_ns } };
  await assert.rejects(prepareOwnerReview(target, d.actions.pause, expired), /OWNER_REVIEW_EXPIRED/u);
  assert.equal((await prepareOwnerReview(target, d.actions.revoke, expired)).signing_enabled, false);
  for (const status of ["COMPLETED", "CLOSED"]) {
    const context = { ...d.context, snapshot: { ...d.snapshot, capsule: { ...d.snapshot.capsule, status } } };
    await assert.rejects(prepareOwnerReview(target, d.actions.pause, context), /CAPSULE_CANNOT_RESUME/u);
    await assert.rejects(prepareOwnerReview(target, d.actions.revoke, context), /CAPSULE_TERMINAL/u);
  }
});
test("resume stale project never implies restored policy authority", async () => {
  const d = await ownerFixture(), project = { ...d.snapshot.project, revision: "2", status: "PAUSED" };
  const context = { ...d.context, project, snapshot: { ...d.snapshot, project } };
  const r = await prepareOwnerReview(target, { ...d.actions.pause, args: { ...d.actions.pause.args, paused: false } }, context);
  assert.equal(r.reviewed_state.project?.revision, "2"); assert.equal(r.grants_payment_authority, false);
  assert.equal(d.snapshot.capsule.policy.project_revision, "1");
});
test("reject/cancel only approval-pending requests; stale authority and other reservations are retained", async () => {
  const d = await ownerFixture("APPROVAL_PENDING"), project = { ...d.snapshot.project, revision: "2", status: "CANCELLED" };
  const context = { ...d.context, project, snapshot: { ...d.snapshot, project, capsule: { ...d.snapshot.capsule, status: "REVOKED" } } };
  for (const a of [d.actions.reject, d.actions.cancel]) {
    const r = await prepareOwnerReview(target, a, context); assert.deepEqual(r.call.args, a.args); assert.equal(r.financials?.reserved, "0");
  }
  for (const state of ["SETTLEMENT_PENDING", "SETTLED", "DENIED", "CANCELLED", "SETTLEMENT_FAILED"]) {
    const other = await ownerFixture(state);
    await assert.rejects(prepareOwnerReview(target, other.actions.cancel, other.context), /REQUEST_NOT_PENDING/u);
  }
});
test("close derives only unused-to-commit funds; it is a separate potential owner return", async () => {
  const d = await ownerFixture(), context = { ...d.context, snapshot: { ...d.snapshot, capsule: { ...d.snapshot.capsule, status: "REVOKED" } } };
  const r = await prepareOwnerReview(target, d.actions.close, context);
  assert.equal(r.potential_owner_return, "250"); assert.equal(r.call.attached_deposit, "1"); assert.equal(r.financials?.spent, "50");
  assert.equal(r.signing_enabled, false); assert.match(r.limitation, /never a quality refund/u);
  await assert.rejects(prepareOwnerReview(target, d.actions.close, d.context), /CAPSULE_ACTIVE/u);
});
test("close blocks unresolved purchase/refund, already closed and active-before-expiry", async () => {
  const d = await ownerFixture("SETTLEMENT_PENDING");
  await assert.rejects(prepareOwnerReview(target, d.actions.close, { ...d.context, snapshot: { ...d.snapshot, capsule: { ...d.snapshot.capsule, status: "REVOKED" } } }), /PENDING_SETTLEMENT_BLOCKS_CLOSE/u);
  const paid = await ownerFixture();
  await assert.rejects(prepareOwnerReview(target, paid.actions.close, { ...paid.context, snapshot: { ...paid.snapshot, capsule: { ...paid.snapshot.capsule, status: "CLOSED" } } }), /CAPSULE_ALREADY_CLOSING_OR_CLOSED/u);
  const expired = { ...paid.context, block: { ...paid.context.block, timestamp_ns: paid.snapshot.capsule.policy.expires_at_ns } };
  assert.equal((await prepareOwnerReview(target, paid.actions.close, expired)).potential_owner_return, "250");
});
test("owner-recorded fixture provisioning keeps separate hashes/trust and cannot settle payment", async () => {
  const d = await ownerFixture(), t = ownerTransport(d), r = await createTestnetReader(target, t.transport).readOwnerReview(d.actions.provisioning);
  assert.deepEqual(r.call.args, d.actions.provisioning.args); assert.equal(r.local_fixture_artifact_verified, false);
  assert.equal(r.settlement_verification, "UNVERIFIED_WITHOUT_TRANSACTION_TRANSFER_CALLBACK_READBACK"); assert.equal(r.call.attached_deposit, "1");
});
test("provisioning rejects unknown/pending/failed-success claims, wrong request and future timestamps", async () => {
  for (const state of ["SETTLEMENT_PENDING", "APPROVAL_PENDING", "SETTLEMENT_FAILED"]) {
    const d = await ownerFixture(state); await assert.rejects(prepareOwnerReview(target, d.actions.provisioning, d.context), /PAYMENT_UNRESOLVED|PROVISIONING_REQUIRES/u);
  }
  const d = await ownerFixture();
  for (const args of [{ ...d.actions.provisioning.args, expected_request_hash: "aa".repeat(32) },
    { ...d.actions.provisioning.args, evidence: { ...d.actions.provisioning.args.evidence, observed_at_ns: "31" } }]) {
    await assert.rejects(prepareOwnerReview(target, { ...d.actions.provisioning, args }, d.context));
  }
  const failed = await ownerFixture("SETTLEMENT_FAILED");
  assert.equal((await prepareOwnerReview(target, { ...failed.actions.provisioning, args: { ...failed.actions.provisioning.args, evidence: { ...failed.actions.provisioning.args.evidence, status: "FAILED", artifact_hash: null } } }, failed.context)).signing_enabled, false);
});
test("provisioning append is exact previous-record-bound and limited to two; acceptance does not freeze evidence", async () => {
  const d = await ownerFixture(), previous = { input: d.actions.provisioning.args.evidence, recorded_by: target.operator_id, recorded_at_ns: "21", record_hash: "aa".repeat(32),
    source: "OWNER_RECORDED_OFFCHAIN_EVIDENCE_NOT_PROVIDER_SIGNATURE" };
  const snapshot = { ...d.snapshot, provisioning: [{ request_id: "database", records: [previous] }] };
  const context = { ...d.context, snapshot };
  await assert.rejects(prepareOwnerReview(target, d.actions.provisioning, context), /EVIDENCE_REVISION_CONFLICT/u);
  assert.ok(await prepareOwnerReview(target, { ...d.actions.provisioning, args: { ...d.actions.provisioning.args, expected_previous_record_hash: previous.record_hash } }, context));
  await assert.rejects(prepareOwnerReview(target, d.actions.provisioning, { ...context, snapshot: { ...snapshot, provisioning: [{ request_id: "database", records: [previous, previous] }] } }), /PROVISIONING_HISTORY_LIMIT/u);
});
test("task check recomputes the exact caller-selected fixture bytes; never fetches a URL or uploads artifacts", async () => {
  const d = await ownerFixture(), t = ownerTransport(d), r = await createTestnetReader(target, t.transport).readOwnerReview(d.actions.check, { artifact: d.artifact });
  assert.equal(r.local_fixture_artifact_verified, true); assert.deepEqual(r.call.args, d.actions.check.args);
  assert.equal(r.signing_enabled, false); assert.ok(!JSON.stringify(r).includes('"health_body"'));
  assert.ok(t.calls.every(c => !JSON.stringify(c).includes("health_body"))); assert.equal(t.calls.length, 10);
});
test("task check refuses a forged report/status/check order, altered or missing artifact and unsupported criteria", async () => {
  const d = await ownerFixture();
  await assert.rejects(prepareOwnerReview(target, d.actions.check, d.context), /EXACT_TASK_ARTIFACT_REQUIRED/u);
  await assert.rejects(prepareOwnerReview(target, d.actions.check, d.context, { artifact: new Uint8Array([1]) }), /EXACT_LOCAL_TASK_REPORT_MISMATCH/u);
  for (const report of [{ ...d.report, evidence_hash: "aa".repeat(32) }, { ...d.report, criteria_hash: "aa".repeat(32) },
    { ...d.report, status: "VALIDATION_FAILED" }, { ...d.report, checks: [...d.report.checks].reverse() }, { ...d.report, source: "REAL_PROVIDER" }]) {
    await assert.rejects(prepareOwnerReview(target, { ...d.actions.check, args: { ...d.actions.check.args, report } }, d.context, { artifact: d.artifact }));
  }
});
test("task errors/failures remain explicit; pass never applies to failed settlement", async () => {
  const d = await ownerFixture("SETTLEMENT_FAILED"), binding = { project_id: "client-work", resource_key: "booking-database" };
  await assert.rejects(prepareOwnerReview(target, d.actions.check, d.context, { artifact: d.artifact }), /TASK_PASS_REQUIRES_SETTLED_PAYMENT/u);
  for (const artifact of [null, new Uint8Array()]) {
    const report = await validateResourceFixture(artifact, binding, "21");
    const r = await prepareOwnerReview(target, { ...d.actions.check, args: { ...d.actions.check.args, report } }, d.context, { artifact });
    assert.equal(r.local_fixture_artifact_verified, true); assert.equal(r.action.method, "record_task_check");
  }
});
test("pending settlement/refund and an existing outcome block final task check", async () => {
  const d = await ownerFixture("SETTLEMENT_PENDING");
  await assert.rejects(prepareOwnerReview(target, d.actions.check, d.context, { artifact: d.artifact }), /PENDING_SETTLEMENT_BLOCKS_VALIDATION/u);
  const paid = await ownerFixture();
  await assert.rejects(prepareOwnerReview(target, paid.actions.check, { ...paid.context, snapshot: { ...paid.snapshot, task_check: paid.task } }, { artifact: paid.artifact }), /VALIDATION_ALREADY_RECORDED/u);
});
test("human acceptance binds exact existing outcome and current provisioning evidence snapshot", async () => {
  const d = await ownerFixture(), snapshot = { ...d.snapshot, task_check: d.task, capsule: { ...d.snapshot.capsule, status: "COMPLETED" } };
  for (const decision of ["ACCEPTED", "REJECTED"]) {
    const r = await prepareOwnerReview(target, { ...d.actions.acceptance, args: { ...d.actions.acceptance.args, decision } }, { ...d.context, snapshot });
    assert.equal(r.local_fixture_artifact_verified, false); assert.equal(r.signing_enabled, false); assert.match(r.limitation, /client acceptance proof/u);
  }
  for (const args of [{ ...d.actions.acceptance.args, expected_outcome_hash: "aa".repeat(32) }, { ...d.actions.acceptance.args, expected_evidence_snapshot_hash: "aa".repeat(32) }]) {
    await assert.rejects(prepareOwnerReview(target, { ...d.actions.acceptance, args }, { ...d.context, snapshot }), /ACCEPTANCE_(?:OUTCOME|EVIDENCE)_MISMATCH/u);
  }
  await assert.rejects(prepareOwnerReview(target, d.actions.acceptance, d.context), /RESOURCE_TASK_NOT_CHECKED/u);
});
test("fresh exact owner content confirmation has no signature authority; state/call/key changes invalidate", async () => {
  const d = await ownerFixture(), r = await prepareOwnerReview(target, d.actions.revoke, d.context);
  const fresh = await prepareOwnerReview(target, d.actions.revoke, { ...d.context, block: { ...d.context.block, height: 31, timestamp_ns: "31" } });
  const confirmation = { consent: true, review_hash: r.review_hash };
  assert.equal(confirmFreshOwnerReview(r, fresh, confirmation).signing_enabled, false);
  assert.throws(() => confirmFreshOwnerReview({ ...r }, fresh, confirmation), /UNISSUED_OWNER_REVIEW/u);
  assert.throws(() => confirmFreshOwnerReview(r, fresh, { ...confirmation, consent: false }), /EXACT_OWNER_CONFIRMATION_REQUIRED/u);
  const changed = await prepareOwnerReview(target, d.actions.revoke, { ...d.context, signer_access: { nonce: 8, permission: "FullAccess" } });
  assert.throws(() => confirmFreshOwnerReview(r, changed, confirmation), /OWNER_REVIEW_CHANGED/u);
  const late = await prepareOwnerReview(target, d.actions.revoke, { ...d.context, block: { ...d.context.block, timestamp_ns: r.expires_at_ns } });
  assert.throws(() => confirmFreshOwnerReview(r, late, confirmation), /OWNER_REVIEW_STALE/u);
});
test("inputs/artifact are copied before first await and results frozen; no external state is mutated", async () => {
  const d = await ownerFixture(), t = ownerTransport(d), pending = createTestnetReader(target, t.transport).readOwnerReview(d.actions.check, { artifact: d.artifact });
  d.artifact.fill(0); const r = await pending; assert.equal(r.local_fixture_artifact_verified, true);
  assert.ok(Object.isFrozen(r.reviewed_state.snapshot)); assert.ok(Object.isFrozen(r.reviewed_state.snapshot?.capsule));
  assert.throws(() => { (r.reviewed_state.snapshot!.capsule as Record<string, unknown>).status = "DENIED"; });
});
test("owner role/arbitrary recipient/method/deposit/secret and malformed artifact reject before network", async () => {
  const d = await ownerFixture(), t = ownerTransport(d), reader = createTestnetReader(target, t.transport);
  for (const action of [{ ...d.actions.revoke, signer_id: "agent.testnet" }, { ...d.actions.revoke, method: "resolve_purchase" },
    { ...d.actions.close, args: { ...d.actions.close.args, recipient_id: "attacker.testnet" } }, { ...d.actions.check, private_key: "NOT_A_KEY" },
    { ...d.actions.revoke, attached_deposit: "50" }]) await assert.rejects(reader.readOwnerReview(action));
  await assert.rejects(reader.readOwnerReview(d.actions.check));
  await assert.rejects(reader.readOwnerReview(d.actions.check, { artifact: new Uint8Array(16385) }));
  await assert.rejects(reader.readOwnerReview(d.actions.revoke, { artifact: null })); assert.equal(t.calls.length, 0);
});
test("same-final-block and strict snapshot/owner/time/key bounds remain mandatory", async () => {
  const d = await ownerFixture(), mixed = ownerTransport(d, (p, r) => p.request_type === "view_access_key" ? { ...r as object, block_hash: "2".repeat(32) } : r);
  await assert.rejects(createTestnetReader(target, mixed.transport).readOwnerReview(d.actions.revoke), /MIXED_TESTNET_BLOCKS/u);
  for (const signer_access of [{ nonce: 7, permission: { FunctionCall: {} } }, { nonce: Number.MAX_SAFE_INTEGER + 1, permission: "FullAccess" }]) {
    await assert.rejects(prepareOwnerReview(target, d.actions.revoke, { ...d.context, signer_access }));
  }
  for (const snapshot of [{ ...d.snapshot, capsule: { ...d.snapshot.capsule, owner_id: "other.testnet" } },
    { ...d.snapshot, capsule: { ...d.snapshot.capsule, created_at_ns: "31" } }, { ...d.snapshot, purchases: [] }]) {
    await assert.rejects(prepareOwnerReview(target, d.actions.revoke, { ...d.context, snapshot }));
  }
});
test("sanitized failure/cancellation/no-broadcast and untrusted JSON/getter/bytes bounds", async () => {
  const d = await ownerFixture(), t = ownerTransport(d), abort = new AbortController(); abort.abort();
  await assert.rejects(createTestnetReader(target, t.transport).readOwnerReview(d.actions.revoke, undefined, abort.signal), /TESTNET_READ_CANCELLED/u);
  assert.equal(t.calls.length, 0);
  await assert.rejects(createTestnetReader(target, async () => { throw new Error("PRIVATE_CANARY"); }).readOwnerReview(d.actions.revoke), /^Error: TESTNET_RPC_UNAVAILABLE$/u);
  await createTestnetReader(target, t.transport).readOwnerReview(d.actions.revoke);
  for (const call of t.calls) { assert.ok(["status", "block", "query"].includes(call.method)); if (call.method === "query") assert.equal(call.params.block_id, d.context.block.hash); }
  let invoked = false; assert.throws(() => parseOwnerAction({ ...d.actions.revoke, get args() { invoked = true; return {}; } })); assert.equal(invoked, false);
  assert.throws(() => parseOwnerAction({ ...d.actions.revoke, gas: 100 }));
});
test("recurring commitment survives revocation/provisioning failure; owner return excludes full future authority", async () => {
  const d = await ownerFixture(), old = d.snapshot.purchases[0];
  const terms = { ...old.canonical_quote!, input: { ...old.canonical_quote!.input, price: "20", recurring: true, commercial_terms: {
    billing_model: "FIXED_RECURRING" as const, cadence: "MONTHLY" as const, period_charge: "20", required_periods: 12, mandatory_fees: "0", known_taxes: "0", setup_fees: "0",
    auto_renew: false, cancellation_terms_hash: "aa".repeat(32), source_evidence_hash: "bb".repeat(32), future_obligation_contingent_on_initial_payment: true } } };
  const p = { ...old, canonical_quote: terms, proposal: { ...old.proposal, expected_quote_hash: await commercialQuoteHash(terms, "testnet", target.contract_id) }, committed_future_amount: "220" };
  const snapshot = { ...d.snapshot, purchases: [p], capsule: { ...d.snapshot.capsule, status: "REVOKED", spent: "20", committed_future: "220" } };
  const context = { ...d.context, snapshot };
  const r = await prepareOwnerReview(target, d.actions.close, context); assert.equal(r.potential_owner_return, "60");
  assert.equal(r.financials?.available_now, "280"); assert.equal(r.financials?.committed_future, "220");
  const failedEvidence = { ...d.actions.provisioning, args: { ...d.actions.provisioning.args, evidence: { ...d.actions.provisioning.args.evidence, status: "FAILED" } } };
  assert.equal((await prepareOwnerReview(target, failedEvidence, context)).financials?.committed_future, "220");
});
test("pending/unknown owner refund retains exact reservation and blocks close/check/acceptance", async () => {
  const d = await ownerFixture(), refund = { attempt: 1, amount: "250", status: "PENDING", created_at_ns: "23", resolved_at_ns: null, reconciliation_required: true };
  const snapshot = { ...d.snapshot, capsule: { ...d.snapshot.capsule, status: "CLOSING", refund_attempts: 1, reserved: "250", owner_refund: refund } };
  for (const [action, artifact] of [[d.actions.close, undefined], [d.actions.check, { artifact: d.artifact }], [d.actions.acceptance, undefined]] as const) {
    await assert.rejects(prepareOwnerReview(target, action, { ...d.context, snapshot }, artifact), /ALREADY_CLOSING|PENDING_SETTLEMENT|PAYMENT_UNRESOLVED/u);
  }
  const malformed = { ...snapshot, capsule: { ...snapshot.capsule, owner_refund: { ...refund, amount: "249" } } };
  await assert.rejects(prepareOwnerReview(target, d.actions.close, { ...d.context, snapshot: malformed }), /OPERATION_SUM_MISMATCH/u);
});
test("existing acceptance is bounded/owner-authenticated and cannot be overwritten; legacy research is explicitly out of this seam", async () => {
  const d = await ownerFixture(), acceptance = { capsule_id: "work", outcome_hash: d.task.outcome_hash, evidence_snapshot_hash: d.snapshot.evidence_snapshot_hash,
    decision: "ACCEPTED", accepted_by: target.operator_id, recorded_at_ns: "23", acceptance_hash: "ab".repeat(32) };
  const snapshot = { ...d.snapshot, task_check: d.task, human_acceptance: acceptance };
  await assert.rejects(prepareOwnerReview(target, d.actions.acceptance, { ...d.context, snapshot }), /HUMAN_ACCEPTANCE_ALREADY_RECORDED/u);
  await assert.rejects(prepareOwnerReview(target, d.actions.provisioning, { ...d.context, snapshot: { ...snapshot, human_acceptance: { ...acceptance, accepted_by: "attacker.testnet" } } }), /INVALID_OWNER_ACCEPTANCE_RECORD/u);
  await assert.rejects(prepareOwnerReview(target, d.actions.revoke, { ...d.context, snapshot: { ...d.snapshot, outcome: { untrusted: "legacy" } } }), /LEGACY_RESEARCH_OUTCOME_REVIEW_NOT_ADMITTED/u);
});
test("fresh call/state/source/block direction changes all reject exact confirmation", async () => {
  const d = await ownerFixture(), r = await prepareOwnerReview(target, d.actions.revoke, d.context), confirmation = { consent: true, review_hash: r.review_hash };
  for (const context of [{ ...d.context, block: { ...d.context.block, height: 29, timestamp_ns: "29" } },
    { ...d.context, transport_source: "EXPLICIT_TESTNET_HTTP_READBACK" as const },
    { ...d.context, snapshot: { ...d.snapshot, capsule: { ...d.snapshot.capsule, status: "PAUSED" } } }]) {
    const changed = await prepareOwnerReview(target, d.actions.revoke, context);
    assert.throws(() => confirmFreshOwnerReview(r, changed, confirmation), /OWNER_REVIEW_CHANGED|OWNER_REVIEW_STALE/u);
  }
  const changed = await prepareOwnerReview(target, { ...d.actions.revoke, gas: "100000000000001" }, d.context);
  assert.throws(() => confirmFreshOwnerReview(r, changed, confirmation), /OWNER_REVIEW_CHANGED/u);
});
test("owner-input schemas reject omitted/extra proof fields, invalid artifact shape and spoofed recorded evidence", async () => {
  const d = await ownerFixture();
  for (const evidence of [{ ...d.actions.provisioning.args.evidence, artifact_hash: null }, { ...d.actions.provisioning.args.evidence, trust_class: "CERTIFIED" },
    { ...d.actions.provisioning.args.evidence, url: "https://attacker.invalid" }]) assert.throws(() => parseOwnerAction({ ...d.actions.provisioning, args: { ...d.actions.provisioning.args, evidence } }));
  const p = { input: d.actions.provisioning.args.evidence, recorded_by: target.operator_id, recorded_at_ns: "21", record_hash: "ab".repeat(32), source: "SIGNED_BY_PROVIDER" };
  await assert.rejects(prepareOwnerReview(target, d.actions.revoke, { ...d.context, snapshot: { ...d.snapshot, provisioning: [{ request_id: "database", records: [p] }] } }), /INVALID_OWNER_EVIDENCE_RECORD/u);
});
