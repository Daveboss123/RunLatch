import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { dbPurchaseFixture } from "./helpers/db-purchase.ts";
import { confirmDemoDbExecution, prepareDemoDbPurchase, executeDemoDbPurchase, readDemoDbIntent, writeDbPurchaseRecord,
  type DemoDbExecutionApproval, type DemoDbPurchaseReview } from "../../scripts/near/demo-purchase-flow.ts";
import { DEMO_PURCHASE_ANSWER, DEMO_PURCHASE_SCOPE, DEMO_PURCHASE_TARGET, assertDemoPurchaseIntent } from "../../scripts/near/demo-purchase-scope.ts";
import { admitHumanDbPurchaseKey, importGeneratedRestrictedDbKey, loadHumanDbPurchaseKey } from "../../scripts/setup/human-db-purchase-key.ts";
import { disposeRestrictedProcessKey, type RestrictedProcessKey } from "../../scripts/near/restricted-process-key.ts";
import { demoKeyRoles, prepareGeneratedDemoKey } from "../../scripts/setup/human-demo-keys.ts";
import type { runRestrictedTestnetPurchase } from "../../scripts/near/restricted-testnet-runner.ts";
import { encodeUnsignedAgentTransaction } from "../../scripts/near/transaction-codec.ts";

async function directory() { return mkdtemp(join(process.platform === "win32" ? join(homedir(), "AppData/Local/Temp/opencode") : tmpdir(), "runlatch-db-purchase-test-")); }
const approve = (prepared: DemoDbPurchaseReview) => confirmDemoDbExecution(prepared, { authorization: "HUMAN_APPROVED_EXACT_DEMO_DB_PURCHASE",
  consent: true, review_hash: prepared.review.review_hash, costs: prepared.costs, calls: 1 });
const fakeHandle: RestrictedProcessKey = { source: "EXPLICIT_RESTRICTED_PROCESS_KEY_INJECTION", target: DEMO_PURCHASE_TARGET, scope: DEMO_PURCHASE_SCOPE,
  public_key: DEMO_PURCHASE_SCOPE.public_key, public_signing_enabled: false, limitation: "SYNTHETIC_TEST_HANDLE_NOT_A_PRIVATE_KEY" };
const noRun: typeof runRestrictedTestnetPurchase = async admission => ({ source: "RESTRICTED_TESTNET_SINGLE_ATTEMPT", status: "STOPPED_BEFORE_INVOCATION",
  attempt_id: "00", intent: null, invocation_entered: false, journal_completion: "NOT_FINALIZED_RETAIN_PRIOR_MARKERS", payment_evidence: "NOT_OBSERVED",
  public_execution: "NOT_PROVEN", identity: null, broadcast: null, transport_source: admission.review.transport_source,
  key_strategy: "THREE_DISTINCT_REQUESTS_EXACT_FINAL_RECONCILIATION_NO_RELEASE", grants_payment_authority: false,
  limitation: "One bounded exact native-testnet submit. Acknowledgement/entry/signature is not inclusion or settlement; retain unknown identity/claims. Observe transfer/private callback separately, then run labelled fixture checks and explicit owner acceptance." });

test("exact unsigned database review fixes price/recipient, zero deposit and separate gas/account funding", async () => {
  const f = await dbPurchaseFixture(), prepared = await prepareDemoDbPurchase(f.transport);
  assert.equal(prepared.signing_enabled, false); assert.equal(prepared.review.transport_source, "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE");
  assert.equal(prepared.review.exposure.amount_due_now, "50000000000000000000000"); assert.equal(prepared.review.financials?.available_now, "300000000000000000000000");
  assert.equal(prepared.costs.attached_deposit, "0"); assert.equal(prepared.costs.prepaid_gas, "100000000000000");
  assert.equal(f.requests.every(r => ["status", "block", "query", "gas_price", "EXPERIMENTAL_protocol_config"].includes(r.method)), true);
});
for (const flag of ["mainnet", "extraKey", "badBlock", "badProtocol"] as const) test(`database preflight ${flag} refuses before key/sign/send`, async () => {
  const f = await dbPurchaseFixture(); f.state[flag] = true; await assert.rejects(prepareDemoDbPurchase(f.transport));
});
test("changed price/policy/key nonce/cap, suspended authority and gas/balance bounds fail closed", async () => {
  for (const change of [(f: Awaited<ReturnType<typeof dbPurchaseFixture>>) => { f.state.nonce++; },
    (f: Awaited<ReturnType<typeof dbPurchaseFixture>>) => { f.state.allowance = "1"; },
    (f: Awaited<ReturnType<typeof dbPurchaseFixture>>) => { f.state.gas_price = "1000000000000"; },
    (f: Awaited<ReturnType<typeof dbPurchaseFixture>>) => { f.state.amount = "1"; },
    (f: Awaited<ReturnType<typeof dbPurchaseFixture>>) => { f.state.capsule.policy_hash = "00".repeat(32); },
    (f: Awaited<ReturnType<typeof dbPurchaseFixture>>) => { f.state.project.status = "PAUSED"; },
    (f: Awaited<ReturnType<typeof dbPurchaseFixture>>) => { f.state.quote.consumed = true; }]) {
    const f = await dbPurchaseFixture(); change(f); await assert.rejects(prepareDemoDbPurchase(f.transport));
  }
});
test("one consumed helper review, permanent public records and synthetic no-run never imply payment", async () => {
  const f = await dbPurchaseFixture(), review = await prepareDemoDbPurchase(f.transport), dir = await directory(); let loads = 0, disposals = 0;
  const approval = approve(review);
  const result = await executeDemoDbPurchase(dir, approval, { transport: f.transport, testNamespace: "db-purchase-test", testRun: noRun,
    loadKey: () => { loads++; return fakeHandle; }, testDispose: () => { disposals++; } });
  assert.equal(result.status, "DB_PURCHASE_NOT_ENTERED_READBACK_ONLY"); assert.equal(loads, 1); assert.equal(disposals, 1);
  const intent = JSON.parse(await readFile(join(dir, "intent.json"), "utf8")); assert.equal(intent.call.attached_deposit, "0");
  assert.equal(JSON.stringify(intent).includes("private_key"), false);
  await assert.rejects(executeDemoDbPurchase(dir, approval, { loadKey: () => fakeHandle, transport: f.transport }), /CONSUMED/u);
  assert.equal(await readDemoDbIntent(dir), null);
});
test("cloned/expired/changed fresh review or costs never loads a key or invokes a runner", async () => {
  const f = await dbPurchaseFixture(), review = await prepareDemoDbPurchase(f.transport);
  await assert.rejects(executeDemoDbPurchase(await directory(), review as unknown as DemoDbExecutionApproval, { loadKey: () => { throw Error("MUST_NOT_LOAD"); } }), /UNISSUED/u);
  for (const change of [(f: Awaited<ReturnType<typeof dbPurchaseFixture>>) => { f.state.nonce++; },
    (f: Awaited<ReturnType<typeof dbPurchaseFixture>>) => { f.state.gas_price = "110000000"; }]) {
    const f = await dbPurchaseFixture(), r = await prepareDemoDbPurchase(f.transport), approval = approve(r); change(f);
    await assert.rejects(executeDemoDbPurchase(await directory(), approval, { transport: f.transport, loadKey: () => { throw Error("MUST_NOT_LOAD"); } }));
  }
  const now = Date.now;
  const approval = approve(review);
  try { Date.now = () => review.prepared_at_ms + 60000;
    await assert.rejects(executeDemoDbPurchase(await directory(), approval, { loadKey: () => { throw Error("MUST_NOT_LOAD"); } }), /EXPIRED/u);
  } finally { Date.now = now; }
});
test("unsigned review, copied approval and substituted consent cannot enable execution", async () => {
  const f = await dbPurchaseFixture(), review = await prepareDemoDbPurchase(f.transport), approved = approve(review);
  const valid = { authorization: "HUMAN_APPROVED_EXACT_DEMO_DB_PURCHASE", consent: true, review_hash: review.review.review_hash, costs: review.costs, calls: 1 };
  for (const change of [{ consent: false }, { calls: 2 }, { review_hash: "00".repeat(32) }, { authorization: "AGENT_ASSERTION" },
    { costs: { ...review.costs, gas_price_yocto: "1" } }, { extra: "grant" }]) assert.throws(() => confirmDemoDbExecution(review, { ...valid, ...change }));
  assert.throws(() => confirmDemoDbExecution({ ...review }, valid), /UNISSUED/u);
  await assert.rejects(executeDemoDbPurchase(await directory(), { ...approved }, { loadKey: () => { throw Error("MUST_NOT_LOAD"); } }), /UNISSUED/u);
});
test("concurrent exact execution approval can load/invoke only once", async () => {
  const f = await dbPurchaseFixture(), r = await prepareDemoDbPurchase(f.transport), dir = await directory(), approval = approve(r); let loads = 0, runs = 0;
  const ports = { transport: f.transport, testNamespace: "db-concurrency", loadKey: () => { loads++; return fakeHandle; }, testDispose: () => undefined,
    testRun: (async (...args: Parameters<typeof runRestrictedTestnetPurchase>) => { runs++; return noRun(...args); }) };
  const results = await Promise.allSettled([1, 2].map(() => executeDemoDbPurchase(dir, approval, ports)));
  assert.equal(results.filter(v => v.status === "fulfilled").length, 1); assert.equal(loads, 1); assert.equal(runs, 1);
});
test("unknown runner failure retains intent, disposes key and cannot reload through a fresh approval/directory claim", async () => {
  const f = await dbPurchaseFixture(), r = await prepareDemoDbPurchase(f.transport), dir = await directory(); let loads = 0, disposed = 0;
  await assert.rejects(executeDemoDbPurchase(dir, approve(r), { transport: f.transport, testNamespace: "db-unknown",
    loadKey: () => { loads++; return fakeHandle; }, testDispose: () => { disposed++; }, testRun: async () => { throw Error("SYNTHETIC_UNKNOWN_RUN"); } }));
  await readFile(join(dir, "intent.json")); assert.equal(loads, 1); assert.equal(disposed, 1);
  const fresh = await prepareDemoDbPurchase(f.transport);
  await assert.rejects(executeDemoDbPurchase(dir, approve(fresh), { transport: f.transport, loadKey: () => { loads++; return fakeHandle; } }), { code: "EEXIST" });
  assert.equal(loads, 1);
});
test("captured identity survives an unknown RPC outcome and can only be read back, never counted settled", async () => {
  const f = await dbPurchaseFixture(), prepared = await prepareDemoDbPurchase(f.transport), dir = await directory();
  const wire = encodeUnsignedAgentTransaction({ ...prepared.review.call,
    nonce: (BigInt(prepared.review.access!.nonce) + 1n).toString(), block_hash: prepared.review.reviewed_block.hash });
  const captured = { transaction_hash: wire.transaction_hash, transaction: wire.transaction };
  const intent = assertDemoPurchaseIntent({ transaction_hash: wire.transaction_hash, sender_id: wire.transaction.signer_id,
    public_key: wire.transaction.public_key, method: "submit_purchase", gas: wire.transaction.gas,
    proposal: wire.transaction.args.proposal, expected_request_hash: null });
  const unknown: typeof runRestrictedTestnetPurchase = async (...args) => ({ ...await noRun(...args), status: "RESULT_UNKNOWN",
    invocation_entered: true, identity: captured, intent });
  const result = await executeDemoDbPurchase(dir, approve(prepared), { transport: f.transport, testNamespace: "db-captured-unknown",
    loadKey: () => fakeHandle, testDispose: () => undefined, testRun: unknown });
  assert.equal(result.status, "DB_PURCHASE_PENDING_OR_UNVERIFIED_READBACK_ONLY");
  assert.equal((await readDemoDbIntent(dir))?.transaction_hash, wire.transaction_hash);
  assert.equal(JSON.parse(await readFile(join(dir, "identity.json"), "utf8")).intent.transaction_hash, wire.transaction_hash);
  assert.equal(f.requests.some(r => ["send_tx", "broadcast_tx_async"].includes(r.method)), false);
  assert.equal(result.provisioning, "NOT_RECORDED");
});
test("identity file is bounded and scope-checked, never a signing approval or arbitrary receiver", async () => {
  const dir = await directory();
  await writeDbPurchaseRecord(dir, "identity.json", { source: "EXACT_CAPTURED_DB_PURCHASE_IDENTITY_NOT_SETTLEMENT", intent: {
    transaction_hash: "1".repeat(32), sender_id: "wrong.testnet", public_key: DEMO_PURCHASE_SCOPE.public_key, method: "submit_purchase",
    gas: "100000000000000", proposal: {}, expected_request_hash: null } });
  await assert.rejects(readDemoDbIntent(dir)); await assert.rejects(writeDbPurchaseRecord(dir, "../secret.json", {}));
  assert.throws(() => assertDemoPurchaseIntent({}));
});
test("generated restricted credential bridge consumes DER in memory and rejects mismatched/full-access identity", () => {
  const generated = prepareGeneratedDemoKey(demoKeyRoles[4]), publicKey = generated.publicRecord.public_key,
    blob = Buffer.from(generated.input.toString("utf8"), "utf16le"); generated.input.fill(0);
  const scope = { ...DEMO_PURCHASE_SCOPE, public_key: publicKey };
  try {
    assert.throws(() => importGeneratedRestrictedDbKey(blob, { ...scope, public_key: DEMO_PURCHASE_SCOPE.recovery_public_key }));
    const handle = importGeneratedRestrictedDbKey(blob, scope); assert.equal(handle.public_key, publicKey);
    assert.equal(handle.public_signing_enabled, false); assert.equal(Object.keys(handle).includes("private_key"), false); disposeRestrictedProcessKey(handle);
  } finally { blob.fill(0); }
});
test("nonTTY approval, key loader and command/module import never access credentials or public network", async () => {
  const f = await dbPurchaseFixture(), review = await prepareDemoDbPurchase(f.transport);
  assert.throws(() => admitHumanDbPurchaseKey(review, DEMO_PURCHASE_ANSWER)); assert.throws(() => loadHumanDbPurchaseKey(review, {}));
  const stopped = spawnSync(process.execPath, ["scripts/setup/human-db-purchase.ts"], { encoding: "utf8", timeout: 5000 });
  assert.equal(stopped.status, 1); assert.equal(stopped.stdout, ""); assert.match(stopped.stderr, /HUMAN_TERMINAL_REQUIRED/u);
  const imported = spawnSync(process.execPath, ["--input-type=module", "-e", "await import('./scripts/setup/human-db-purchase.ts')"], { encoding: "utf8", timeout: 5000 });
  assert.equal(imported.status, 0); assert.equal(imported.stdout, ""); assert.equal(imported.stderr, "");
});
