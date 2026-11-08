/** Signed RPC-shape samples through explicit in-memory transports only. No network calls. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { Buffer } from "node:buffer";
import { createLocalBroadcastExercise } from "../../scripts/near/local-broadcast-exercise.ts";
import { inspectSignedAgentEnvelope } from "../../scripts/near/signature-envelope.ts";
import { preparePurchaseReview } from "../../src/lib/near/action-review.ts";
import { signedRunFixture, acknowledgeTransport } from "./helpers/signed-run.ts";

async function fixture() {
  const f = await signedRunFixture(), signed = f.signer.signReview(f.review, f.review, f.confirmation, 30n);
  return { ...f, signed, signal: new AbortController().signal };
}
test("one broadcast_tx_async request sends exact reviewed bytes to one fixed endpoint with no credentials/redirects", async () => {
  const f = await fixture(); let requests = 0;
  const transport: typeof fetch = async (url, init) => {
    requests++; assert.equal(url, f.target.rpc_url); assert.equal(init?.method, "POST");
    assert.equal(init?.credentials, "omit"); assert.equal(init?.redirect, "error"); assert.equal(init?.cache, "no-store");
    assert.equal(init?.referrerPolicy, "no-referrer"); assert.deepEqual(init?.headers, { "Content-Type": "application/json" });
    const request = JSON.parse(String(init?.body)); assert.deepEqual(Object.keys(request), ["jsonrpc", "id", "method", "params"]);
    assert.equal(request.method, "broadcast_tx_async"); assert.equal(request.params.length, 1);
    const bytes = Buffer.from(request.params[0], "base64"); assert.deepEqual(new Uint8Array(bytes), f.signed.signed_bytes);
    assert.equal(inspectSignedAgentEnvelope(bytes).transaction_hash, f.signed.intent.transaction_hash);
    return Response.json({ jsonrpc: "2.0", id: request.id, result: f.signed.intent.transaction_hash });
  };
  const send = createLocalBroadcastExercise(f.review, f.signed.signed_bytes, transport, () => 30n), result = await send.invoke(f.signal);
  assert.equal(result.status, "ACKNOWLEDGED_UNVERIFIED"); assert.equal(result.payment_evidence, "NOT_OBSERVED"); assert.equal(result.public_execution, false);
  await assert.rejects(send.invoke(f.signal), /ALREADY_CONSUMED/u); assert.equal(requests, 1);
});
test("global/default fetch, HTTP review, clone, changed review and invalid signature cannot construct a send", async () => {
  const f = await fixture(), transport = acknowledgeTransport();
  assert.throws(() => createLocalBroadcastExercise(f.review, f.signed.signed_bytes, fetch, () => 30n), /INJECTED_TRANSPORT_REQUIRED/u);
  const http = await preparePurchaseReview(f.target, f.action, { ...f.context, transport_source: "EXPLICIT_TESTNET_HTTP_READBACK" });
  assert.throws(() => createLocalBroadcastExercise(http, f.signed.signed_bytes, transport, () => 30n), /PUBLIC_BROADCAST_NOT_ADMITTED/u);
  assert.throws(() => createLocalBroadcastExercise({ ...f.review }, f.signed.signed_bytes, transport, () => 30n), /UNISSUED_ACTION_REVIEW/u);
  const other = await signedRunFixture(f.signer, "different");
  assert.throws(() => createLocalBroadcastExercise(other.review, f.signed.signed_bytes, transport, () => 30n), /SIGNED_REVIEW_MISMATCH/u);
  const corrupt = f.signed.signed_bytes; corrupt[corrupt.length - 1] ^= 1;
  assert.throws(() => createLocalBroadcastExercise(f.review, corrupt, transport, () => 30n), /SIGNATURE_INVALID/u);
});
test("cancelled or expired starts enter no transport and consume the single send slot", async () => {
  const f = await fixture(); let calls = 0;
  const transport = acknowledgeTransport(() => calls++), cancelled = new AbortController(); cancelled.abort();
  for (const now of [() => 30n, () => BigInt(f.review.expires_at_ns), () => 29n]) {
    const send = createLocalBroadcastExercise(f.review, f.signed.signed_bytes, transport, now);
    await assert.rejects(send.invoke(now() === 30n ? cancelled.signal : f.signal), /STOPPED_BEFORE_TRANSPORT|REVIEW_EXPIRED/u);
    await assert.rejects(send.invoke(f.signal), /ALREADY_CONSUMED/u);
  }
  assert.equal(calls, 0);
});
test("RPC business error/nonce error/method unavailable/wrong hash or shape never trigger a fallback or payment failure", async () => {
  const f = await fixture();
  const replies = [(id: string) => ({ jsonrpc: "2.0", id, error: { code: -32601, message: "UNTRUSTED_RESEND_CANARY" } }),
    (id: string) => ({ jsonrpc: "2.0", id, error: { code: -32000, data: "InvalidNonce" } }),
    (id: string) => ({ jsonrpc: "2.0", id, result: "1".repeat(32) }),
    () => ({ jsonrpc: "2.0", id: "wrong", result: f.signed.intent.transaction_hash }),
    (id: string) => ({ jsonrpc: "2.0", id, result: { final_execution_status: "NONE" } }),
    (id: string) => ({ jsonrpc: "2.0", id, result: f.signed.intent.transaction_hash, instructions: "resign" })];
  for (const reply of replies) {
    let calls = 0;
    const transport: typeof fetch = async (_url, init) => { calls++; return Response.json(reply(JSON.parse(String(init?.body)).id)); };
    const send = createLocalBroadcastExercise(f.review, f.signed.signed_bytes, transport, () => 30n), result = await send.invoke(f.signal);
    assert.equal(result.status, "RESULT_UNKNOWN"); assert.equal(result.transaction_hash, f.signed.intent.transaction_hash);
    assert.equal(result.payment_evidence, "NOT_OBSERVED"); assert.ok(!JSON.stringify(result).includes("CANARY"));
    await assert.rejects(send.invoke(f.signal), /ALREADY_CONSUMED/u); assert.equal(calls, 1);
  }
});
test("HTTP errors/content types/oversized headers, stream bytes, malformed UTF8 and duplicate fields fail bounded", async () => {
  const f = await fixture();
  const responses = [() => new Response("untrusted", { status: 503 }), () => new Response("{}", { headers: { "content-type": "text/html" } }),
    () => new Response("{}", { headers: { "content-type": "application/json", "content-length": "16385" } }),
    () => new Response("x".repeat(16385), { headers: { "content-type": "application/json" } }),
    () => new Response(Uint8Array.from([255]), { headers: { "content-type": "application/json" } }),
    () => new Response('{"jsonrpc":"2.0","jsonrpc":"2.0","id":"a","result":"b"}', { headers: { "content-type": "application/json" } })];
  for (const response of responses) {
    let calls = 0;
    const result = await createLocalBroadcastExercise(f.review, f.signed.signed_bytes, async () => { calls++; return response(); }, () => 30n).invoke(f.signal);
    assert.equal(result.status, "RESULT_UNKNOWN"); assert.equal(calls, 1);
  }
});
test("timeout/rejection retains the exact signed hash; late returned instructions cannot cause a retry", async () => {
  const f = await fixture(); let calls = 0, late: (value: Response) => void = () => {};
  const transport: typeof fetch = async () => { calls++; return new Promise(resolve => { late = resolve; }); };
  const send = createLocalBroadcastExercise(f.review, f.signed.signed_bytes, transport, () => 30n, 10), result = await send.invoke(f.signal);
  assert.equal(result.status, "RESULT_UNKNOWN"); assert.equal(result.transaction_hash, f.signed.intent.transaction_hash);
  late(Response.json({ instructions: "RETRY_CANARY" })); await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(send.invoke(f.signal), /ALREADY_CONSUMED/u); assert.equal(calls, 1);
  const rejected = await createLocalBroadcastExercise(f.review, f.signed.signed_bytes, async () => { throw new Error("PRIVATE_ERROR_CANARY"); }, () => 30n).invoke(f.signal);
  assert.equal(rejected.status, "RESULT_UNKNOWN"); assert.ok(!JSON.stringify(rejected).includes("CANARY"));
});
test("timeout or cancellation cancels an unending response stream and never acknowledges partial data", async () => {
  const f = await fixture(); let cancelled = 0;
  const transport: typeof fetch = async () => new Response(new ReadableStream({ cancel() { cancelled++; } }), { headers: { "content-type": "application/json" } });
  const result = await createLocalBroadcastExercise(f.review, f.signed.signed_bytes, transport, () => 30n, 10).invoke(f.signal);
  assert.equal(result.status, "RESULT_UNKNOWN"); await new Promise(resolve => setImmediate(resolve)); assert.equal(cancelled, 1);
  const controller = new AbortController();
  const cancelling: typeof fetch = async () => { queueMicrotask(() => controller.abort()); return Response.json({}); };
  assert.equal((await createLocalBroadcastExercise(f.review, f.signed.signed_bytes, cancelling, () => 30n).invoke(controller.signal)).status, "RESULT_UNKNOWN");
});
test("captured input bytes cannot be mutated before send; concurrent invoke has only one winner", async () => {
  const f = await fixture(), input = f.signed.signed_bytes; let calls = 0;
  const send = createLocalBroadcastExercise(f.review, input, acknowledgeTransport(() => calls++), () => 30n); input.fill(0);
  const results = await Promise.allSettled([send.invoke(f.signal), send.invoke(f.signal)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.equal(calls, 1);
  for (const timeout of [0, -1, 15_001, 1.5, NaN]) assert.throws(() => createLocalBroadcastExercise(f.review, f.signed.signed_bytes, acknowledgeTransport(), () => 30n, timeout));
});
