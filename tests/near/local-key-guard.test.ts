/** Local filesystem samples only, not distributed/tamper-proof/power-loss guarantees. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createLocalKeyGuard } from "../../scripts/near/local-key-guard.ts";
import { preparePurchaseReview } from "../../src/lib/near/action-review.ts";
import { createLocalSigningExercise } from "../../scripts/near/local-signing-exercise.ts";
import { encodeBase58_32 } from "../../scripts/near/base58.ts";
import { signedRunFixture } from "./helpers/signed-run.ts";

async function guardFixture() {
  const f = await signedRunFixture(), namespace = `guard-${randomUUID()}`, guard = await createLocalKeyGuard(namespace);
  const directory = new URL(`../../.local/testnet-mvp/key-guard/${namespace}/`, import.meta.url);
  return { ...f, namespace, guard, directory };
}
test("key claim is synced before ephemeral signature capture, contains public data only and has no release API", async () => {
  const f = await guardFixture(), lease = await f.guard.claim(f.review, f.confirmation, 30n);
  assert.equal(lease.nonce, "8"); assert.equal((await readdir(f.directory)).length, 1);
  const signed = f.signer.signReview(f.review, f.review, f.confirmation, 30n);
  assert.equal((await f.guard.capture(lease, signed.signed_bytes)).transaction_hash, signed.intent.transaction_hash);
  const markers = await Promise.all((await readdir(f.directory)).map(async name => JSON.parse(await readFile(new URL(name, f.directory), "utf8"))));
  assert.deepEqual(markers.map(m => m.event), ["KEY_CLAIMED", "SIGNED_IDENTITY_CAPTURED"]);
  assert.ok(markers.every(m => m.public_execution === false && m.payment_evidence === "NOT_OBSERVED" && !("signed_bytes" in m) && !("privateKey" in m)));
  assert.ok(!("release" in f.guard)); assert.ok(!("reset" in f.guard));
  await assert.rejects(f.guard.claim(f.review, f.confirmation, 30n), /KEY_ALREADY_CLAIMED/u);
});
test("same account/key cannot evade a marker using request, revision, endpoint, observed nonce or code changes", async () => {
  const f = await guardFixture(); await f.guard.claim(f.review, f.confirmation, 30n);
  const otherRequest = await signedRunFixture(f.signer, "hosting");
  const nonceContext = { ...f.context, access: { ...f.context.access, nonce: "8" } };
  const differentNonce = await preparePurchaseReview(f.target, f.action, nonceContext);
  const revision = await preparePurchaseReview(f.target, { ...f.action, proposal: { ...f.action.proposal, project_revision: "2" } },
    { ...f.context, snapshot: { ...f.context.snapshot, project: { ...f.context.snapshot.project, revision: "2" },
      capsule: { ...f.context.snapshot.capsule, policy: { ...f.context.snapshot.capsule.policy, project_revision: "2" } } } });
  const changedTarget = { ...f.target, rpc_url: "https://test.rpc.fastnear.com/", expected_code_hash: encodeBase58_32(new Uint8Array(32).fill(8)) };
  const differentTarget = await preparePurchaseReview(changedTarget, f.action, f.context);
  for (const review of [otherRequest.review, differentNonce, differentTarget, revision]) {
    await assert.rejects(f.guard.claim(review, { consent: true, review_hash: review.review_hash }, 30n), /KEY_ALREADY_CLAIMED/u);
  }
  assert.equal((await readdir(f.directory)).length, 1);
});
test("another key may get its own slot; a restarted helper with the original key remains blocked", async () => {
  const f = await guardFixture(); await f.guard.claim(f.review, f.confirmation, 30n);
  const g = await signedRunFixture(); await f.guard.claim(g.review, g.confirmation, 30n);
  const restarted = await createLocalKeyGuard(f.namespace);
  await assert.rejects(restarted.claim(f.review, f.confirmation, 30n), /KEY_ALREADY_CLAIMED/u);
  assert.equal((await readdir(f.directory)).length, 2);
});
test("clone/HTTP/invalid consent/expired/overflow review has no claim or signature", async () => {
  const f = await guardFixture();
  await assert.rejects(f.guard.claim({ ...f.review }, f.confirmation, 30n), /UNISSUED_ACTION_REVIEW/u);
  await assert.rejects(f.guard.claim(f.review, { ...f.confirmation, consent: false }, 30n), /CONFIRMATION_REQUIRED/u);
  const http = await preparePurchaseReview(f.target, f.action, { ...f.context, transport_source: "EXPLICIT_TESTNET_HTTP_READBACK" });
  await assert.rejects(f.guard.claim(http, { consent: true, review_hash: http.review_hash }, 30n), /PUBLIC_KEY_COORDINATION_NOT_ADMITTED/u);
  for (const now of [29n, BigInt(f.review.expires_at_ns)]) await assert.rejects(f.guard.claim(f.review, f.confirmation, now), /REVIEW_EXPIRED/u);
  const overflow = await preparePurchaseReview(f.target, f.action, { ...f.context, access: { ...f.context.access, nonce: "18446744073709551615" } });
  await assert.rejects(f.guard.claim(overflow, { consent: true, review_hash: overflow.review_hash }, 30n), /INVALID_CONTRACT_TIME/u);
  assert.deepEqual(await readdir(f.directory), []);
});
test("captured signed bytes must match the exact key/request/nonce/block/args and an issued lease", async () => {
  const f = await guardFixture(), lease = await f.guard.claim(f.review, f.confirmation, 30n);
  const g = await signedRunFixture(createLocalSigningExercise(), "different");
  const wrong = g.signer.signReview(g.review, g.review, g.confirmation, 30n);
  await assert.rejects(f.guard.capture(lease, wrong.signed_bytes), /LOCAL_SIGNED_REVIEW_MISMATCH/u);
  const correct = f.signer.signReview(f.review, f.review, f.confirmation, 30n);
  await assert.rejects(f.guard.capture({ ...lease }, correct.signed_bytes), /UNISSUED_KEY_GUARD_LEASE/u);
  const both = await Promise.allSettled([f.guard.capture(lease, correct.signed_bytes), f.guard.capture(lease, correct.signed_bytes)]);
  assert.equal(both.filter(r => r.status === "fulfilled").length, 1);
  await assert.rejects(f.guard.capture(lease, correct.signed_bytes), /STAGE_MISMATCH/u);
});
test("partial or tampered marker is never overwritten, and capture I/O failure remains consumed", async () => {
  const f = await guardFixture(), lease = await f.guard.claim(f.review, f.confirmation, 30n);
  const filename = new URL(`${lease.key_guard_id}.1.json`, f.directory);
  await writeFile(filename, "INCOMPLETE_MARKER", { flag: "wx" });
  const signed = f.signer.signReview(f.review, f.review, f.confirmation, 30n);
  await assert.rejects(f.guard.capture(lease, signed.signed_bytes));
  await assert.rejects(f.guard.capture(lease, signed.signed_bytes), /STAGE_MISMATCH/u);
  assert.equal(await readFile(filename, "utf8"), "INCOMPLETE_MARKER");
  await assert.rejects((await createLocalKeyGuard(f.namespace)).claim(f.review, f.confirmation, 30n), /KEY_ALREADY_CLAIMED/u);
});
test("namespace traversal and a pre-existing junction are refused without weakening OS settings", async t => {
  for (const namespace of ["../escape", "", "a/b", "C:\\private", "x".repeat(65)]) await assert.rejects(createLocalKeyGuard(namespace));
  const f = await guardFixture(), namespace = `guard-${randomUUID()}`, link = new URL(`../../.local/testnet-mvp/key-guard/${namespace}`, import.meta.url);
  try { await symlink(fileURLToPath(f.directory), link, process.platform === "win32" ? "junction" : "dir"); }
  catch (error) {
    if (error instanceof Error && "code" in error && ["EPERM", "EACCES"].includes(String(error.code))) { t.skip("OS refuses local test junction; settings unchanged."); return; }
    throw error;
  }
  await assert.rejects(createLocalKeyGuard(namespace), /UNSAFE_KEY_GUARD_PATH/u);
  assert.deepEqual(await readdir(f.directory), []);
});
test("two separate Node processes competing for one account/key yield exactly one durable key claim", async () => {
  const f = await guardFixture();
  // Public pattern only; children never receive a private key or sign.
  const code = `
    import {createLocalKeyGuard} from './scripts/near/local-key-guard.ts';
    import {signedRunFixture} from './tests/near/helpers/signed-run.ts';
    import {preparePurchaseReview} from './src/lib/near/action-review.ts';
    const f=await signedRunFixture();
    const public_key=${JSON.stringify(f.signer.public_key)};
    const action={...f.action,public_key};
    const context={...f.context,access:{...f.context.access,public_key},snapshot:{...f.context.snapshot,capsule:{...f.context.snapshot.capsule,
      policy:{...f.context.snapshot.capsule.policy,agent_public_key:public_key}}}};
    const review=await preparePurchaseReview(f.target,action,context);
    const guard=await createLocalKeyGuard(${JSON.stringify(f.namespace)});
    try {await guard.claim(review,{consent:true,review_hash:review.review_hash},30n);console.log('CLAIMED');} catch {console.log('BLOCKED');}
  `;
  const run = () => promisify(execFile)(process.execPath, ["--input-type=module", "-e", code], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)), timeout: 10_000, maxBuffer: 4096,
  });
  const outputs = await Promise.all([run(), run()]);
  assert.deepEqual(outputs.map(r => r.stdout.trim()).sort(), ["BLOCKED", "CLAIMED"]);
  assert.equal((await readdir(f.directory)).length, 1);
});
