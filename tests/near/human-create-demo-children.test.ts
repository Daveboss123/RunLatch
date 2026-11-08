import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { encodeChildTransaction, verifyChildSignature, childAccounts } from "../../scripts/setup/child-account-codec.ts";
import { prepareChildBatch, executeChildBatch, writeChildRecord } from "../../scripts/setup/human-create-demo-children.ts";
import { inspectChildExecution } from "../../scripts/setup/child-account-rpc.ts";
import { admitHumanChildSigner, signHumanChild, importGeneratedOperatorRecord } from "../../scripts/setup/human-demo-signer.ts";
import { readHumanOperatorCredential } from "../../scripts/setup/human-credential-store.ts";
import { childFixture, fixtureTransaction, finalChildResponse } from "./helpers/child-accounts.ts";
async function directory() {
  return mkdtemp(join(process.platform === "win32" ? join(homedir(), "AppData/Local/Temp/opencode") : tmpdir(), "runlatch-child-test-"));
}
test("fixed codec rejects other recipients, amounts, networks, key formats and extra actions", () => {
  const fixture = childFixture(), tx = fixtureTransaction(fixture);
  for (const changed of [{ receiver_id: "other.testnet" }, { amount: "1" }, { network: "mainnet" },
    { nonce: "0" }, { public_key: tx.child_public_key }, { gas: "100" }, { child_public_key: "secp256k1:wrong" }])
    assert.throws(() => encodeChildTransaction({ ...tx, ...changed }));
  assert.equal(encodeChildTransaction(tx).unsigned_bytes.length < 512, true);
  const bytes = fixture.signer(tx);
  assert.equal(verifyChildSignature(tx, bytes.slice(-64)).transaction_hash, encodeChildTransaction(tx).transaction_hash);
  bytes[bytes.length - 1] ^= 1; assert.throws(() => verifyChildSignature(tx, bytes.slice(-64)));
});
test("human signer/store refuse nonTTY/forged consent before real credentials", () => {
  const tx = fixtureTransaction(childFixture());
  assert.throws(() => admitHumanChildSigner([tx, tx, tx], "not approved"));
  assert.throws(() => signHumanChild(tx, {}));
  assert.throws(() => readHumanOperatorCredential(tx.public_key));
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../../scripts/setup/human-create-demo-children.ts", import.meta.url))], { encoding: "utf8", timeout: 5000 });
  assert.equal(result.status, 1); assert.equal(result.stdout, ""); assert.match(result.stderr, /CHILD_SETUP_STOPPED/u);
});
test("stdin read-only module imports do not enter any human key/faucet/signing command", () => {
  const url = new URL("../../scripts/setup/human-create-demo-children.ts", import.meta.url).href;
  const result = spawnSync(process.execPath, ["--input-type=module", "-"], {
    input: `await import(${JSON.stringify(url)}); console.log("READ_ONLY_IMPORT_READY");`, encoding: "utf8", timeout: 5000,
  });
  assert.equal(result.status, 0); assert.equal(result.stdout.trim(), "READ_ONLY_IMPORT_READY"); assert.equal(result.stderr, "");
});
test("generated-record import binds account, public tail and derived Ed25519 key without files", () => {
  const tx = fixtureTransaction(childFixture());
  assert.throws(() => importGeneratedOperatorRecord(Buffer.from('{"account_id":"other.testnet","public_key":"x","private_key":"x"}', "utf16le"), tx.public_key));
  assert.throws(() => importGeneratedOperatorRecord(Buffer.from(JSON.stringify({ account_id: tx.signer_id,
    public_key: tx.public_key, private_key: `ed25519:${"1".repeat(64)}` }), "utf16le"), tx.public_key));
});
test("preflight rejects mainnet, unsafe nonce, unexpected key and existing child", async () => {
  for (const field of ["mainnet", "unsafeNonce", "wrongKey"] as const) {
    const fixture = childFixture(); fixture.state[field] = true;
    await assert.rejects(prepareChildBatch(fixture.keys, fixture.transport));
    assert.equal(fixture.state.signatures, 0); assert.equal(fixture.state.sends, 0);
  }
  const fixture = childFixture(); fixture.state.children.set(childAccounts[0].account_id, childAccounts[0].amount);
  await assert.rejects(prepareChildBatch(fixture.keys, fixture.transport), /CHILD_ALREADY_EXISTS/u);
});
test("three distinct transactions reserve exclusive identities before signing/send and prove each before next", async () => {
  const fixture = childFixture(), dir = await directory(), batch = await prepareChildBatch(fixture.keys, fixture.transport), reports: unknown[] = [];
  const order: number[] = [];
  await executeChildBatch(dir, batch, tx => { order.push(fixture.state.sends); return fixture.signer(tx); }, fixture.transport, value => reports.push(value));
  assert.deepEqual(order, [0, 1, 2]); assert.equal(fixture.state.sends, 3); assert.equal(fixture.state.signatures, 3);
  assert.equal((reports.at(-1) as { status: string }).status, "THREE_CHILD_ACCOUNTS_OBSERVED");
  for (let i = 0; i < 3; i++) {
    const intent = JSON.parse(await readFile(join(dir, `${i}-intent.json`), "utf8"));
    assert.equal(intent.transaction.nonce, String(101 + i));
    assert.equal(JSON.stringify(intent).includes("private_key"), false);
    await readFile(join(dir, `${i}-entered.json`)); await readFile(join(dir, `${i}-verified.json`));
  }
  await assert.rejects(executeChildBatch(dir, batch, fixture.signer, fixture.transport, () => undefined), { code: "EEXIST" });
  assert.equal(fixture.state.signatures, 3);
});
for (const field of ["failSend", "badFinal"] as const) test(`${field} retains hash/marker and stops without second transaction or retry`, async () => {
  const fixture = childFixture(), dir = await directory(), batch = await prepareChildBatch(fixture.keys, fixture.transport);
  fixture.state[field] = true;
  await assert.rejects(executeChildBatch(dir, batch, fixture.signer, fixture.transport, () => undefined));
  assert.equal(fixture.state.sends, 1); assert.equal(fixture.state.signatures, 1);
  await readFile(join(dir, "0-intent.json")); await readFile(join(dir, "0-entered.json"));
  await assert.rejects(readFile(join(dir, "0-verified.json")), { code: "ENOENT" });
  await assert.rejects(readFile(join(dir, "1-intent.json")), { code: "ENOENT" });
  await assert.rejects(executeChildBatch(dir, batch, fixture.signer, fixture.transport, () => undefined), { code: "EEXIST" });
});
test("FINAL requires exact hash/actions/nonce, complete successful receipt graph and actual child executor", () => {
  const fixture = childFixture(), tx = fixtureTransaction(fixture), valid = finalChildResponse(tx, fixture.state.hash);
  assert.equal(inspectChildExecution(tx, valid).status, "FINAL_CHILD_ACTIONS_SUCCEEDED");
  const changes = [
    (r: typeof valid) => { r.transaction.actions.reverse(); },
    (r: typeof valid) => { r.transaction.hash = fixture.state.hash; },
    (r: typeof valid) => { r.transaction.nonce++; },
    (r: typeof valid) => { r.receipts_outcome = []; },
    (r: typeof valid) => { r.receipts_outcome.push(r.receipts_outcome[0]); },
    (r: typeof valid) => { r.receipts_outcome[0].outcome.executor_id = tx.signer_id; },
    (r: typeof valid) => { r.receipts_outcome[0].outcome.receipt_ids.push(fixture.state.hash); },
    (r: typeof valid) => { r.transaction_outcome.outcome.receipt_ids.push(fixture.state.hash); },
    (r: typeof valid) => { r.receipts_outcome[0].outcome.status.SuccessValue = "unproven"; },
    (r: typeof valid) => { r.final_execution_status = "EXECUTED"; },
  ];
  for (const change of changes) { const changed = structuredClone(valid); change(changed); assert.throws(() => inspectChildExecution(tx, changed)); }
});
test("stale reviews and changed current authority stop before signer; permanent markers cannot be overwritten", async () => {
  const fixture = childFixture(), dir = await directory(), batch = await prepareChildBatch(fixture.keys, fixture.transport);
  batch.prepared_at_ms -= 120001;
  await assert.rejects(executeChildBatch(dir, batch, fixture.signer, fixture.transport, () => undefined), /CHILD_REVIEW_EXPIRED/u);
  batch.prepared_at_ms = Date.now(); fixture.state.wrongKey = true;
  await assert.rejects(executeChildBatch(dir, batch, fixture.signer, fixture.transport, () => undefined));
  assert.equal(fixture.state.signatures, 0);
  await assert.rejects(writeChildRecord(dir, "batch.json", {}), { code: "EEXIST" });
  await assert.rejects(writeChildRecord(dir, "../batch.json", {}));
});
