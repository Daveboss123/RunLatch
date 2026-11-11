/** Shared bounded byte-send mechanics. LOCAL wrapper still requires injected transport and LOCAL review.
 * Testnet opt-in needs issued exact confirmation. No secret, CLI, generic RPC or retry.
 * `ack` mode is the original broadcast_tx_async exercise: a returned hash is NOT inclusion or settlement.
 * `final` mode is testnet-only and sends the same exact bytes ONCE with send_tx wait_until=FINAL so the
 * node returns validation errors/outcomes instead of an opaque acknowledgement. Even a FINAL call
 * outcome is not settlement: the native transfer and private callback are separate receipts.
 */
import { Buffer } from "node:buffer";
import { fail, object, parseBoundedJson } from "../../src/lib/near/records.ts";
import type { PurchaseReview } from "../../src/lib/near/action-review.ts";
import { inspectSignedAgentEnvelope } from "./signature-envelope.ts";
import { decodeBase58_32 } from "./base58.ts";
import { assertSignedReview } from "./local-signed-review.ts";
import { assertRunnerTransport, type TestnetRunAdmission } from "./runner-admission.ts";

const ACK_MAX_RESPONSE = 16_384, FINAL_MAX_RESPONSE = 262_144, ACK_TIMEOUT = 15_000, FINAL_TIMEOUT = 60_000;
export type SendMode = "ack" | "final";
type Row = Record<string, unknown>;
const row = (value: unknown): Row => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const safeCode = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_.:/-]{1,72}$/u.test(value) ? value : null;
// Only known protocol identifiers are retained; free-form error text/logs never reach records.
const RPC_NAMES = new Set(["HANDLER_ERROR", "INVALID_TRANSACTION", "TIMEOUT_ERROR", "INTERNAL_ERROR", "REQUEST_VALIDATION_ERROR",
  "UNKNOWN_TRANSACTION", "METHOD_NOT_FOUND", "PARSE_ERROR", "INVALID_REQUEST"]);
const ERROR_TYPES = new Set(["NotEnoughAllowance", "InvalidNonce", "InvalidSignature", "Expired", "DoesNotExist", "LackBalanceForState",
  "ShardCongested", "ShardStuck", "InvalidReceiverId", "InvalidAccessKeyError", "InvalidChain", "InvalidTransaction", "GasLimitExceeded",
  "FunctionCallError", "AccountAlreadyExists", "CreateAccountNotAllowed", "ActorNoPermission", "InsufficientStake", "TriesToUnstake",
  "TriesToStake", "AccessKeyNotFound", "ReceiverMismatch", "MethodNameMismatch", "RequiresFullAccess", "NotEnoughBalance", "InvalidTxError"]);
const pick = (value: unknown, known: ReadonlySet<string>) => typeof value === "string" && known.has(value) ? value : null;

function rpcError(value: unknown) {
  const error = row(value), cause = row(error.cause), info = row(cause.info);
  return Object.freeze({ rpc_error: pick(error.name, RPC_NAMES) ?? "UNCLASSIFIED_RPC_ERROR", cause: pick(cause.name, RPC_NAMES),
    error_type: pick(info.error_type, ERROR_TYPES), code: typeof error.code === "number" && Number.isSafeInteger(error.code) ? error.code : null });
}
function outcomeLabel(value: unknown) {
  const status = row(value);
  if (Object.hasOwn(status, "SuccessValue")) return "SUCCESS_VALUE" as const;
  if (Object.hasOwn(status, "SuccessReceiptId")) return "SUCCESS_RECEIPT_ID" as const;
  if (Object.hasOwn(status, "Failure")) return "FAILURE" as const;
  return null;
}
/** Only structural keys, never values/logs, so no untrusted text is retained. */
function failureKind(value: unknown) {
  const parts: string[] = [];
  let current: unknown = row(value).Failure;
  for (let depth = 0; depth < 4; depth++) {
    const node = row(current), entry = Object.entries(node)
      .find(([, nested]) => nested !== null && typeof nested === "object" && !Array.isArray(nested));
    if (!entry) break;
    const code = safeCode(entry[0]);
    if (!code) break;
    parts.push(code);
    current = entry[1];
  }
  return parts.join(".") || null;
}
async function readBounded(response: Response, requestId: string, max: number, signal: AbortSignal) {
  if (!response.ok || !/^application\/(?:json|[a-z0-9.+-]+\+json)(?:;|$)/iu.test(response.headers.get("content-type") ?? "")) return fail("LOCAL_BROADCAST_RESPONSE_INVALID");
  const length = response.headers.get("content-length");
  if (length !== null && (!/^[0-9]{1,12}$/u.test(length) || BigInt(length) > BigInt(max))) return fail("LOCAL_BROADCAST_RESPONSE_LIMIT");
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
      if (size > max) return fail("LOCAL_BROADCAST_RESPONSE_LIMIT");
      chunks.push(next.value);
    }
  } finally { signal.removeEventListener("abort", abort); await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  if (signal.aborted) return fail("LOCAL_BROADCAST_UNKNOWN");
  const envelope = object(parseBoundedJson(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)), max));
  if (Object.keys(envelope).some(key => !["jsonrpc", "id", "result", "error"].includes(key))
    || envelope.jsonrpc !== "2.0" || envelope.id !== requestId) return fail("LOCAL_BROADCAST_ENVELOPE_MISMATCH");
  return envelope;
}

/** Trusted test code supplies transport explicitly. This is NOT an admitted way to call public RPC. */
export function createLocalBroadcastExercise(review: PurchaseReview, inputBytes: Uint8Array, transport: typeof fetch,
  nowNs: () => bigint, timeoutMs = 15_000) {
  return createBoundedBroadcast(review, inputBytes, transport, nowNs, timeoutMs);
}
export function createBoundedBroadcast(review: PurchaseReview, inputBytes: Uint8Array, transport: typeof fetch,
  nowNs: () => bigint, timeoutMs = 15_000, admission?: TestnetRunAdmission, sendMode: SendMode = "ack") {
  // No transport fallback, even on an error; this seam is intentionally local-only.
  assertRunnerTransport(transport, admission);
  const final = sendMode === "final";
  if (final && !admission) return fail("LOCAL_BROADCAST_FINAL_REQUIRES_ADMISSION");
  const cap = final ? FINAL_TIMEOUT : ACK_TIMEOUT, max = final ? FINAL_MAX_RESPONSE : ACK_MAX_RESPONSE;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > cap) return fail("LOCAL_BROADCAST_TIMEOUT_INVALID");
  const signed = inspectSignedAgentEnvelope(inputBytes);
  assertSignedReview(review, signed, admission);
  const source = admission ? "RESTRICTED_TESTNET_SINGLE_BROADCAST" as const : "LOCAL_INJECTED_BROADCAST_EXERCISE" as const;
  const publicExecution = admission ? "NOT_PROVEN" as const : false as const;
  const bytes = signed.signed_bytes, requestId = `runlatch-local-broadcast-${signed.transaction_hash}`;
  const payload = Buffer.from(bytes).toString("base64");
  const body = JSON.stringify(final
    ? { jsonrpc: "2.0", id: requestId, method: "send_tx", params: { signed_tx_base64: payload, wait_until: "FINAL" } }
    : { jsonrpc: "2.0", id: requestId, method: "broadcast_tx_async", params: [payload] });
  if (Buffer.byteLength(body) > 16_384) return fail("LOCAL_BROADCAST_INPUT_LIMIT");
  let consumed = false;
  return Object.freeze({ source, transaction_hash: signed.transaction_hash,
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
        const raced = await Promise.race([Promise.resolve().then(async () => {
          if (controller.signal.aborted || signal.aborted) return fail("LOCAL_BROADCAST_STOPPED_BEFORE_TRANSPORT");
          entered = true;
          // Exactly one method/URL/transport call. No retry or method fallback, regardless of response/error.
          const response = await transport(review.target.rpc_url, { method: "POST", headers: { "Content-Type": "application/json" },
            body, credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer", signal: controller.signal });
          if (controller.signal.aborted) {
            void response.body?.cancel().catch(() => undefined);
            return fail("LOCAL_BROADCAST_UNKNOWN");
          }
          const envelope = await readBounded(response, requestId, max, controller.signal);
          if (!final) {
            if (envelope.result !== signed.transaction_hash) return fail("LOCAL_BROADCAST_ACK_MISMATCH");
            decodeBase58_32(signed.transaction_hash); return;
          }
          if (envelope.error !== undefined) return Object.freeze({ source, status: "SEND_ERROR_OBSERVED" as const,
            transaction_hash: signed.transaction_hash, transport_entered: true, public_execution: publicExecution,
            payment_evidence: "NOT_OBSERVED" as const, ...rpcError(envelope.error),
            limitation: "A node returned an RPC error for these exact bytes. That is not proof of global non-execution; observe read-only state before any decision." });
          const result = object(envelope.result), transaction = object(result.transaction);
          if (transaction.hash !== signed.transaction_hash) return fail("LOCAL_BROADCAST_HASH_MISMATCH");
          decodeBase58_32(signed.transaction_hash);
          if (result.final_execution_status !== "FINAL") return fail("LOCAL_BROADCAST_OUTCOME_NOT_FINAL");
          const outcome = outcomeLabel(result.status);
          if (!outcome) return fail("LOCAL_BROADCAST_OUTCOME_INVALID");
          return Object.freeze({ source, status: "FINAL_OUTCOME_OBSERVED" as const, transaction_hash: signed.transaction_hash,
            final_execution_status: "FINAL" as const, outcome, failure_kind: outcome === "FAILURE" ? failureKind(result.status) : null,
            transport_entered: true, public_execution: publicExecution, payment_evidence: "NOT_OBSERVED" as const,
            limitation: "A FINAL function-call outcome is not settlement: the scheduled native transfer and private callback are separate receipts." });
        }), interrupted]);
        if (final) return raced ?? fail("LOCAL_BROADCAST_UNKNOWN");
        return Object.freeze({ source, status: "ACKNOWLEDGED_UNVERIFIED" as const,
          transaction_hash: signed.transaction_hash, transport_entered: true, public_execution: publicExecution, payment_evidence: "NOT_OBSERVED" as const });
      } catch {
        return Object.freeze({ source,
          status: entered ? "RESULT_UNKNOWN" as const : "STOPPED_BEFORE_TRANSPORT" as const, transaction_hash: signed.transaction_hash,
          transport_entered: entered, public_execution: publicExecution, payment_evidence: "NOT_OBSERVED" as const });
      } finally {
        if (timer) clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        controller.abort();
      }
    },
  });
}
