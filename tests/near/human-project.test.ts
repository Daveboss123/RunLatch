import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { prepareProject, executeProject, writeProjectRecord } from "../../scripts/setup/human-create-demo-project.ts";
import { encodeProjectTransaction, projectCeiling, projectDeposit, projectLifetimeNs, projectCriteriaHash, verifyProjectSignature } from "../../scripts/setup/project-codec.ts";
import { admitHumanProjectSigner, signHumanProject } from "../../scripts/setup/human-project-signer.ts";
import { projectRpc, inspectProjectExecution } from "../../scripts/setup/project-rpc.ts";
import { projectFixture, finalProjectResponse } from "./helpers/project.ts";
async function directory() { return mkdtemp(join(process.platform === "win32" ? join(homedir(), "AppData/Local/Temp/opencode") : tmpdir(), "runlatch-project-test-")); }
test("human project entry/import/approval never touches store or network without TTY", () => {
  assert.throws(() => admitHumanProjectSigner({}, "wrong")); assert.throws(() => signHumanProject({}, {}));
  const path = fileURLToPath(new URL("../../scripts/setup/human-create-demo-project.ts", import.meta.url));
  const result = spawnSync(process.execPath, [path], { encoding: "utf8", timeout: 5000 });
  assert.equal(result.status, 1); assert.equal(result.stdout, ""); assert.match(result.stderr, /PROJECT_STOPPED/u);
  const imported = spawnSync(process.execPath, ["--input-type=module", "-"], {
    input: `await import(${JSON.stringify(new URL("../../scripts/setup/human-create-demo-project.ts", import.meta.url).href)});`, encoding: "utf8", timeout: 5000 });
  assert.equal(imported.status, 0); assert.equal(imported.stdout, ""); assert.equal(imported.stderr, "");
});
test("project uses existing setup review: ceiling is unfunded, exact storage, chain48h and real criteria hash", async () => {
  const f = projectFixture(), r = await prepareProject(f.publicKey, f.gateKey, f.transport);
  assert.equal(r.setup.source, "UNSIGNED_EXACT_SETUP_REVIEW"); assert.equal(r.setup.transport_source, "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE");
  assert.equal(r.setup.funding.purchase_funding, "0"); assert.equal(r.setup.funding.project_ceiling, projectCeiling);
  assert.equal(r.transaction.deposit, projectDeposit); assert.equal(r.transaction.args.project.outcome_definition_hash, projectCriteriaHash);
  assert.equal(BigInt(r.transaction.args.project.expires_at_ns), BigInt(f.now) + projectLifetimeNs);
  assert.equal(f.state.signatures, 0); assert.equal(f.state.sends, 0);
});
test("shared setup validator is fed one same-block preflight, without repeating network/key/storage reads", async () => {
  const f = projectFixture(); await prepareProject(f.publicKey, f.gateKey, f.transport);
  assert.equal(f.requests.filter(v => v.method === "status").length, 1);
  assert.equal(f.requests.filter(v => v.method === "block").length, 1);
  assert.equal(f.requests.filter(v => v.method === "query" && v.params.method_name === "get_storage_requirements").length, 1);
  assert.equal(f.requests.filter(v => v.method === "query" && v.params.method_name === "get_operator").length, 1);
  assert.equal(f.requests.filter(v => v.method === "query" && v.params.request_type === "view_access_key").length, 2);
});
test("a newer finalized block does not falsely change account balances/nonces or invalidate an unchanged review", async () => {
  const f = projectFixture(); let height = 1000;
  const transport = async (url: string, input: RequestInit) => {
    const request = JSON.parse(String(input.body)), originalBlock = request.params?.block_id;
    if (request.method === "query") request.params.block_id = f.hash;
    const response = await f.transport(url, { ...input, body: JSON.stringify(request) }), data = JSON.parse(await response.text());
    if (request.method === "block") {
      height++; data.result.header.height = height;
      data.result.header.hash = height === 1001 ? "11111111111111111111111111111111" : f.hash;
    }
    if (request.method === "query") { data.result.block_hash = originalBlock; data.result.block_height = height; }
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
  };
  const r = await prepareProject(f.publicKey, f.gateKey, transport);
  const fresh = await prepareProject(f.publicKey, f.gateKey, transport, r.transaction.args.project.expires_at_ns);
  assert.notEqual(r.setup.reviewed_block.hash, fresh.setup.reviewed_block.hash);
  assert.equal(r.initial_accounts, fresh.initial_accounts);
  assert.equal(r.setup.state_hash, fresh.setup.state_hash);
});
test("fixed one-project codec/signature rejects altered scope, terms, money, actions, key and signature", async () => {
  const f = projectFixture(), r = await prepareProject(f.publicKey, f.gateKey, f.transport), tx = r.transaction;
  for (const changed of [{ network: "mainnet" }, { signer_id: tx.receiver_id }, { receiver_id: tx.signer_id }, { method: "create_capsule" },
    { gas: "1" }, { deposit: "1" }, { nonce: "0" }, { actions: ["pay"] }, { public_key: "ed25519:bad" }])
    assert.throws(() => encodeProjectTransaction({ ...tx, ...changed }));
  for (const changed of [{ budget_ceiling: "1" }, { project_id: "other" }, { organisation_id: "other" }, { client_ref: "other" }, { outcome_definition_hash: "0".repeat(64) }, { recipient: "other.testnet" }])
    assert.throws(() => encodeProjectTransaction({ ...tx, args: { project: { ...tx.args.project, ...changed } } }));
  const signed = f.signer(tx); verifyProjectSignature(tx, signed.slice(-64));
  signed[signed.length - 1] ^= 1; assert.throws(() => verifyProjectSignature(tx, signed.slice(-64)));
});
for (const flag of ["mainnet", "syncing", "badKey", "badNonce", "badCode", "badSchema", "badStorage", "hasCapsule", "hasProject"] as const)
  test(`project preflight ${flag} stops before sign/send`, async () => {
    const f = projectFixture(); f.state[flag] = true; await assert.rejects(prepareProject(f.publicKey, f.gateKey, f.transport));
    assert.equal(f.state.signatures, 0); assert.equal(f.state.sends, 0);
  });
test("insufficient storage+gas collateral and invalid expired/oversized time fail without money Number casts", async () => {
  const f = projectFixture(); f.state.balance = "1000000000000000000000";
  await assert.rejects(prepareProject(f.publicKey, f.gateKey, f.transport), /FUNDING_INSUFFICIENT/u);
  f.state.balance = "5000000000000000000000000";
  for (const expiry of [f.now, (BigInt(f.now) - 1n).toString(), (BigInt(f.now) + projectLifetimeNs + 1n).toString(), "1e18"])
    await assert.rejects(prepareProject(f.publicKey, f.gateKey, f.transport, expiry));
});
test("single project identity is synced before sign and entry before one send; FINAL graph and exact current record required", async () => {
  const f = projectFixture(), dir = await directory(), r = await prepareProject(f.publicKey, f.gateKey, f.transport), reports: unknown[] = [];
  await executeProject(dir, r, tx => {
    assert.equal(JSON.parse(readFileSync(join(dir, "intent.json"), "utf8")).transaction_hash, r.transaction_hash); return f.signer(tx);
  }, async (url, input) => {
    if (JSON.parse(String(input.body)).method === "send_tx") await readFile(join(dir, "entered.json")); return f.transport(url, input);
  }, v => reports.push(v));
  const verified = JSON.parse(await readFile(join(dir, "verified.json"), "utf8"));
  assert.equal(verified.status, "PROJECT_CREATION_OBSERVED"); assert.equal(verified.project.allocated_authority, "0");
  assert.equal(verified.purchase_funding_yoctoNEAR, "0"); assert.equal(verified.gas_burnt, "3"); assert.equal(verified.purchase_executed, false);
  assert.equal(JSON.stringify(verified).includes("private_key"), false); assert.equal(reports.length, 2);
  assert.equal(f.state.sends, 1); assert.equal(f.state.signatures, 1);
  await assert.rejects(executeProject(dir, r, f.signer, f.transport, () => undefined), { code: "EEXIST" });
});
for (const flag of ["failSend", "badFinal", "badRecord", "badHistorical"] as const) test(`${flag} retains intent/entry, never retries or claims creation`, async () => {
  const f = projectFixture(), dir = await directory(), r = await prepareProject(f.publicKey, f.gateKey, f.transport); f.state[flag] = true;
  await assert.rejects(executeProject(dir, r, f.signer, f.transport, () => undefined));
  await readFile(join(dir, "intent.json")); await readFile(join(dir, "entered.json"));
  await assert.rejects(readFile(join(dir, "verified.json")), { code: "ENOENT" });
  await assert.rejects(executeProject(dir, r, f.signer, f.transport, () => undefined), { code: "EEXIST" });
  assert.equal(f.state.signatures, 1); assert.equal(f.state.sends, 1);
});
test("fresh setup and balance/fee recheck, issued-review identity and exclusive concurrent claims fail before signer", async () => {
  for (const change of [(f: ReturnType<typeof projectFixture>) => { f.state.nonce++; },
    (f: ReturnType<typeof projectFixture>) => { f.state.balance = "4999999999999999999999999"; },
    (f: ReturnType<typeof projectFixture>) => { f.state.feeChanged = true; }]) {
    const f = projectFixture(), r = await prepareProject(f.publicKey, f.gateKey, f.transport), dir = await directory(); change(f);
    await assert.rejects(executeProject(dir, r, f.signer, f.transport, () => undefined)); assert.equal(f.state.signatures, 0);
    await assert.rejects(writeProjectRecord(dir, "review.json", {}), { code: "EEXIST" });
  }
  const f = projectFixture(), r = await prepareProject(f.publicKey, f.gateKey, f.transport), dir = await directory();
  await assert.rejects(executeProject(dir, { ...r }, f.signer, f.transport, () => undefined), /UNISSUED/u);
  const results = await Promise.allSettled([1, 2].map(() => executeProject(dir, r, f.signer, f.transport, () => undefined)));
  assert.equal(results.filter(v => v.status === "fulfilled").length, 1); assert.equal(f.state.signatures, 1); assert.equal(f.state.sends, 1);
  await assert.rejects(writeProjectRecord(dir, "../intent.json", {}));
});
test("expired wall-clock reviews stop before claim/sign/send; original issued review is immutable", async () => {
  const f = projectFixture(), r = await prepareProject(f.publicKey, f.gateKey, f.transport), dir = await directory(), original = Date.now;
  try { Date.now = () => r.prepared_at_ms + 60000; await assert.rejects(executeProject(dir, r, f.signer, f.transport, () => undefined), /EXPIRED/u); }
  finally { Date.now = original; }
  assert.equal(Object.isFrozen(r), true); assert.equal(f.state.signatures, 0); await assert.rejects(readFile(join(dir, "review.json")), { code: "ENOENT" });
});
test("FINAL inspector rejects changed caller/action/deposit/status/record and missing/duplicate/unrelated/failed receipt graphs", async () => {
  const f = projectFixture(), r = await prepareProject(f.publicKey, f.gateKey, f.transport), valid = finalProjectResponse(r.transaction, r.transaction_hash, f.hash, f.now);
  const change = (fn: (v: typeof valid) => void) => { const v = structuredClone(valid); fn(v); assert.throws(() => inspectProjectExecution(r.transaction, r.transaction_hash, v)); };
  change(v => { v.final_execution_status = "EXECUTED"; }); change(v => { v.transaction.signer_id = v.transaction.receiver_id; });
  change(v => { v.transaction.nonce++; }); change(v => { v.transaction.actions[0].FunctionCall.deposit = projectCeiling; });
  change(v => { v.transaction.actions.push(v.transaction.actions[0]); }); change(v => { v.status.SuccessValue = ""; });
  change(v => { v.receipts_outcome = []; }); change(v => { v.receipts_outcome.push(v.receipts_outcome[0]); });
  change(v => { v.receipts_outcome[0].outcome.status.SuccessValue = ""; }); change(v => { v.receipts_outcome[1].outcome.executor_id = "db.runlatch-demo-1108.testnet"; });
  change(v => { v.receipts_outcome[1].outcome.receipt_ids.push(f.hash); }); change(v => { v.receipts_outcome[0].outcome.gas_burnt = Number.MAX_SAFE_INTEGER + 1; });
  change(v => { v.receipts_outcome[0].outcome.tokens_burnt = "1e24"; });
});
test("RPC limits/envelope/duplicateJSON/mixed block and one-send guard reject untrusted replies without retry", async () => {
  const f = projectFixture();
  for (const body of ['{"jsonrpc":"2.0","id":"wrong","result":{}}', '{"result":{},"result":{}}', "x".repeat(65537)])
    await assert.rejects(prepareProject(f.publicKey, f.gateKey, async () => new Response(body)));
  await assert.rejects(prepareProject(f.publicKey, f.gateKey, async (url, input) => {
    const response = await f.transport(url, input), data = JSON.parse(await response.text()); if (data.result.block_hash) data.result.block_height++;
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
  }));
  const r = await prepareProject(f.publicKey, f.gateKey, f.transport), signed = f.signer(r.transaction), rpc = projectRpc(f.transport);
  await rpc.send(r.transaction, signed); await assert.rejects(rpc.send(r.transaction, signed), /SEND_REFUSED/u); assert.equal(f.state.sends, 1);
});
test("native-default wiring retains HTTP review label during recheck; global fetch is mocked, not public evidence", async () => {
  const f = projectFixture(), dir = await directory(), original = globalThis.fetch;
  try {
    globalThis.fetch = async (input, init) => {
      if (typeof input !== "string" || !init) throw Error("UNEXPECTED_FETCH"); return f.transport(input, init);
    };
    const r = await prepareProject(f.publicKey, f.gateKey);
    assert.equal(r.setup.transport_source, "EXPLICIT_TESTNET_HTTP_READBACK");
    await executeProject(dir, r, f.signer, undefined, () => undefined);
    assert.equal(f.state.sends, 1); assert.equal(f.state.signatures, 1);
  } finally { globalThis.fetch = original; }
});
test("wrong signed bytes and signer errors retain exclusive intent, without send or fallback", async () => {
  for (const fail of [true, false]) {
    const f = projectFixture(), dir = await directory(), r = await prepareProject(f.publicKey, f.gateKey, f.transport);
    await assert.rejects(executeProject(dir, r, tx => {
      if (fail) throw Error("SIGNER_ERROR"); const signed = f.signer(tx); signed[0] ^= 1; return signed;
    }, f.transport, () => undefined));
    await readFile(join(dir, "intent.json")); await assert.rejects(readFile(join(dir, "entered.json")), { code: "ENOENT" });
    assert.equal(f.state.sends, 0);
    await assert.rejects(executeProject(dir, r, f.signer, f.transport, () => undefined), { code: "EEXIST" });
  }
});
test("exact creation timestamps and original criteria cannot be replaced by fabricated FINAL return data", async () => {
  const f = projectFixture(), dir = await directory(), r = await prepareProject(f.publicKey, f.gateKey, f.transport);
  await assert.rejects(executeProject(dir, r, f.signer, async (url, input) => {
    const response = await f.transport(url, input), data = JSON.parse(await response.text());
    if (JSON.parse(String(input.body)).method === "send_tx") {
      const project = JSON.parse(Buffer.from(data.result.status.SuccessValue, "base64").toString("utf8"));
      project.created_at_ns = project.updated_at_ns = (BigInt(f.now) - 1n).toString();
      data.result.status.SuccessValue = data.result.receipts_outcome[0].outcome.status.SuccessValue = Buffer.from(JSON.stringify(project)).toString("base64");
    }
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
  }, () => undefined));
  await assert.rejects(readFile(join(dir, "verified.json")), { code: "ENOENT" }); assert.equal(f.state.sends, 1);
});
