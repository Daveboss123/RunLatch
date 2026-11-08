import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadDeploymentArtifact, prepareDeployment, executeDeployment, writeDeploymentRecord } from "../../scripts/setup/human-deploy-demo-gate.ts";
import { checkedDeploymentCode, encodeDeploymentTransaction, verifyDeploymentSignature } from "../../scripts/setup/deployment-codec.ts";
import { admitHumanDeploymentSigner, signHumanDeployment } from "../../scripts/setup/human-deployment-signer.ts";
import { readHumanContractCredential } from "../../scripts/setup/human-credential-store.ts";
import { inspectDeploymentExecution } from "../../scripts/setup/deployment-rpc.ts";
import { deploymentFixture, finalDeploymentResponse } from "./helpers/deployment.ts";
// Current local checks require the already verified build. Fresh web clones deliberately omit private caches.
let code: Uint8Array | undefined;
try { code = await loadDeploymentArtifact(); } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
const artifactTest = (name: string, run: (wasm: Uint8Array) => Promise<void> | void) => test(name,
  { skip: code ? false : "Pinned default WASM absent; artifact/crypto/RPC composition not exercised in this checkout" }, () => run(code!));
async function directory() { return mkdtemp(join(process.platform === "win32" ? join(homedir(), "AppData/Local/Temp/opencode") : tmpdir(), "runlatch-deployment-test-")); }
test("nonTTY command/signing/credential reads refuse before real store or public network", () => {
  assert.throws(() => admitHumanDeploymentSigner({}, new Uint8Array(), "wrong"));
  assert.throws(() => signHumanDeployment({}, new Uint8Array(), {}));
  assert.throws(() => readHumanContractCredential("not a public key"));
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../../scripts/setup/human-deploy-demo-gate.ts", import.meta.url))], { encoding: "utf8", timeout: 5000 });
  assert.equal(result.status, 1); assert.equal(result.stdout, ""); assert.match(result.stderr, /DEPLOYMENT_STOPPED/u);
});
test("stdin module import never starts human deployment", () => {
  const url = new URL("../../scripts/setup/human-deploy-demo-gate.ts", import.meta.url).href;
  const result = spawnSync(process.execPath, ["--input-type=module", "-"], { input: `await import(${JSON.stringify(url)});`, encoding: "utf8", timeout: 5000 });
  assert.equal(result.status, 0); assert.equal(result.stdout, ""); assert.equal(result.stderr, "");
});
artifactTest("fixed default artifact/actions/signatures reject code, args, account, gas/deposit and scope changes", async wasm => {
  const f = deploymentFixture(wasm), r = await prepareDeployment(f.publicKey, wasm, f.transport), tx = r.transaction;
  for (const changed of [{ network: "mainnet" }, { signer_id: "other.testnet" }, { receiver_id: "other.testnet" },
    { gas: "1" }, { deposit: "1" }, { init_args: "{}" }, { code_bytes: 1 }, { nonce: "0" }, { extra: "pay" }])
    assert.throws(() => encodeDeploymentTransaction({ ...tx, ...changed }, wasm));
  const corrupt = new Uint8Array(wasm); corrupt[0] ^= 1; assert.throws(() => checkedDeploymentCode(corrupt));
  const signed = f.signer(tx, wasm); verifyDeploymentSignature(tx, wasm, signed.slice(-64));
  signed[signed.length - 1] ^= 1; assert.throws(() => verifyDeploymentSignature(tx, wasm, signed.slice(-64)));
});
artifactTest("preflight rejects wrong network/sync/key/unsafe nonce/existing code/state/insufficient collateral", async wasm => {
  for (const flag of ["mainnet", "syncing", "badKey", "badNonce", "stateExists", "deployed"] as const) {
    const f = deploymentFixture(wasm); f.state[flag] = true;
    await assert.rejects(prepareDeployment(f.publicKey, wasm, f.transport)); assert.equal(f.state.signatures, 0); assert.equal(f.state.sends, 0);
  }
  const f = deploymentFixture(wasm); f.state.balance = "4000000000000000000000000";
  await assert.rejects(prepareDeployment(f.publicKey, wasm, f.transport), /FUNDING_INSUFFICIENT/u);
});
artifactTest("one deployment captures exclusive public identity before signing/send and requires FINAL+code+init readback", async wasm => {
  const f = deploymentFixture(wasm), dir = await directory(), r = await prepareDeployment(f.publicKey, wasm, f.transport), reports: unknown[] = [];
  let identitySeen = false;
  await executeDeployment(dir, r, wasm, (tx, bytes) => {
    identitySeen = JSON.parse(readFileSync(join(dir, "intent.json"), "utf8")).transaction_hash === r.transaction_hash;
    assert.equal(identitySeen, true); return f.signer(tx, bytes);
  }, f.transport, v => reports.push(v));
  assert.equal(identitySeen, true); assert.equal(f.state.sends, 1); assert.equal(f.state.signatures, 1);
  const intent = JSON.parse(await readFile(join(dir, "intent.json"), "utf8")); assert.equal(intent.transaction_hash, r.transaction_hash);
  assert.equal(JSON.stringify(intent).includes("private_key"), false);
  const verified = JSON.parse(await readFile(join(dir, "verified.json"), "utf8"));
  assert.equal(verified.status, "GATE_DEPLOYMENT_AND_INIT_OBSERVED"); assert.equal(verified.schema_version, 2);
  assert.equal(verified.gas_burnt, "3"); assert.equal(verified.tokens_burnt_yoctoNEAR, "300000000");
  assert.equal(verified.purchase_executed, false); assert.equal(reports.length, 2);
  await assert.rejects(executeDeployment(dir, r, wasm, f.signer, f.transport, () => undefined), { code: "EEXIST" }); assert.equal(f.state.sends, 1);
});
for (const flag of ["failSend", "badFinal", "wrongInit", "badCode"] as const) artifactTest(`${flag}: retained identity stops without retry/reinit or false completion`, async wasm => {
  const f = deploymentFixture(wasm), dir = await directory(), r = await prepareDeployment(f.publicKey, wasm, f.transport); f.state[flag] = true;
  await assert.rejects(executeDeployment(dir, r, wasm, f.signer, f.transport, () => undefined));
  await readFile(join(dir, "intent.json")); await readFile(join(dir, "entered.json"));
  await assert.rejects(readFile(join(dir, "verified.json")), { code: "ENOENT" });
  await assert.rejects(executeDeployment(dir, r, wasm, f.signer, f.transport, () => undefined), { code: "EEXIST" });
  assert.equal(f.state.sends, 1); assert.equal(f.state.signatures, 1);
});
artifactTest("stale/changed reviews and competing local claims stop before signer", async wasm => {
  const f = deploymentFixture(wasm), dir = await directory(), r = await prepareDeployment(f.publicKey, wasm, f.transport);
  r.prepared_at_ms -= 120001;
  await assert.rejects(executeDeployment(dir, r, wasm, f.signer, f.transport, () => undefined), /REVIEW_EXPIRED/u);
  r.prepared_at_ms = Date.now(); f.state.nonce++;
  await assert.rejects(executeDeployment(dir, r, wasm, f.signer, f.transport, () => undefined), /STATE_CHANGED/u);
  assert.equal(f.state.signatures, 0); await assert.rejects(writeDeploymentRecord(dir, "review.json", {}), { code: "EEXIST" });
  await assert.rejects(writeDeploymentRecord(dir, "../intent.json", {}));
});
artifactTest("FINAL inspector requires exact code digest/action/identity and complete bounded successful graph/costs", async wasm => {
  const f = deploymentFixture(wasm), r = await prepareDeployment(f.publicKey, wasm, f.transport), valid = finalDeploymentResponse(r.transaction, r.transaction_hash, f.hash);
  const change = (fn: (v: typeof valid) => void) => { const v = structuredClone(valid); fn(v); assert.throws(() => inspectDeploymentExecution(r.transaction, r.transaction_hash, v)); };
  change(v => { v.transaction.actions.reverse(); }); change(v => { v.transaction.nonce++; });
  change(v => { v.transaction.hash = f.hash; }); change(v => { v.receipts_outcome = []; });
  change(v => { v.receipts_outcome.push(v.receipts_outcome[0]); });
  change(v => { v.receipts_outcome[0].outcome.receipt_ids.push(f.hash); });
  change(v => { v.receipts_outcome[0].outcome.executor_id = "other.testnet"; });
  change(v => { v.receipts_outcome[0].outcome.status.SuccessValue = "unproven"; });
  change(v => { v.receipts_outcome[0].outcome.gas_burnt = Number.MAX_SAFE_INTEGER + 1; });
  change(v => { v.receipts_outcome[0].outcome.tokens_burnt = "1e24"; });
});
artifactTest("RPC ID, duplicate keys, mixed blocks and oversize responses never reach signing", async wasm => {
  const f = deploymentFixture(wasm);
  for (const body of ['{"jsonrpc":"2.0","id":"wrong","result":{}}', '{"result":{},"result":{}}', "x".repeat(1048577)])
    await assert.rejects(prepareDeployment(f.publicKey, wasm, async () => new Response(body)));
  await assert.rejects(prepareDeployment(f.publicKey, wasm, async (url, input) => {
    const response = await f.transport(url, input), data = JSON.parse(await response.text());
    if (data.result.block_hash) data.result.block_hash = "11111111111111111111111111111111";
    return new Response(JSON.stringify(data));
  })); assert.equal(f.state.signatures, 0);
});
