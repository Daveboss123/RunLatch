/** Actual ephemeral local signing + offline journal, never account setup/RPC execution/payment. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { createLocalSigningExercise } from "../../scripts/near/local-signing-exercise.ts";
import { createAttemptJournal } from "../../scripts/near/attempt-journal.ts";
import { exerciseSingleAttempt } from "../../scripts/near/single-attempt.ts";
import { inspectSignedAgentEnvelope } from "../../scripts/near/signature-envelope.ts";
import { preparePurchaseReview } from "../../src/lib/near/action-review.ts";
import { inspectRestrictedAccess } from "../../src/lib/near/agent-access.ts";
import { parseTestnetTarget } from "../../src/lib/near/testnet-target.ts";
import { buildProjectReport } from "../../src/lib/reporting/project.ts";
import { encodeBase58_32 } from "../../scripts/near/base58.ts";
import { reviewFixture, scope } from "../frontend/helpers/action-review.ts";
import { target } from "../frontend/helpers/testnet-evidence.ts";

async function fixture() {
  const signer = createLocalSigningExercise(), data = await reviewFixture();
  const action = {...data.action, public_key:signer.public_key};
  const keyScope = {...scope, public_key:signer.public_key};
  const access = inspectRestrictedAccess(keyScope, parseTestnetTarget(target), data.key, {keys:[{public_key:signer.public_key,access_key:data.key}, data.keys[1]]});
  const snapshot = {...data.f.snapshot, capsule:{...data.f.snapshot.capsule, policy:{...data.f.snapshot.capsule.policy,agent_public_key:signer.public_key}}};
  const block = {...data.f.context.block,hash:encodeBase58_32(new Uint8Array(32).fill(7))};
  const report = await buildProjectReport(JSON.stringify({source:"NEAR_TESTNET_OBSERVATION",contract_id:target.contract_id,network_tag:"testnet",block_hash:block.hash,
    project_id:snapshot.project.input.project_id,snapshots:[snapshot]}),{project_id:snapshot.project.input.project_id,budget:true,expenses:false,evidence:false});
  const context = {block, snapshot, quote:data.f.quote, provider:data.f.provider, access, financials:report.financials,
    transport_source:"INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE" as const};
  const review = await preparePurchaseReview(target, action, context), confirmation = {consent:true,review_hash:review.review_hash};
  return {signer,data,action,context,review,confirmation};
}
test("ephemeral signer validates exact issued review/key/nonce and returns no private key or payment claim", async () => {
  const f = await fixture(), prepared = f.signer.signReview(f.review,f.review,f.confirmation,30n);
  const checked = inspectSignedAgentEnvelope(prepared.signed_bytes);
  assert.equal(checked.transaction.nonce,"8"); assert.equal(checked.transaction.block_hash,f.review.reviewed_block.hash);
  assert.deepEqual(checked.transaction.args,f.review.call.args); assert.equal(prepared.intent.transaction_hash,checked.transaction_hash);
  assert.equal(prepared.public_execution,false); assert.equal(prepared.payment_evidence,"NOT_OBSERVED");
  assert.equal(f.signer.public_signing_enabled,false); assert.ok(!("privateKey" in f.signer));
  assert.throws(() => f.signer.signReview(f.review,f.review,f.confirmation,30n),/LOCAL_SIGNATURE_ALREADY_PREPARED/u);
});
test("cloned/wrong confirmation/key/stale/cancelled review rejected before signing", async () => {
  const f = await fixture(), other = createLocalSigningExercise();
  assert.throws(() => f.signer.signReview({...f.review},f.review,f.confirmation,30n),/UNISSUED_ACTION_REVIEW/u);
  assert.throws(() => f.signer.signReview(f.review,f.review,{...f.confirmation,consent:false},30n),/CONFIRMATION_REQUIRED/u);
  assert.throws(() => other.signReview(f.review,f.review,f.confirmation,30n),/KEY_REVIEW_MISMATCH/u);
  for (const now of [29n,BigInt(f.review.expires_at_ns)]) assert.throws(() => f.signer.signReview(f.review,f.review,f.confirmation,now),/REVIEW_EXPIRED/u);
  const controller = new AbortController(); controller.abort();
  assert.throws(() => f.signer.signReview(f.review,f.review,f.confirmation,30n,controller.signal),/LOCAL_SIGNING_CANCELLED/u);
  assert.equal(f.signer.signReview(f.review,f.review,f.confirmation,30n).signature_verified,true);
});
test("HTTP-labelled contexts or approvals never activate a public or owner signer", async () => {
  const f = await fixture(), http = await preparePurchaseReview(target,f.action,{...f.context,transport_source:"EXPLICIT_TESTNET_HTTP_READBACK"});
  assert.throws(() => f.signer.signReview(http,http,{consent:true,review_hash:http.review_hash},30n),/PUBLIC_SIGNING_NOT_ADMITTED/u);
  const owner = {...f.review, action:{...f.review.action,method:"approve_purchase" as const}};
  assert.throws(() => f.signer.signReview(owner,owner,{consent:true,review_hash:owner.review_hash},30n),/PUBLIC_SIGNING_NOT_ADMITTED/u);
});
test("real signed identity is journaled before one offline invocation; restart cannot re-sign/reinvoke", async () => {
  const f = await fixture(), namespace = `signed-${randomUUID()}`, journal = await createAttemptJournal(namespace);
  const directory = new URL(`../../.local/testnet-mvp/single-attempt/${namespace}/`,import.meta.url);
  let signatures = 0, invocations = 0;
  const ports = {journal,nowNs:()=>30n,freshReview:async()=>f.review,prepareIdentity:async()=>{
    const prepared = f.signer.signReview(f.review,f.review,f.confirmation,30n); signatures++;
    return {intent:prepared.intent,invoke:async()=>{
      invocations++; assert.equal((await readdir(directory)).length,3);
      const markers = await Promise.all((await readdir(directory)).map(async name=>JSON.parse(await readFile(new URL(name,directory),"utf8"))));
      assert.equal(markers.find(m=>m.event==="IDENTITY_CAPTURED").intent.transaction_hash,inspectSignedAgentEnvelope(prepared.signed_bytes).transaction_hash);
      assert.ok(markers.every(m=>!("signed_bytes" in m)&&!("privateKey" in m))); return {settled:true};
    }};
  }};
  const result = await exerciseSingleAttempt(f.review,f.confirmation,ports);
  assert.equal(result.status,"RETURNED_UNVERIFIED"); assert.equal(result.payment_evidence,"NOT_OBSERVED");
  const restarted = await createAttemptJournal(namespace);
  await assert.rejects(exerciseSingleAttempt(f.review,f.confirmation,{...ports,journal:restarted}),/ATTEMPT_ALREADY_CLAIMED/u);
  assert.equal(signatures,1); assert.equal(invocations,1);
});
test("unknown invocation retains real signed identity and never signs again", async () => {
  const f = await fixture(), journal = await createAttemptJournal(`unknown-${randomUUID()}`);
  let signatures = 0;
  const ports = {journal,nowNs:()=>30n,freshReview:async()=>f.review,prepareIdentity:async()=>{
    const prepared = f.signer.signReview(f.review,f.review,f.confirmation,30n); signatures++;
    return {intent:prepared.intent,invoke:async()=>{throw new Error("UNTRUSTED_CANARY");}};
  }};
  const result = await exerciseSingleAttempt(f.review,f.confirmation,ports);
  assert.equal(result.status,"RESULT_UNKNOWN"); assert.ok(result.intent?.transaction_hash); assert.ok(!JSON.stringify(result).includes("CANARY"));
  await assert.rejects(exerciseSingleAttempt(f.review,f.confirmation,ports),/ATTEMPT_ALREADY_CLAIMED/u); assert.equal(signatures,1);
});
