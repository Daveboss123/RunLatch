import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { prepareProvider, executeProvider, writeProviderRecord } from "../../scripts/setup/human-register-demo-provider.ts";
import { encodeProviderTransaction, providerDeposit, providerTerms, verifyProviderSignature } from "../../scripts/setup/provider-codec.ts";
import { admitHumanProviderSigner, signHumanProvider } from "../../scripts/setup/human-provider-signer.ts";
import { providerRpc, inspectProviderExecution } from "../../scripts/setup/provider-rpc.ts";
import { providerFixture, finalProviderResponse } from "./helpers/provider.ts";
async function directory() { return mkdtemp(join(process.platform === "win32" ? join(homedir(), "AppData/Local/Temp/opencode") : tmpdir(), "runlatch-provider-test-")); }
test("human provider nonTTY entry/approval/import never accesses store/network", () => {
  assert.throws(() => admitHumanProviderSigner({}, "wrong")); assert.throws(() => signHumanProvider({}, {}));
  const path = fileURLToPath(new URL("../../scripts/setup/human-register-demo-provider.ts", import.meta.url));
  const result = spawnSync(process.execPath, [path], { encoding: "utf8", timeout: 5000 });
  assert.equal(result.status, 1); assert.equal(result.stdout, ""); assert.match(result.stderr, /PROVIDER_STOPPED/u);
  const imported = spawnSync(process.execPath, ["--input-type=module", "-"], {
    input: `await import(${JSON.stringify(new URL("../../scripts/setup/human-register-demo-provider.ts", import.meta.url).href)});`, encoding: "utf8", timeout: 5000 });
  assert.equal(imported.status, 0); assert.equal(imported.stdout, ""); assert.equal(imported.stderr, "");
});
test("provider uses actual setup review, exact storage/immutable identity and unfunded project", async () => {
  const f = providerFixture(), r = await prepareProvider(f.publicKey, f.gateKey, f.databaseKey, f.transport);
  assert.equal(r.setup.transport_source, "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE"); assert.equal(r.setup.signing_enabled, false);
  assert.deepEqual(r.transaction.args, providerTerms); assert.equal(r.transaction.deposit, providerDeposit);
  assert.equal(r.setup.funding.purchase_funding, "0"); assert.equal(r.project.allocated_authority, "0");
  assert.equal(r.project.input.expires_at_ns, "1794335720864706128"); assert.equal(f.state.sends, 0); assert.equal(f.state.signatures, 0);
  assert.equal(f.requests.filter(v => v.method === "status").length, 1); assert.equal(f.requests.filter(v => v.method === "block").length, 1);
  assert.equal(f.requests.filter(v => v.params.method_name === "get_storage_requirements").length, 1);
});
test("provider codec rejects substituted ID/publisher/recipient/money/key/method/action and corrupt signature", async () => {
  const f = providerFixture(), r = await prepareProvider(f.publicKey, f.gateKey, f.databaseKey, f.transport), tx = r.transaction;
  for (const changed of [{ network: "mainnet" }, { signer_id: tx.receiver_id }, { receiver_id: tx.signer_id }, { method: "publish_quote" },
    { gas: "1" }, { deposit: "1" }, { nonce: "0" }, { actions: ["Transfer"] }, { public_key: "ed25519:bad" }]) assert.throws(() => encodeProviderTransaction({ ...tx, ...changed }));
  for (const changed of [{ provider_id: "other" }, { publisher_id: tx.signer_id }, { recipient_id: tx.receiver_id }, { price: "1" }])
    assert.throws(() => encodeProviderTransaction({ ...tx, args: { ...tx.args, ...changed } }));
  const signed = f.signer(tx); verifyProviderSignature(tx, signed.slice(-64)); signed[signed.length - 1] ^= 1;
  assert.throws(() => verifyProviderSignature(tx, signed.slice(-64)));
});
for (const flag of ["mainnet", "syncing", "badKey", "badNonce", "badCode", "badSchema", "badStorage", "hasCapsule", "hasProvider", "badDatabaseKey", "badDatabaseCode"] as const)
  test(`provider preflight ${flag} fails before sign/send`, async () => {
    const f = providerFixture(); f.state[flag] = true; await assert.rejects(prepareProvider(f.publicKey, f.gateKey, f.databaseKey, f.transport));
    assert.equal(f.state.signatures, 0); assert.equal(f.state.sends, 0);
  });
test("project status/revision/expiry/criteria/allocation/IDs are exact; provider cannot revive authority", async () => {
  for (const change of [{ status: "PAUSED" }, { revision: "2" }, { allocated_authority: "1" }, { capsule_ids: ["capsule"] }, { owner_id: "other.testnet" }]) {
    const f = providerFixture(); Object.assign(f.state.project, change); await assert.rejects(prepareProvider(f.publicKey, f.gateKey, f.databaseKey, f.transport));
  }
  for (const change of [{ project_id: "other" }, { expires_at_ns: "1794335720864706129" }, { outcome_definition_hash: "0".repeat(64) }]) {
    const f = providerFixture(); Object.assign(f.state.project.input, change); await assert.rejects(prepareProvider(f.publicKey, f.gateKey, f.databaseKey, f.transport));
  }
  const f = providerFixture(); f.state.now = f.state.project.input.expires_at_ns;
  await assert.rejects(prepareProvider(f.publicKey, f.gateKey, f.databaseKey, f.transport)); assert.equal(f.state.sends, 0);
});
test("storage+gas+account collateral balance failure remains separate from project ceiling", async () => {
  const f = providerFixture(); f.state.balance = "1000000000000000000000";
  await assert.rejects(prepareProvider(f.publicKey, f.gateKey, f.databaseKey, f.transport), /FUNDING_INSUFFICIENT/u);
});
test("permanent identity before sign, entry before single send, FINAL graph/current provider/project/DB proof", async () => {
  const f = providerFixture(), dir = await directory(), r = await prepareProvider(f.publicKey, f.gateKey, f.databaseKey, f.transport);
  await executeProvider(dir, r, tx => { assert.equal(JSON.parse(readFileSync(join(dir, "intent.json"), "utf8")).transaction_hash, r.transaction_hash); return f.signer(tx); },
    async (url, input) => { if (JSON.parse(String(input.body)).method === "send_tx") await readFile(join(dir, "entered.json")); return f.transport(url, input); }, () => undefined);
  const result = JSON.parse(await readFile(join(dir, "verified.json"), "utf8"));
  assert.equal(result.status, "PROVIDER_REGISTRATION_OBSERVED"); assert.deepEqual(result.provider, { ...providerTerms, active: true, quote_count: 0 });
  assert.equal(result.purchase_executed, false); assert.equal(result.purchase_funding_yoctoNEAR, "0"); assert.equal(result.gas_burnt, "3");
  assert.equal(result.project.allocated_authority, "0"); assert.equal(JSON.stringify(result).includes("private_key"), false);
  assert.equal(f.state.sends, 1); assert.equal(f.state.signatures, 1);
  await assert.rejects(executeProvider(dir, r, f.signer, f.transport, () => undefined), { code: "EEXIST" });
});
for (const flag of ["failSend", "badFinal", "badRecord", "badHistorical"] as const) test(`${flag} retains identity/entry without retry or registration claim`, async () => {
  const f = providerFixture(), dir = await directory(), r = await prepareProvider(f.publicKey, f.gateKey, f.databaseKey, f.transport); f.state[flag] = true;
  await assert.rejects(executeProvider(dir, r, f.signer, f.transport, () => undefined));
  await readFile(join(dir, "intent.json")); await readFile(join(dir, "entered.json")); await assert.rejects(readFile(join(dir, "verified.json")), { code: "ENOENT" });
  await assert.rejects(executeProvider(dir, r, f.signer, f.transport, () => undefined), { code: "EEXIST" }); assert.equal(f.state.sends, 1); assert.equal(f.state.signatures, 1);
});
test("changed nonce/balance/fees/project/database and reconstructed review stop before signer", async () => {
  for (const change of [(f: ReturnType<typeof providerFixture>) => { f.state.nonce++; },
    (f: ReturnType<typeof providerFixture>) => { f.state.balance = "4999999999999999999999999"; },
    (f: ReturnType<typeof providerFixture>) => { f.state.feeChanged = true; },
    (f: ReturnType<typeof providerFixture>) => { f.state.project.revision = "2"; },
    (f: ReturnType<typeof providerFixture>) => { f.state.databaseNonce++; }]) {
    const f = providerFixture(), r = await prepareProvider(f.publicKey, f.gateKey, f.databaseKey, f.transport), dir = await directory(); change(f);
    await assert.rejects(executeProvider(dir, r, f.signer, f.transport, () => undefined)); assert.equal(f.state.signatures, 0);
  }
  const f = providerFixture(), r = await prepareProvider(f.publicKey, f.gateKey, f.databaseKey, f.transport), dir = await directory();
  await assert.rejects(executeProvider(dir, { ...r }, f.signer, f.transport, () => undefined), /UNISSUED/u);
  const results = await Promise.allSettled([1, 2].map(() => executeProvider(dir, r, f.signer, f.transport, () => undefined)));
  assert.equal(results.filter(v => v.status === "fulfilled").length, 1); assert.equal(f.state.sends, 1); await assert.rejects(writeProviderRecord(dir, "../intent.json", {}));
});
test("wall expiry and immutable detached original review", async () => {
  const f = providerFixture(), r = await prepareProvider(f.publicKey, f.gateKey, f.databaseKey, f.transport), dir = await directory(), original = Date.now;
  try { Date.now = () => r.prepared_at_ms + 60000; await assert.rejects(executeProvider(dir, r, f.signer, f.transport, () => undefined), /EXPIRED/u); }
  finally { Date.now = original; }
  assert.equal(Object.isFrozen(r.project), true); assert.equal(f.state.sends, 0); await assert.rejects(readFile(join(dir, "review.json")), { code: "ENOENT" });
});
test("FINAL inspector refuses altered args/value/action/costs and missing/failed/unrelated/duplicate graphs", async () => {
  const f = providerFixture(), r = await prepareProvider(f.publicKey, f.gateKey, f.databaseKey, f.transport), valid = finalProviderResponse(r.transaction, r.transaction_hash, f.hash);
  const change = (fn: (v: typeof valid) => void) => { const v = structuredClone(valid); fn(v); assert.throws(() => inspectProviderExecution(r.transaction, r.transaction_hash, v)); };
  change(v => { v.transaction.nonce++; }); change(v => { v.transaction.actions[0].FunctionCall.deposit = "0"; });
  change(v => { v.transaction.actions[0].FunctionCall.args = ""; }); change(v => { v.status.SuccessValue = ""; });
  change(v => { v.receipts_outcome = []; }); change(v => { v.receipts_outcome.push(v.receipts_outcome[0]); });
  change(v => { v.receipts_outcome[0].outcome.status.SuccessValue = ""; }); change(v => { v.receipts_outcome[1].outcome.executor_id = providerTerms.publisher_id; });
  change(v => { v.receipts_outcome[1].outcome.receipt_ids.push(f.hash); }); change(v => { v.receipts_outcome[0].outcome.tokens_burnt = "1e24"; });
});
test("RPC duplicate/oversize/mixed block and one-send guard fail closed", async () => {
  const f = providerFixture();
  for (const body of ['{"jsonrpc":"2.0","id":"wrong","result":{}}', '{"result":{},"result":{}}', "x".repeat(65537)])
    await assert.rejects(prepareProvider(f.publicKey, f.gateKey, f.databaseKey, async () => new Response(body)));
  await assert.rejects(prepareProvider(f.publicKey, f.gateKey, f.databaseKey, async (url, input) => {
    const response = await f.transport(url, input), data = JSON.parse(await response.text()); if (data.result.block_hash) data.result.block_height++;
    return new Response(JSON.stringify(data));
  }));
  const r = await prepareProvider(f.publicKey, f.gateKey, f.databaseKey, f.transport), rpc = providerRpc(f.transport), bytes = f.signer(r.transaction);
  await rpc.send(r.transaction, bytes); await assert.rejects(rpc.send(r.transaction, bytes), /SEND_REFUSED/u); assert.equal(f.state.sends, 1);
});
test("native default review label stays HTTP on fresh recheck; global fetch is synthetic", async () => {
  const f = providerFixture(), dir = await directory(), original = globalThis.fetch;
  try {
    globalThis.fetch = async (input, init) => { if (typeof input !== "string" || !init) throw Error("UNEXPECTED_FETCH"); return f.transport(input, init); };
    const r = await prepareProvider(f.publicKey, f.gateKey, f.databaseKey); assert.equal(r.setup.transport_source, "EXPLICIT_TESTNET_HTTP_READBACK");
    await executeProvider(dir, r, f.signer, undefined, () => undefined); assert.equal(f.state.sends, 1);
  } finally { globalThis.fetch = original; }
});
test("signer failure/wrong wire keeps intent, never sends or falls back", async () => {
  for (const fail of [true, false]) {
    const f = providerFixture(), dir = await directory(), r = await prepareProvider(f.publicKey, f.gateKey, f.databaseKey, f.transport);
    await assert.rejects(executeProvider(dir, r, tx => { if (fail) throw Error("SIGNER_FAILURE"); const b = f.signer(tx); b[0] ^= 1; return b; }, f.transport, () => undefined));
    await readFile(join(dir, "intent.json")); await assert.rejects(readFile(join(dir, "entered.json")), { code: "ENOENT" }); assert.equal(f.state.sends, 0);
  }
});
test("initial read time is included in the 60-second wall deadline, not renewed after slow RPC", async () => {
  const f = providerFixture(), original = Date.now; let clock = original();
  try {
    Date.now = () => clock;
    await assert.rejects(prepareProvider(f.publicKey, f.gateKey, f.databaseKey, async (url, input) => {
      const request = JSON.parse(String(input.body)); if (request.method === "gas_price") clock += 60000;
      return f.transport(url, input);
    }), /REVIEW_EXPIRED/u);
  } finally { Date.now = original; }
  assert.equal(f.state.sends, 0); assert.equal(f.state.signatures, 0);
});
test("provider supplementary HTTP failures are sanitized and never retried", async () => {
  const f = providerFixture(); let failures = 0;
  await assert.rejects(prepareProvider(f.publicKey, f.gateKey, f.databaseKey, async (url, input) => {
    const request = JSON.parse(String(input.body));
    if (request.method === "EXPERIMENTAL_protocol_config") { failures++; return new Response("UNTRUSTED_BODY_NOT_LOGGED", { status: 429 }); }
    return f.transport(url, input);
  }), /PROVIDER_RPC_HTTP_429/u);
  assert.equal(failures, 1); assert.equal(f.state.signatures, 0); assert.equal(f.state.sends, 0);
});
test("same semantic account/project/database state on an advancing final block stays comparable", async () => {
  const f = providerFixture(); let height = 1000;
  const transport = async (url: string, input: RequestInit) => {
    const request = JSON.parse(String(input.body)), originalBlock = request.params?.block_id;
    if (request.method === "query") request.params.block_id = f.hash;
    const response = await f.transport(url, { ...input, body: JSON.stringify(request) }), data = JSON.parse(await response.text());
    if (request.method === "block") { height++; data.result.header.height = height; data.result.header.hash = height === 1001 ? "11111111111111111111111111111111" : f.hash; }
    if (request.method === "query") { data.result.block_hash = originalBlock; data.result.block_height = height; }
    return new Response(JSON.stringify(data));
  };
  const r = await prepareProvider(f.publicKey, f.gateKey, f.databaseKey, transport), fresh = await prepareProvider(f.publicKey, f.gateKey, f.databaseKey, transport);
  assert.notEqual(r.setup.reviewed_block.hash, fresh.setup.reviewed_block.hash); assert.equal(r.initial_accounts, fresh.initial_accounts);
  assert.equal(r.database, fresh.database); assert.equal(r.setup.state_hash, fresh.setup.state_hash);
});
test("post-execution database change cannot masquerade as registration-only proof", async () => {
  const f = providerFixture(), r = await prepareProvider(f.publicKey, f.gateKey, f.databaseKey, f.transport), dir = await directory();
  await assert.rejects(executeProvider(dir, r, f.signer, async (url, input) => {
    const response = await f.transport(url, input); if (JSON.parse(String(input.body)).method === "send_tx") f.state.databaseNonce++;
    return response;
  }, () => undefined), /FINAL_STATE_UNPROVEN/u);
  await readFile(join(dir, "entered.json")); await assert.rejects(readFile(join(dir, "verified.json")), { code: "ENOENT" });
  assert.equal(f.state.sends, 1);
});
