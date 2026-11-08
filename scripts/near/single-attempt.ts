/** Offline orchestration seam only. No admitted signer/codec/broadcast or public execution entry point. */
import { confirmFreshPurchaseReview, type PurchaseReview } from "../../src/lib/near/action-review.ts";
import type { PurchaseObservationIntent } from "../../src/lib/near/testnet-evidence.ts";
import type { AttemptJournal } from "./attempt-journal.ts";

interface PreparedExercise {
  readonly intent: unknown;
  /** Trusted test code, not a method/URL/command decoded from provider output. No production adapter exists. */
  readonly invoke: (signal: AbortSignal) => Promise<unknown>;
}
export interface SingleAttemptExercisePorts {
  readonly journal: AttemptJournal;
  readonly freshReview: (signal: AbortSignal) => Promise<PurchaseReview>;
  readonly prepareIdentity: (review: PurchaseReview, signal: AbortSignal) => Promise<PreparedExercise>;
  readonly nowNs: () => bigint;
  readonly invocationTimeoutMs?: number;
  readonly signal?: AbortSignal;
}
const fail = (code: string): never => { throw new Error(code); };
function eligible(review: PurchaseReview) {
  if (review.transport_source !== "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE" || review.action.method !== "submit_purchase"
    || review.call.method !== "submit_purchase" || review.call.attached_deposit !== "0" || !review.access
    || !review.financials) return fail("PUBLIC_EXECUTION_NOT_ADMITTED");
}
function checkTime(review: PurchaseReview, fresh: PurchaseReview, ports: SingleAttemptExercisePorts) {
  if (ports.signal?.aborted) return fail("ATTEMPT_CANCELLED_BEFORE_INVOCATION");
  const now = ports.nowNs();
  if (typeof now !== "bigint" || now < BigInt(fresh.reviewed_at_ns) || now >= BigInt(review.expires_at_ns)
    || now >= BigInt(fresh.expires_at_ns)) return fail("ATTEMPT_REVIEW_EXPIRED");
}
async function limited<T>(operation: (signal: AbortSignal) => Promise<T>, timeout: number, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) return fail("ATTEMPT_CANCELLED");
  const controller = new AbortController();
  const abort = () => controller.abort();
  let timer: ReturnType<typeof setTimeout> | undefined;
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const interrupted = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener("abort", () => reject(new Error("ATTEMPT_OPERATION_UNKNOWN")), { once: true });
      timer = setTimeout(abort, timeout);
    });
    return await Promise.race([Promise.resolve().then(() => {
      if (controller.signal.aborted) return fail("ATTEMPT_CANCELLED");
      return operation(controller.signal);
    }), interrupted]);
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    controller.abort();
  }
}

export async function exerciseSingleAttempt(review: PurchaseReview, confirmation: unknown, ports: SingleAttemptExercisePorts) {
  eligible(review);
  const timeout = ports.invocationTimeoutMs ?? 15_000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 15_000) return fail("INVALID_INVOCATION_TIMEOUT");
  if (ports.signal?.aborted) return fail("ATTEMPT_CANCELLED_BEFORE_INVOCATION");
  let fresh: PurchaseReview;
  try { fresh = await limited(ports.freshReview, timeout, ports.signal); }
  catch { return fail("FRESH_REVIEW_UNAVAILABLE"); }
  eligible(fresh);
  confirmFreshPurchaseReview(review, fresh, confirmation);
  checkTime(review, fresh, ports);
  const lease = await ports.journal.claim(fresh);
  let intent: PurchaseObservationIntent | null = null, entered = false;
  try {
    checkTime(review, fresh, ports);
    const prepared = await limited(signal => ports.prepareIdentity(fresh, signal), timeout, ports.signal);
    checkTime(review, fresh, ports);
    // Capture public transaction identity durably before entering any potentially uncertain invocation.
    intent = await ports.journal.capture(lease, prepared.intent);
    checkTime(review, fresh, ports);
    await ports.journal.enter(lease);
    checkTime(review, fresh, ports);
    entered = true;
    // One invocation only. A late return/rejection after timeout is ignored, never a new attempt or settlement fact.
    await limited(prepared.invoke, timeout, ports.signal);
    await ports.journal.finish(lease, "RETURNED_UNVERIFIED");
    return Object.freeze({ source: "LOCAL_SINGLE_ATTEMPT_EXERCISE" as const, status: "RETURNED_UNVERIFIED" as const,
      attempt_id: lease.attempt_id, intent, invocation_entered: true, journal_completion: "RECORDED" as const,
      payment_evidence: "NOT_OBSERVED" as const, public_execution: false as const });
  } catch {
    let finalMarker = false;
    if (entered) {
      // A failed final marker must not discard identity or invite a resend. The already-written entry still blocks it.
      try { await ports.journal.finish(lease, "RESULT_UNKNOWN"); finalMarker = true; } catch { /* Report missing final marker; retain earlier markers. */ }
    }
    return Object.freeze({ source: "LOCAL_SINGLE_ATTEMPT_EXERCISE" as const,
      status: entered ? "RESULT_UNKNOWN" as const : "STOPPED_BEFORE_INVOCATION" as const,
      attempt_id: lease.attempt_id, intent, invocation_entered: entered,
      journal_completion: finalMarker ? "RECORDED" as const : "NOT_FINALIZED_RETAIN_PRIOR_MARKERS" as const,
      payment_evidence: "NOT_OBSERVED" as const, public_execution: false as const });
  }
}
