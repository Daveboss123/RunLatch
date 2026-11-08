/** Explicit in-memory test injection and LOCAL byte-send only; no supplied real key or public action. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { consumeRestrictedProcessKey, createInjectedLocalSigningExercise, disposeRestrictedProcessKey } from "../../scripts/near/restricted-process-key.ts";
import { encodeUnsignedAgentTransaction } from "../../scripts/near/transaction-codec.ts";
import { inspectSignedAgentEnvelope } from "../../scripts/near/signature-envelope.ts";
import { createAttemptJournal } from "../../scripts/near/attempt-journal.ts";
import { createLocalKeyGuard } from "../../scripts/near/local-key-guard.ts";
import { createLocalSequentialKey } from "../../scripts/near/local-sequential-key.ts";
import { exerciseLocalSignedRun } from "../../scripts/near/local-runner-exercise.ts";
import { preparePurchaseReview } from "../../src/lib/near/action-review.ts";
import { injectedKeyFixture, processKeyMaterial } from "./helpers/process-key.ts";
import { signedRunFixture, acknowledgeTransport } from "./helpers/signed-run.ts";
import { nextRunFixture, reconciliationFixture } from "./helpers/nonce-reconciliation.ts";

test("explicit injection consumes only the own slot and exposes public consistency, never secret/key/authority", () => {
  const m = processKeyMaterial(), secret = m.environment.RUNLATCH_AGENT_PRIVATE_KEY; let reads = 0;
  Object.defineProperty(m.environment, "UNRELATED_SECRET", { get: () => { reads++; throw new Error("PRIVATE_CANARY"); } });
  const handle = consumeRestrictedProcessKey(m.target, m.keyScope, m.environment);
  assert.equal(Object.hasOwn(m.environment, "RUNLATCH_AGENT_PRIVATE_KEY"), false); assert.equal(reads, 0);
  assert.equal(handle.public_key, m.publicKey); assert.equal(handle.public_signing_enabled, false); assert.ok(Object.isFrozen(handle));
  assert.ok(!JSON.stringify(handle).includes(secret)); assert.ok(!("key" in handle)); assert.ok(!("privateKey" in handle));
  assert.throws(() => createInjectedLocalSigningExercise({ ...handle }), /UNISSUED_PROCESS_KEY_HANDLE/u);
  disposeRestrictedProcessKey(handle); disposeRestrictedProcessKey(handle);
  assert.throws(() => createInjectedLocalSigningExercise(handle), /PROCESS_KEY_DISPOSED/u);
});
test("bounded strict format rejects empty/oversized/raw/PEM/JWK/space/padding and sanitizes every error", () => {
  const m = processKeyMaterial(), valid = m.environment.RUNLATCH_AGENT_PRIVATE_KEY;
  for (const value of [undefined, null, 1, "", "PRIVATE_CANARY", "ed25519:PRIVATE_CANARY", "x".repeat(4096), `${valid}=`, ` ${valid}`,
    { d: "PRIVATE_CANARY" }, m.key.privateKey.export({ format: "pem", type: "pkcs8" }), JSON.stringify(m.key.privateKey.export({ format: "jwk" }))]) {
    const env = { RUNLATCH_AGENT_PRIVATE_KEY: value };
    assert.throws(() => consumeRestrictedProcessKey(m.target, m.keyScope, env), error => {
      assert.ok(error instanceof Error); assert.equal(error.message, "PROCESS_KEY_INVALID_OR_MISMATCHED");
      assert.ok(!("cause" in error)); return true;
    });
    assert.equal(Object.hasOwn(env, "RUNLATCH_AGENT_PRIVATE_KEY"), false);
  }
});
test("crypto import rejects corrupted/noncanonical/trailing DER, wrong algorithm and another derived public key", () => {
  const m = processKeyMaterial(), other = processKeyMaterial();
  const x = generateKeyPairSync("x25519").privateKey.export({ format: "der", type: "pkcs8" });
  const bytes = Buffer.from(m.environment.RUNLATCH_AGENT_PRIVATE_KEY, "base64url"), corrupt = Buffer.from(bytes); corrupt[0] ^= 1;
  for (const value of [corrupt.toString("base64url"), x.toString("base64url"), Buffer.alloc(48).toString("base64url"),
    Buffer.concat([bytes, Buffer.from([0])]).toString("base64url"), other.environment.RUNLATCH_AGENT_PRIVATE_KEY]) {
    const env = { RUNLATCH_AGENT_PRIVATE_KEY: value };
    assert.throws(() => consumeRestrictedProcessKey(m.target, m.keyScope, env), /PROCESS_KEY_INVALID_OR_MISMATCHED/u);
    assert.equal(Object.hasOwn(env, "RUNLATCH_AGENT_PRIVATE_KEY"), false);
  }
  bytes.fill(0); corrupt.fill(0); x.fill(0);
});
test("invalid public target/scope fails before any secret-slot read or removal", () => {
  const m = processKeyMaterial(); let reads = 0;
  const env = Object.defineProperty({}, "RUNLATCH_AGENT_PRIVATE_KEY", { get: () => { reads++; throw new Error("CANARY"); } });
  assert.throws(() => consumeRestrictedProcessKey({ ...m.target, network: "mainnet" }, m.keyScope, env), /TESTNET_ONLY/u);
  assert.throws(() => consumeRestrictedProcessKey(m.target, { ...m.keyScope, agent_id: m.target.operator_id }, env), /INVALID_RESTRICTED_AGENT_SCOPE/u);
  assert.throws(() => consumeRestrictedProcessKey(m.target, { ...m.keyScope, recovery_public_key: m.publicKey }, env), /INVALID_RESTRICTED_AGENT_SCOPE/u);
  assert.throws(() => consumeRestrictedProcessKey(m.target, { ...m.keyScope, max_allowance: "0" }, env), /INVALID_RESTRICTED_AGENT_SCOPE/u);
  assert.equal(reads, 0); assert.ok(Object.hasOwn(env, "RUNLATCH_AGENT_PRIVATE_KEY"));
});
test("missing/inherited/accessor/frozen/proxy environments never run getters/traps or fall back", () => {
  const m = processKeyMaterial(); let touched = 0;
  const getter = Object.defineProperty({}, "RUNLATCH_AGENT_PRIVATE_KEY", { get: () => { touched++; return "CANARY"; } });
  const proxy = new Proxy({}, { getOwnPropertyDescriptor: () => { touched++; throw new Error("CANARY"); } });
  for (const env of [undefined, null, [], {}, Object.create(m.environment), getter, Object.freeze({ ...m.environment }), proxy]) {
    assert.throws(() => consumeRestrictedProcessKey(m.target, m.keyScope, env), /UNSAFE_PROCESS_KEY_ENVIRONMENT|PROCESS_KEY_INJECTION_UNAVAILABLE/u);
  }
  assert.equal(touched, 0); assert.ok(Object.hasOwn(m.environment, "RUNLATCH_AGENT_PRIVATE_KEY"));
});
test("shared signer adapters cannot prepare the same request twice; disposing/reinjecting cannot reset consumption", async () => {
  const f = injectedKeyFixture(), second = createInjectedLocalSigningExercise(f.handle), r = await signedRunFixture(f.signer);
  const prepared = f.signer.signReview(r.review, r.review, r.confirmation, 30n);
  assert.equal(prepared.signature_verified, true);
  assert.throws(() => second.signReview(r.review, r.review, r.confirmation, 30n), /LOCAL_SIGNATURE_ALREADY_PREPARED/u);
  disposeRestrictedProcessKey(f.handle);
  assert.throws(() => second.signReview(r.review, r.review, r.confirmation, 30n), /PROCESS_KEY_DISPOSED/u);
  const reinject = { RUNLATCH_AGENT_PRIVATE_KEY: f.key.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64url") };
  assert.throws(() => consumeRestrictedProcessKey(f.target, f.keyScope, reinject), /PROCESS_KEY_ALREADY_LOADED/u);
  // No implicit read/delete on a refused duplicate config; caller owns and must discard this unused test input.
  assert.ok(Object.hasOwn(reinject, "RUNLATCH_AGENT_PRIVATE_KEY")); assert.ok(Reflect.deleteProperty(reinject, "RUNLATCH_AGENT_PRIVATE_KEY"));
});
test("imported key signs the existing exact hash identically to its original generated key, detached bytes only", async () => {
  const f = injectedKeyFixture(), r = await signedRunFixture(f.signer);
  const prepared = f.signer.signReview(r.review, r.review, r.confirmation, 30n), checked = inspectSignedAgentEnvelope(prepared.signed_bytes);
  const unsigned = encodeUnsignedAgentTransaction(checked.transaction), expected = sign(null, createHash("sha256").update(unsigned.unsigned_bytes).digest(), f.key.privateKey);
  assert.deepEqual(Buffer.from(prepared.signed_bytes).subarray(-64), expected);
  const copy = prepared.signed_bytes; copy.fill(0); assert.equal(inspectSignedAgentEnvelope(prepared.signed_bytes).signature_verified, true);
  assert.equal(checked.transaction.method, "submit_purchase"); assert.equal(checked.transaction.attached_deposit, "0");
  assert.equal(prepared.public_execution, false); assert.equal(prepared.payment_evidence, "NOT_OBSERVED");
  disposeRestrictedProcessKey(f.handle);
});
test("pinned endpoint/code target/recovery/allowance cannot be broadened through another issued local review", async () => {
  const f = injectedKeyFixture(), r = await signedRunFixture(f.signer);
  const variants = [
    await preparePurchaseReview({ ...r.target, rpc_url: "https://test.rpc.fastnear.com/" }, r.action, r.context),
    await preparePurchaseReview(r.target, r.action, { ...r.context, access: { ...r.context.access, recovery_public_key: `ed25519:${"3".repeat(44)}` } }),
    await preparePurchaseReview({ ...r.target, expected_code_hash: "3".repeat(32) }, r.action, r.context),
    await preparePurchaseReview(r.target, r.action, { ...r.context, access: { ...r.context.access, allowance_cap: "250000000000000000000001" } }),
  ];
  for (const review of variants) assert.throws(() => f.signer.signReview(review, review, { consent: true, review_hash: review.review_hash }, 30n), /KEY_REVIEW_MISMATCH|SCOPE_REVIEW_MISMATCH/u);
  assert.equal(f.signer.signReview(r.review, r.review, r.confirmation, 30n).signature_verified, true);
  disposeRestrictedProcessKey(f.handle);
});
test("HTTP/owner/clone/cancelled/expired reviews cannot activate injected signing or an owner fallback", async () => {
  const f = injectedKeyFixture(), r = await signedRunFixture(f.signer);
  const http = await preparePurchaseReview(r.target, r.action, { ...r.context, transport_source: "EXPLICIT_TESTNET_HTTP_READBACK" });
  assert.throws(() => f.signer.signReview(http, http, { consent: true, review_hash: http.review_hash }, 30n), /PUBLIC_SIGNING_NOT_ADMITTED/u);
  const owner = { ...r.review, action: { ...r.review.action, method: "approve_purchase" as const } };
  assert.throws(() => f.signer.signReview(owner, owner, r.confirmation, 30n), /PUBLIC_SIGNING_NOT_ADMITTED/u);
  assert.throws(() => f.signer.signReview({ ...r.review }, r.review, r.confirmation, 30n), /UNISSUED_ACTION_REVIEW/u);
  assert.throws(() => f.signer.signReview(r.review, r.review, r.confirmation, BigInt(r.review.expires_at_ns)), /REVIEW_EXPIRED/u);
  const controller = new AbortController(); controller.abort();
  assert.throws(() => f.signer.signReview(r.review, r.review, r.confirmation, 30n, controller.signal), /LOCAL_SIGNING_CANCELLED/u);
  disposeRestrictedProcessKey(f.handle);
});
test("injected signer reuses request/key/capture/entry ordering; unknown-send and disposal keep permanent markers", async () => {
  const f = injectedKeyFixture(), r = await signedRunFixture(f.signer), ns = `injected-${randomUUID()}`;
  const journal = await createAttemptJournal(ns), guard = await createLocalKeyGuard(ns); let calls = 0;
  const ports = { journal, keyGuard: guard, signer: f.signer, freshReview: async () => r.review, nowNs: () => 30n,
    transport: async () => {
      calls++;
      const requestFiles = await readdir(new URL(`../../.local/testnet-mvp/single-attempt/${ns}/`, import.meta.url));
      const keyFiles = await readdir(new URL(`../../.local/testnet-mvp/key-guard/${ns}/`, import.meta.url));
      assert.equal(requestFiles.length, 3); assert.equal(keyFiles.length, 2); throw new Error("UNKNOWN_PRIVATE_CANARY");
    } };
  const result = await exerciseLocalSignedRun(r.review, r.confirmation, ports);
  assert.equal(result.status, "RESULT_UNKNOWN"); assert.ok(result.intent?.transaction_hash); assert.equal(calls, 1);
  disposeRestrictedProcessKey(f.handle);
  await assert.rejects(exerciseLocalSignedRun(r.review, r.confirmation, ports), /ATTEMPT_ALREADY_CLAIMED/u); assert.equal(calls, 1);
  for (const directory of ["single-attempt", "key-guard"]) {
    const url = new URL(`../../.local/testnet-mvp/${directory}/${ns}/`, import.meta.url);
    const files = await Promise.all((await readdir(url)).map(n => readFile(new URL(n, url), "utf8")));
    assert.ok(files.every(s => !/PRIVATE_CANARY|PRIVATE_KEY|signed_bytes|privateKey/u.test(s)));
  }
});
test("same injected ephemeral key uses three distinct sequential slots with exact issued reconciliation only", async () => {
  const f = injectedKeyFixture(), ns = `injected-seq-${randomUUID()}`, coordinator = await createLocalSequentialKey(ns), journal = await createAttemptJournal(ns);
  let r = await signedRunFixture(f.signer), prior = null, calls = 0;
  for (const request of ["database", "hosting", "adverse"]) {
    if (prior) r = await nextRunFixture(r, prior.access.nonce, request);
    const result = await exerciseLocalSignedRun(r.review, r.confirmation, { journal, keyGuard: coordinator.forRun(prior), signer: f.signer,
      freshReview: async () => r.review, nowNs: () => BigInt(r.review.reviewed_at_ns), transport: acknowledgeTransport(() => calls++) });
    assert.equal(result.status, "RETURNED_UNVERIFIED");
    prior = (await reconciliationFixture(r, (await coordinator.lastIdentity(r.review))!)).reconcile();
  }
  assert.equal(calls, 3); assert.equal(prior?.access.nonce, "10");
  disposeRestrictedProcessKey(f.handle);
});
test("generated child process injection is removed before a later child inherits its environment", async () => {
  const code = `
    import {processKeyMaterial} from './tests/near/helpers/process-key.ts';
    import {consumeRestrictedProcessKey,disposeRestrictedProcessKey} from './scripts/near/restricted-process-key.ts';
    import {execFileSync} from 'node:child_process';
    const m=processKeyMaterial();
    process.env.RUNLATCH_AGENT_PRIVATE_KEY=m.environment.RUNLATCH_AGENT_PRIVATE_KEY;
    delete m.environment.RUNLATCH_AGENT_PRIVATE_KEY;
    const handle=consumeRestrictedProcessKey(m.target,m.keyScope,process.env);
    const child=execFileSync(process.execPath,['-e',"process.stdout.write(String(process.env.RUNLATCH_AGENT_PRIVATE_KEY===undefined))"],{encoding:'utf8'});
    disposeRestrictedProcessKey(handle);
    if(child!=='true'||Object.hasOwn(process.env,'RUNLATCH_AGENT_PRIVATE_KEY'))throw Error('EPHEMERAL_REMOVAL_FAILED');
    for(let i=1;i<64;i++){
      const next=processKeyMaterial();
      disposeRestrictedProcessKey(consumeRestrictedProcessKey(next.target,next.keyScope,next.environment));
    }
    const over=processKeyMaterial();
    try{consumeRestrictedProcessKey(over.target,over.keyScope,over.environment);throw Error('UNBOUNDED_LOAD');}
    catch(error){if(error.message!=='PROCESS_KEY_LOAD_LIMIT')throw Error('LOAD_LIMIT_MISMATCH');}
    process.stdout.write('REMOVED_NOT_INHERITED');
  `;
  const output = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", code], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)), timeout: 10_000, maxBuffer: 4096, env: { NODE_ENV: "test" } });
  assert.equal(output.stdout, "REMOVED_NOT_INHERITED"); assert.equal(output.stderr, "");
});
