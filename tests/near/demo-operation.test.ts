import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { prepareDemoOperation, executeDemoOperation, writeDemoRecord } from "../../scripts/setup/human-demo-operation.ts";
import { encodeDemoTransaction, verifyDemoSignature, type DemoKind } from "../../scripts/setup/demo-operation-codec.ts";
import { demoRpc, initialRegularKeyNonce, inspectDemoExecution } from "../../scripts/setup/demo-operation-rpc.ts";
import { admitHumanDemoSigner, signHumanDemo } from "../../scripts/setup/human-demo-operation-signer.ts";
import { demoFixture } from "./helpers/demo-operation.ts";
import { DEMO_CAPSULE_ACTION, DEMO_PROJECT_ACTION, DEMO_QUOTE_ACTION } from "../../src/lib/near/demo-operations.ts";
import { resourceCriteriaHash } from "../../src/lib/validation/resource.ts";
async function directory() { return mkdtemp(join(process.platform === "win32" ? join(homedir(), "AppData/Local/Temp/opencode") : tmpdir(), "runlatch-operation-test-")); }
for (const kind of ["project", "capsule", "quote", "agent-key"] as DemoKind[]) {
  test(`${kind}: exact same-block setup/key review, generated signature and FINAL result`, async () => {
    const f = await demoFixture(kind), r = await prepareDemoOperation(kind, f.publicKey, f.transport), dir = await directory();
    assert.equal(r.content.review.transport_source, "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE");
    assert.equal(f.requests.filter(v => v.method === "block").length, 1); assert.equal(f.state.sends, 0);
    if (kind === "agent-key") assert.equal(r.fees.prepaid_gas, "0");
    else assert.equal(r.fees.prepaid_gas, "50000000000000");
    await executeDemoOperation(dir, r, tx => { assert.equal(JSON.parse(readFileSync(join(dir, "intent.json"), "utf8")).transaction_hash, r.transaction_hash); return f.signer(tx); },
      async (url, input) => { if (JSON.parse(String(input.body)).method === "send_tx") await readFile(join(dir, "entered.json")); return f.transport(url, input); }, () => undefined);
    const result = JSON.parse(await readFile(join(dir, "verified.json"), "utf8"));
    assert.match(result.status, /OBSERVED$/u); assert.equal(f.state.sends, 1); assert.equal(f.state.signatures, 1);
    assert.equal(result.gas_burnt, "3"); assert.equal(result.transport_source, "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE");
    if (kind === "capsule") { assert.equal(result.project_revision, "1"); assert.equal(result.capsule.allocated, "300000000000000000000000"); }
    if (kind === "agent-key") { assert.equal(result.recovery_retained, true); assert.equal(result.initialized_nonce, "999000000"); }
    await assert.rejects(executeDemoOperation(dir, r, f.signer, f.transport, () => undefined), { code: "EEXIST" });
  });
  test(`${kind}: wire rejects changed money/signer/recipient/terms and bad signature`, async () => {
    const f = await demoFixture(kind), r = await prepareDemoOperation(kind, f.publicKey, f.transport), tx = r.transaction;
    for (const change of [{ network: "mainnet" }, { signer_id: tx.receiver_id === tx.signer_id ? "other.testnet" : tx.receiver_id },
      { receiver_id: "other.testnet" }, { nonce: "0" }, { gas: "1" }, { deposit: "1" }, { public_key: "ed25519:bad" }, { extra: true }])
      assert.throws(() => encodeDemoTransaction({ ...tx, ...change }));
    if (tx.kind === "agent-key") {
      for (const permission of ["FullAccess", { ...tx.action.params.accessKey.permission, allowance: null },
        { ...tx.action.params.accessKey.permission, methodNames: [] }, { ...tx.action.params.accessKey.permission, methodNames: ["approve_purchase"] }])
        assert.throws(() => encodeDemoTransaction({ ...tx, action: { ...tx.action, params: { ...tx.action.params, accessKey: { nonce: 0, permission } } } }));
    } else assert.throws(() => encodeDemoTransaction({ ...tx, args: { ...tx.args, substituted: true } }));
    const signed = f.signer(tx); verifyDemoSignature(tx, signed.slice(-64)); signed[signed.length - 1] ^= 1;
    assert.throws(() => verifyDemoSignature(tx, signed.slice(-64)));
  });
  for (const flag of ["failSend", "badFinal", "badHistorical"] as const) test(`${kind}: ${flag} retains markers without retry or success`, async () => {
    const f = await demoFixture(kind), r = await prepareDemoOperation(kind, f.publicKey, f.transport), dir = await directory(); f.state[flag] = true;
    await assert.rejects(executeDemoOperation(dir, r, f.signer, f.transport, () => undefined));
    await readFile(join(dir, "intent.json")); await readFile(join(dir, "entered.json"));
    await assert.rejects(readFile(join(dir, "verified.json")), { code: "ENOENT" });
    await assert.rejects(executeDemoOperation(dir, r, f.signer, f.transport, () => undefined), { code: "EEXIST" }); assert.equal(f.state.sends, 1);
  });
  test(`${kind}: stale nonce/fees/account/project stop before signer; cloned review denied`, async () => {
    for (const change of [(f: Awaited<ReturnType<typeof demoFixture>>) => { f.state.nonce++; },
      (f: Awaited<ReturnType<typeof demoFixture>>) => { f.state.feeChanged = true; },
      (f: Awaited<ReturnType<typeof demoFixture>>) => { f.state.amount = "1"; },
      (f: Awaited<ReturnType<typeof demoFixture>>) => { if (kind === "project") f.state.hasProject = true; else f.state.project.revision = "2"; }]) {
      const f = await demoFixture(kind), r = await prepareDemoOperation(kind, f.publicKey, f.transport), dir = await directory(); change(f);
      await assert.rejects(executeDemoOperation(dir, r, f.signer, f.transport, () => undefined)); assert.equal(f.state.signatures, 0);
    }
    const f = await demoFixture(kind), r = await prepareDemoOperation(kind, f.publicKey, f.transport);
    await assert.rejects(executeDemoOperation(await directory(), { ...r }, f.signer, f.transport, () => undefined), /UNISSUED/u);
  });
  test(`${kind}: complete receipt graph rejects missing/duplicate/unrelated/failed roots`, async () => {
    const f = await demoFixture(kind), r = await prepareDemoOperation(kind, f.publicKey, f.transport), valid = f.final(r.transaction);
    for (const change of [(v: typeof valid) => { v.receipts_outcome = []; }, (v: typeof valid) => { v.receipts_outcome.push(v.receipts_outcome[0]); },
      (v: typeof valid) => { v.transaction.nonce++; }, (v: typeof valid) => { v.receipts_outcome[0].outcome.executor_id = "other.testnet"; },
      (v: typeof valid) => { v.receipts_outcome[1].outcome.receipt_ids.push(f.blockHash); }, (v: typeof valid) => { v.status.SuccessValue = "bad"; }]) {
      const v = structuredClone(valid); change(v); assert.throws(() => inspectDemoExecution(r.transaction, r.transaction_hash, v));
    }
  });
  test(`${kind}: exact expiry stops preparation without any signature or send`, async () => {
    const fixture = await demoFixture(kind);
    fixture.state.now = kind === "project" ? DEMO_PROJECT_ACTION.args.project.expires_at_ns
      : kind === "capsule" ? DEMO_CAPSULE_ACTION.args.policy.expires_at_ns : DEMO_QUOTE_ACTION.args.quote.expires_at_ns;
    await assert.rejects(prepareDemoOperation(kind, fixture.publicKey, fixture.transport));
    assert.equal(fixture.state.sends, 0); assert.equal(fixture.state.signatures, 0);
  });
  test(`${kind}: concurrent exact executions have only one permanent claim/sign/send`, async () => {
    const fixture = await demoFixture(kind), review = await prepareDemoOperation(kind, fixture.publicKey, fixture.transport), dir = await directory();
    const results = await Promise.allSettled([1, 2].map(() => executeDemoOperation(dir, review, fixture.signer, fixture.transport, () => undefined)));
    assert.equal(results.filter(value => value.status === "fulfilled").length, 1);
    assert.equal(fixture.state.signatures, 1); assert.equal(fixture.state.sends, 1);
  });
}
test("new work order and Capsule criteria bind the actual offline validator", async () => {
  const criteria = await resourceCriteriaHash();
  assert.equal(DEMO_PROJECT_ACTION.args.project.outcome_definition_hash, criteria);
  assert.equal(DEMO_CAPSULE_ACTION.args.policy.validation_spec_hash, criteria);
});
test("regular-key nonce is seeded from the execution height, not action nonce0", () => {
  assert.equal(initialRegularKeyNonce(277136000), "277135999000000");
  assert.equal(initialRegularKeyNonce(1), "0");
  for (const height of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => initialRegularKeyNonce(height));
});
test("AddKey final proof rejects zero, wrong-height or already-used key nonce", async () => {
  for (const nonce of [0, 1, 999_000_001]) {
    const fixture = await demoFixture("agent-key"), review = await prepareDemoOperation("agent-key", fixture.publicKey, fixture.transport);
    fixture.state.installed_nonce = nonce;
    const dir = await directory(); await assert.rejects(executeDemoOperation(dir, review, fixture.signer, fixture.transport, () => undefined));
    await readFile(join(dir, "intent.json")); await readFile(join(dir, "entered.json"));
    await assert.rejects(readFile(join(dir, "verified.json")), { code: "ENOENT" }); assert.equal(fixture.state.sends, 1);
  }
});
for (const flag of ["badKey", "badCode", "badStorage", "extraKey", "syncing"] as const) test(`${flag}: initial preflight fails before sign/send`, async () => {
  const f = await demoFixture("capsule"); f.state[flag] = true; await assert.rejects(prepareDemoOperation("capsule", f.publicKey, f.transport));
  assert.equal(f.state.signatures, 0); assert.equal(f.state.sends, 0);
});
test("one-send guard, bounded malformed/mixed-block responses and wall deadline", async () => {
  const f = await demoFixture("capsule"), r = await prepareDemoOperation("capsule", f.publicKey, f.transport), rpc = demoRpc(f.transport), bytes = f.signer(r.transaction);
  await rpc.send(r.transaction, bytes); await assert.rejects(rpc.send(r.transaction, bytes), /SEND_REFUSED/u);
  for (const body of ['{"result":{},"result":{}}', "x".repeat(65537)])
    await assert.rejects(prepareDemoOperation("capsule", f.publicKey, async () => new Response(body)));
  const second = await demoFixture("capsule"), review = await prepareDemoOperation("capsule", second.publicKey, second.transport), now = Date.now;
  try { Date.now = () => review.prepared_at_ms + 60000;
    await assert.rejects(executeDemoOperation(await directory(), review, second.signer, second.transport, () => undefined), /EXPIRED/u);
  } finally { Date.now = now; }
  assert.equal(second.state.signatures, 0);
});
test("non-TTY human entry/import cannot access credentials or network", async () => {
  assert.throws(() => admitHumanDemoSigner({}, "wrong")); assert.throws(() => signHumanDemo({}, {}));
  const cli = spawnSync(process.execPath, ["scripts/setup/human-demo-operation.ts", "capsule"], { encoding: "utf8", timeout: 5000 });
  assert.equal(cli.status, 1); assert.equal(cli.stdout, ""); assert.match(cli.stderr, /HUMAN_TERMINAL_REQUIRED/u);
  const imported = spawnSync(process.execPath, ["--input-type=module", "-e", "await import('./scripts/setup/human-demo-operation.ts')"], { encoding: "utf8", timeout: 5000 });
  assert.equal(imported.status, 0); assert.equal(imported.stdout, ""); assert.equal(imported.stderr, "");
  await assert.rejects(writeDemoRecord(await directory(), "../intent.json", {}));
});
