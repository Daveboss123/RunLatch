/** Node-only, append-only attempt markers. LOCAL default, exact-confirmation testnet opt-in.
 * No signing bytes, secrets, network or money state. Same exclusion domain across both modes.
 */
import { createHash } from "node:crypto";
import { lstat, mkdir, open, realpath } from "node:fs/promises";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { id } from "../../src/lib/near/records.ts";
import { parsePurchaseAction, type PurchaseReview } from "../../src/lib/near/action-review.ts";
import { parsePurchaseObservationIntent, type PurchaseObservationIntent } from "../../src/lib/near/testnet-evidence.ts";
import { parseTestnetTarget } from "../../src/lib/near/testnet-target.ts";
import { assertRunnerNamespace, assertRunnerReview, type TestnetRunAdmission } from "./runner-admission.ts";

export interface AttemptLease { readonly attempt_id: string }
interface State { stage: number; readonly path: string; readonly review: PurchaseReview; intent: PurchaseObservationIntent | null }
const samePath = (a: string, b: string) => process.platform === "win32" ? normalize(a).toLowerCase() === normalize(b).toLowerCase() : normalize(a) === normalize(b);
const fail = (code: string): never => { throw new Error(code); };

export async function createAttemptJournal(namespace: string, admission?: TestnetRunAdmission) {
  id(namespace); assertRunnerNamespace(namespace, admission);
  const source = admission ? "RESTRICTED_TESTNET_ATTEMPT" as const : "LOCAL_SINGLE_ATTEMPT_EXERCISE" as const;
  const publicExecution = admission ? "NOT_PROVEN" as const : false as const;
  let directory = await realpath(fileURLToPath(new URL("../../", import.meta.url)));
  // Inspect each existing ancestor before creating its child. No directory supplied by imported data.
  for (const part of [".local", "testnet-mvp", "single-attempt", namespace]) {
    directory = join(directory, part);
    try { await mkdir(directory); } catch (e) { if (!(e instanceof Error) || !("code" in e) || e.code !== "EEXIST") return fail("ATTEMPT_JOURNAL_UNAVAILABLE"); }
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || !samePath(await realpath(directory), directory)) return fail("UNSAFE_ATTEMPT_JOURNAL_PATH");
  }
  const states = new WeakMap<AttemptLease, State>();
  async function write(path: string, data: unknown) {
    const bytes = Buffer.from(`${JSON.stringify(data)}\n`, "utf8");
    if (bytes.length > 16_384) return fail("ATTEMPT_JOURNAL_BYTE_LIMIT");
    // Exclusive creation also rejects pre-existing symlinks/files. Never truncate a previous marker.
    const handle = await open(path, "wx", 0o600);
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  }
  function state(lease: AttemptLease) { return states.get(lease) ?? fail("UNISSUED_ATTEMPT_LEASE"); }
  async function event(lease: AttemptLease, name: string, expectedStage: number, intent: PurchaseObservationIntent | null) {
    const s = state(lease);
    if (s.stage !== expectedStage) return fail("ATTEMPT_STAGE_MISMATCH");
    // Consume the stage before asynchronous I/O so concurrent calls cannot share it; I/O failure is fail closed.
    s.stage = -1;
    await write(`${s.path}.${expectedStage + 1}.json`, { source, attempt_id: lease.attempt_id,
      event: name, intent, payment_evidence: "NOT_OBSERVED", public_execution: publicExecution });
    s.stage = expectedStage + 1;
  }
  return Object.freeze({
    async claim(review: PurchaseReview): Promise<AttemptLease> {
      const target = parseTestnetTarget(review.target), action = parsePurchaseAction(review.action);
      assertRunnerReview(review, admission, "PUBLIC_EXECUTION_NOT_ADMITTED");
      // Quote/key/revision/code/endpoint changes must not create another slot for this contract request.
      const attemptId = createHash("sha256").update(JSON.stringify(["runlatch.local-attempt.v1", "testnet", target.contract_id,
        action.proposal.capsule_id, action.proposal.request_id])).digest("hex");
      const path = join(directory, attemptId);
      try { await write(`${path}.0.json`, { source, attempt_id: attemptId, event: "CLAIMED",
        target, action, review_hash: review.review_hash, payment_evidence: "NOT_OBSERVED", public_execution: publicExecution }); }
      catch { return fail("ATTEMPT_ALREADY_CLAIMED_OR_JOURNAL_UNAVAILABLE"); }
      const lease = Object.freeze({ attempt_id: attemptId });
      states.set(lease, { stage: 0, path, review, intent: null });
      return lease;
    },
    async capture(lease: AttemptLease, inputIntent: unknown) {
      const s = state(lease), intent = parsePurchaseObservationIntent(inputIntent), a = s.review.action;
      if (intent.method !== "submit_purchase" || intent.sender_id !== a.signer_id || intent.public_key !== a.public_key
        || intent.gas !== a.gas || intent.expected_request_hash !== null
        || JSON.stringify(intent.proposal) !== JSON.stringify(a.proposal)) return fail("PREPARED_INTENT_MISMATCH");
      await event(lease, "IDENTITY_CAPTURED", 0, intent);
      s.intent = intent;
      return intent;
    },
    async enter(lease: AttemptLease) { await event(lease, "INVOCATION_ENTERED", 1, state(lease).intent); },
    async finish(lease: AttemptLease, outcome: "RETURNED_UNVERIFIED" | "RESULT_UNKNOWN") {
      if (outcome !== "RETURNED_UNVERIFIED" && outcome !== "RESULT_UNKNOWN") return fail("INVALID_ATTEMPT_OUTCOME");
      await event(lease, outcome, 2, state(lease).intent);
    },
  });
}
export type AttemptJournal = Awaited<ReturnType<typeof createAttemptJournal>>;
