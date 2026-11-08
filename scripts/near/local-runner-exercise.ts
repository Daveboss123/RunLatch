/** Compose existing offline journal/key guard, LOCAL review signer and bounded injected byte-send.
 * No public signer/wallet/CLI or default secret read. RPC returns never become payment evidence.
 */
import { fail } from "../../src/lib/near/records.ts";
import type { PurchaseReview } from "../../src/lib/near/action-review.ts";
import type { AttemptJournal } from "./attempt-journal.ts";
import type { LocalKeyGuard } from "./local-key-guard.ts";
import { createLocalBroadcastExercise } from "./local-broadcast-exercise.ts";
import type { LocalReviewSigner } from "./local-review-signer.ts";
import { exerciseSingleAttempt } from "./single-attempt.ts";

interface LocalRunnerPorts {
  readonly journal: AttemptJournal; readonly keyGuard: LocalKeyGuard;
  readonly signer: LocalReviewSigner;
  readonly freshReview: (signal: AbortSignal) => Promise<PurchaseReview>;
  readonly transport: typeof fetch; readonly nowNs: () => bigint;
  readonly timeoutMs?: number; readonly signal?: AbortSignal;
}
export async function exerciseLocalSignedRun(review: PurchaseReview, confirmation: unknown, ports: LocalRunnerPorts) {
  if (typeof ports.transport !== "function" || ports.transport === globalThis.fetch) return fail("LOCAL_INJECTED_TRANSPORT_REQUIRED");
  // Box avoids treating asynchronous callback assignment as an always-null local variable.
  const observation: { broadcast: Awaited<ReturnType<ReturnType<typeof createLocalBroadcastExercise>["invoke"]>> | null } = { broadcast: null };
  const attempt = await exerciseSingleAttempt(review, confirmation, { journal: ports.journal, freshReview: ports.freshReview,
    nowNs: ports.nowNs, invocationTimeoutMs: ports.timeoutMs, signal: ports.signal,
    prepareIdentity: async (fresh, signal) => {
      if (signal.aborted) return fail("LOCAL_RUNNER_CANCELLED");
      // Existing request claim precedes key claim; key claim is synced before signing even once.
      const lease = await ports.keyGuard.claim(fresh, { consent: true, review_hash: fresh.review_hash }, ports.nowNs());
      if (signal.aborted) return fail("LOCAL_RUNNER_CANCELLED");
      const prepared = ports.signer.signReview(review, fresh, confirmation, ports.nowNs(), signal);
      await ports.keyGuard.capture(lease, prepared.signed_bytes);
      if (signal.aborted) return fail("LOCAL_RUNNER_CANCELLED");
      const send = createLocalBroadcastExercise(fresh, prepared.signed_bytes, ports.transport, ports.nowNs, ports.timeoutMs);
      return { intent: prepared.intent, invoke: async (invokeSignal: AbortSignal) => {
        observation.broadcast = await send.invoke(invokeSignal);
        // The existing one-attempt seam treats a rejected invocation as unknown; do not disguise that as returned.
        if (observation.broadcast.status !== "ACKNOWLEDGED_UNVERIFIED") return fail("LOCAL_RUNNER_BROADCAST_UNKNOWN");
      } };
    },
  });
  return Object.freeze({ ...attempt, broadcast: observation.broadcast, key_strategy: "ONE_SHOT_LOCAL_KEY_NO_RELEASE" as const,
    limitation: "Ephemeral local signing and injected RPC shape only; no account permissions, public submission, settlement or fixture provisioning proven." });
}
