/** Explicit Node-only testnet entry. One exact submit, no admin/owner/CLI/secret fallback or retry.
 * Invoke only AFTER the human approves the exact public scope. Imported/provider JSON is not consent.
 */
import { canonicalReviewContent } from "../../src/lib/near/review-content.ts";
import { fail } from "../../src/lib/near/records.ts";
import type { createTestnetReader } from "../../src/lib/near/testnet-rpc.ts";
import { assertTestnetRunAdmission, assertRunnerTransport, type TestnetRunAdmission } from "./runner-admission.ts";
import { createInjectedTestnetSigning, type RestrictedProcessKey } from "./restricted-process-key.ts";
import { createAttemptJournal } from "./attempt-journal.ts";
import { createSequentialKey } from "./local-sequential-key.ts";
import { createBoundedBroadcast } from "./local-broadcast-exercise.ts";
import { runSingleAttempt } from "./single-attempt.ts";
import { readSignedAgentNonce, type SignedAgentNonceReadback } from "./read-signed-agent-nonce.ts";
import { inspectSignedAgentEnvelope } from "./signature-envelope.ts";
import { parseLocalSignedIdentity } from "./local-nonce-reconciliation.ts";

type Reader = Pick<ReturnType<typeof createTestnetReader>, "target" | "readPurchaseReview" | "reconcileAgentNonce">;
interface Ports {
  readonly reader: Reader; readonly transport?: typeof fetch;
  /** Synthetic tests only; public clock is wall-clock time, not caller/provider data. */
  readonly testNowNs?: () => bigint;
  readonly timeoutMs?: number; readonly signal?: AbortSignal;
}
const consumed = new WeakSet<object>();
export async function runRestrictedTestnetPurchase(admission: TestnetRunAdmission, key: RestrictedProcessKey, ports: Ports) {
  assertTestnetRunAdmission(admission);
  if (consumed.has(admission)) return fail("TESTNET_RUN_CONFIRMATION_CONSUMED");
  const publicHttp = admission.review.transport_source === "EXPLICIT_TESTNET_HTTP_READBACK";
  if (publicHttp && ports.testNowNs !== undefined) return fail("PUBLIC_RUN_CLOCK_FIXED");
  const transport = ports.transport ?? (publicHttp ? globalThis.fetch : fail("LOCAL_INJECTED_TRANSPORT_REQUIRED"));
  assertRunnerTransport(transport, admission);
  if (canonicalReviewContent(ports.reader.target) !== canonicalReviewContent(admission.review.target)) return fail("TESTNET_RUN_READER_TARGET_MISMATCH");
  const nowNs = ports.testNowNs ?? (() => BigInt(Date.now()) * 1_000_000n);
  // Final-wait submission is one bounded call; the larger ceiling still refuses unbounded waits.
  const timeout = ports.timeoutMs ?? 45_000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60_000) return fail("INVALID_INVOCATION_TIMEOUT");
  if (ports.signal?.aborted) return fail("ATTEMPT_CANCELLED_BEFORE_INVOCATION");
  const signer = createInjectedTestnetSigning(key, admission); // Issued, live handle plus exact target/agent/recovery/cap binding.
  consumed.add(admission); // I/O/errors cannot reopen this operator confirmation.
  const journal = await createAttemptJournal(admission.namespace, admission), coordinator = await createSequentialKey(admission.namespace, admission);
  const observation: { prior: SignedAgentNonceReadback | null; identity: ReturnType<typeof parseLocalSignedIdentity> | null;
    broadcast: Awaited<ReturnType<ReturnType<typeof createBoundedBroadcast>["invoke"]>> | null } = { prior: null, identity: null, broadcast: null };
  const attempt = await runSingleAttempt(admission.review, admission.confirmation, { journal, nowNs, invocationTimeoutMs: timeout, signal: ports.signal,
    freshReview: async signal => {
      const previous = await coordinator.lastIdentity(admission.review);
      if (previous) observation.prior = await readSignedAgentNonce(ports.reader, previous, admission.scope, signal);
      // Re-read AFTER reconciliation: current authority, quote, funding and permissions must still match human review.
      return ports.reader.readPurchaseReview(admission.review.action, admission.scope, signal);
    },
    prepareIdentity: async (fresh, signal) => {
      if (signal.aborted) return fail("LOCAL_RUNNER_CANCELLED");
      const guard = coordinator.forRun(observation.prior);
      const lease = await guard.claim(fresh, { consent: true, review_hash: fresh.review_hash }, nowNs());
      if (signal.aborted) return fail("LOCAL_RUNNER_CANCELLED");
      const prepared = signer.signReview(admission.review, fresh, admission.confirmation, nowNs(), signal);
      await guard.capture(lease, prepared.signed_bytes); // Sync the exact public identity before journal entry/network write.
      const checked = inspectSignedAgentEnvelope(prepared.signed_bytes);
      observation.identity = parseLocalSignedIdentity({ transaction_hash: checked.transaction_hash, transaction: checked.transaction });
      if (signal.aborted) return fail("LOCAL_RUNNER_CANCELLED");
      const send = createBoundedBroadcast(fresh, prepared.signed_bytes, transport, nowNs, timeout, admission, "final");
      return { intent: prepared.intent, invoke: async (invokeSignal: AbortSignal) => {
        observation.broadcast = await send.invoke(invokeSignal);
        if (!["FINAL_OUTCOME_OBSERVED", "SEND_ERROR_OBSERVED", "ACKNOWLEDGED_UNVERIFIED"].includes(observation.broadcast.status)) return fail("LOCAL_RUNNER_BROADCAST_UNKNOWN");
      } };
    },
  }, admission);
  return Object.freeze({ ...attempt, identity: observation.identity, broadcast: observation.broadcast,
    transport_source: admission.review.transport_source, key_strategy: "THREE_DISTINCT_REQUESTS_EXACT_FINAL_RECONCILIATION_NO_RELEASE" as const,
    grants_payment_authority: false as const,
    limitation: "One bounded exact native-testnet submit. Acknowledgement/entry/signature is not inclusion or settlement; retain unknown identity/claims. Observe transfer/private callback separately, then run labelled fixture checks and explicit owner acceptance." });
}
