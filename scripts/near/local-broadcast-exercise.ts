/** LOCAL injected-transport byte-send test seam. No default fetch, secret, CLI/public execution or retry.
 * This exercises actual RPC request shape; an acknowledgement is NOT inclusion or settlement.
 */
import { Buffer } from "node:buffer";
import { fail, object, parseBoundedJson } from "../../src/lib/near/records.ts";
import type { PurchaseReview } from "../../src/lib/near/action-review.ts";
import { inspectSignedAgentEnvelope } from "./signature-envelope.ts";
import { decodeBase58_32 } from "./base58.ts";
import { assertLocalSignedReview } from "./local-signed-review.ts";

const MAX_RESPONSE = 16_384;
async function acknowledgement(response: Response, requestId: string, hash: string, signal: AbortSignal) {
  if (!response.ok || !/^application\/(?:json|[a-z0-9.+-]+\+json)(?:;|$)/iu.test(response.headers.get("content-type") ?? "")) return fail("LOCAL_BROADCAST_RESPONSE_INVALID");
  const length = response.headers.get("content-length");
  if (length !== null && (!/^[0-9]{1,12}$/u.test(length) || BigInt(length) > BigInt(MAX_RESPONSE))) return fail("LOCAL_BROADCAST_RESPONSE_LIMIT");
  const reader = response.body?.getReader();
  if (!reader) return fail("LOCAL_BROADCAST_RESPONSE_EMPTY");
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", abort, { once: true });
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      if (signal.aborted) return fail("LOCAL_BROADCAST_UNKNOWN");
      const next = await reader.read(); if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_RESPONSE) return fail("LOCAL_BROADCAST_RESPONSE_LIMIT");
      chunks.push(next.value);
    }
  } finally { signal.removeEventListener("abort", abort); await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  if (signal.aborted) return fail("LOCAL_BROADCAST_UNKNOWN");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  const envelope = object(parseBoundedJson(text, MAX_RESPONSE), ["jsonrpc", "id", "result"]);
  if (envelope.jsonrpc !== "2.0" || envelope.id !== requestId || envelope.result !== hash) return fail("LOCAL_BROADCAST_ACK_MISMATCH");
  decodeBase58_32(envelope.result);
}

/** Trusted test code supplies transport explicitly. This is NOT an admitted way to call public RPC. */
export function createLocalBroadcastExercise(review: PurchaseReview, inputBytes: Uint8Array, transport: typeof fetch,
  nowNs: () => bigint, timeoutMs = 15_000) {
  // No transport fallback, even on an error; this seam is intentionally local-only.
  if (typeof transport !== "function" || transport === globalThis.fetch) return fail("LOCAL_INJECTED_TRANSPORT_REQUIRED");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15_000) return fail("LOCAL_BROADCAST_TIMEOUT_INVALID");
  const signed = inspectSignedAgentEnvelope(inputBytes);
  assertLocalSignedReview(review, signed);
  const bytes = signed.signed_bytes, requestId = `runlatch-local-broadcast-${signed.transaction_hash}`;
  const body = JSON.stringify({ jsonrpc: "2.0", id: requestId, method: "broadcast_tx_async", params: [Buffer.from(bytes).toString("base64")] });
  if (Buffer.byteLength(body) > 12_288) return fail("LOCAL_BROADCAST_INPUT_LIMIT");
  let consumed = false;
  return Object.freeze({ source: "LOCAL_INJECTED_BROADCAST_EXERCISE" as const, transaction_hash: signed.transaction_hash,
    async invoke(signal: AbortSignal) {
      if (consumed) return fail("LOCAL_BROADCAST_ALREADY_CONSUMED");
      consumed = true; // Includes cancelled/expired starts: never re-enter this identity.
      if (!(signal instanceof AbortSignal) || signal.aborted) return fail("LOCAL_BROADCAST_STOPPED_BEFORE_TRANSPORT");
      const now = nowNs();
      if (typeof now !== "bigint" || now < BigInt(review.reviewed_at_ns) || now >= BigInt(review.expires_at_ns)) return fail("LOCAL_BROADCAST_REVIEW_EXPIRED");
      const controller = new AbortController(), abort = () => controller.abort();
      let timer: ReturnType<typeof setTimeout> | undefined, entered = false;
      signal.addEventListener("abort", abort, { once: true });
      try {
        const interrupted = new Promise<never>((_resolve, reject) => {
          controller.signal.addEventListener("abort", () => reject(new Error("LOCAL_BROADCAST_UNKNOWN")), { once: true });
          timer = setTimeout(abort, timeoutMs);
        });
        await Promise.race([Promise.resolve().then(async () => {
          if (controller.signal.aborted || signal.aborted) return fail("LOCAL_BROADCAST_STOPPED_BEFORE_TRANSPORT");
          entered = true;
          // Exactly one method/URL/transport call. No retry or send_tx fallback, regardless of response/error.
          const response = await transport(review.target.rpc_url, { method: "POST", headers: { "Content-Type": "application/json" },
            body, credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer", signal: controller.signal });
          if (controller.signal.aborted) {
            void response.body?.cancel().catch(() => undefined);
            return fail("LOCAL_BROADCAST_UNKNOWN");
          }
          await acknowledgement(response, requestId, signed.transaction_hash, controller.signal);
        }), interrupted]);
        return Object.freeze({ source: "LOCAL_INJECTED_BROADCAST_EXERCISE" as const, status: "ACKNOWLEDGED_UNVERIFIED" as const,
          transaction_hash: signed.transaction_hash, transport_entered: true, public_execution: false as const, payment_evidence: "NOT_OBSERVED" as const });
      } catch {
        return Object.freeze({ source: "LOCAL_INJECTED_BROADCAST_EXERCISE" as const,
          status: entered ? "RESULT_UNKNOWN" as const : "STOPPED_BEFORE_TRANSPORT" as const, transaction_hash: signed.transaction_hash,
          transport_entered: entered, public_execution: false as const, payment_evidence: "NOT_OBSERVED" as const });
      } finally {
        if (timer) clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        controller.abort();
      }
    },
  });
}
