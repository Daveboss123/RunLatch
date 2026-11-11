/** One approved demo purchase composition. No key loader/default execution; public outputs only. */
import { createHash } from "node:crypto";
import { lstat, open, realpath } from "node:fs/promises";
import { resolve, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createTestnetReader } from "../../src/lib/near/testnet-rpc.ts";
import { confirmFreshPurchaseReview } from "../../src/lib/near/action-review.ts";
import { canonicalReviewContent as canonical } from "../../src/lib/near/review-content.ts";
import { object, parseBoundedJson } from "../../src/lib/near/records.ts";
import { DEMO_PURCHASE_ACTION, DEMO_PURCHASE_SCOPE, DEMO_PURCHASE_TARGET, assertDemoPurchaseIntent, assertDemoPurchaseReview } from "./demo-purchase-scope.ts";
import { readDemoPurchaseCosts } from "./demo-purchase-costs.ts";
import { confirmTestnetAgentRun } from "./runner-admission.ts";
import { runRestrictedTestnetPurchase } from "./restricted-testnet-runner.ts";
import { disposeRestrictedProcessKey, type RestrictedProcessKey } from "./restricted-process-key.ts";

const issued = new WeakSet<object>(), consumed = new WeakSet<object>(), approvals = new WeakSet<object>();
export async function prepareDemoDbPurchase(transport?: typeof fetch) {
  const started = Date.now(), reader = createTestnetReader(DEMO_PURCHASE_TARGET, transport);
  const review = await reader.readPurchaseReview(DEMO_PURCHASE_ACTION, DEMO_PURCHASE_SCOPE);
  assertDemoPurchaseReview(review);
  const costs = await readDemoPurchaseCosts(review, transport ?? fetch);
  if (Date.now() < started || Date.now() - started >= 60000) throw Error("DB_PURCHASE_REVIEW_EXPIRED");
  const prepared = Object.freeze({ source: "UNSIGNED_EXACT_DEMO_DB_PURCHASE" as const, prepared_at_ms: started, review, costs,
    signing_enabled: false as const, grants_payment_authority: false as const,
    limitation: "Exact read-only preparation. Human scope confirmation and restricted signature remain separate; Rust can deny and a returned hash is not settlement." });
  issued.add(prepared); return prepared;
}
export type DemoDbPurchaseReview = Awaited<ReturnType<typeof prepareDemoDbPurchase>>;
export function assertIssuedDemoDbPurchase(prepared: DemoDbPurchaseReview) {
  if (!issued.has(prepared)) throw Error("DB_PURCHASE_REVIEW_UNISSUED");
  if (Date.now() < prepared.prepared_at_ms || Date.now() - prepared.prepared_at_ms >= 60000) throw Error("DB_PURCHASE_REVIEW_EXPIRED");
}
/** Trusted human boundary only. Never call from provider/agent/imported JSON or read-only preparation. */
export function confirmDemoDbExecution(prepared: DemoDbPurchaseReview, input: unknown) {
  assertIssuedDemoDbPurchase(prepared);
  const c = object(parseBoundedJson(canonical(input), 16384), ["authorization", "consent", "review_hash", "costs", "calls"]);
  if (c.authorization !== "HUMAN_APPROVED_EXACT_DEMO_DB_PURCHASE" || c.consent !== true || c.calls !== 1
    || c.review_hash !== prepared.review.review_hash || canonical(c.costs) !== canonical(prepared.costs)) throw Error("DB_PURCHASE_EXACT_EXECUTION_CONSENT_REQUIRED");
  const approval = Object.freeze({ source: "EXACT_HUMAN_DEMO_DB_EXECUTION_CONFIRMATION" as const, prepared, calls: 1 as const });
  approvals.add(approval); return approval;
}
export type DemoDbExecutionApproval = ReturnType<typeof confirmDemoDbExecution>;
const samePath = (a: string, b: string) => process.platform === "win32" ? normalize(a).toLowerCase() === normalize(b).toLowerCase() : normalize(a) === normalize(b);
export async function safeDbDirectory(directory: string) {
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || !samePath(await realpath(directory), resolve(directory))) throw Error("DB_PURCHASE_DIRECTORY_UNSAFE");
}
export async function writeDbPurchaseRecord(directory: string, name: string, value: unknown) {
  if (!["review.json", "intent.json", "identity.json", "run.json", "observation.json"].includes(name)) throw Error("DB_PURCHASE_RECORD_NAME_INVALID");
  await safeDbDirectory(directory); const bytes = canonical(value);
  if (Buffer.byteLength(bytes) > 65536) throw Error("DB_PURCHASE_RECORD_LIMIT");
  const file = await open(join(directory, name), "wx", 0o600);
  try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
}
export async function readDbPublicJson(path: string) {
  const meta = await lstat(path);
  if (!meta.isFile() || meta.isSymbolicLink() || meta.size > 65536 || !samePath(await realpath(path), resolve(path))) throw Error("DB_PURCHASE_RECORD_UNSAFE");
  const file = await open(path, "r");
  try {
    const opened = await file.stat();
    if (opened.dev !== meta.dev || opened.ino !== meta.ino || !opened.isFile() || opened.size > 65536) throw Error("DB_PURCHASE_RECORD_CHANGED");
    const bytes = Buffer.alloc(65537); let size = 0;
    while (size < bytes.length) { const next = await file.read(bytes, size, bytes.length - size, size); if (!next.bytesRead) break; size += next.bytesRead; }
    if (size > 65536) throw Error("DB_PURCHASE_RECORD_LIMIT");
    return parseBoundedJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size)), 65536);
  } finally { await file.close(); }
}
type Runner = typeof runRestrictedTestnetPurchase;
interface Ports {
  readonly loadKey: () => RestrictedProcessKey; readonly transport?: typeof fetch;
  /** Explicit synthetic-only test ports. Never supplied by the human CLI or HTTP-mode execution. */
  readonly testNamespace?: string; readonly testRun?: Runner; readonly testDispose?: (key: RestrictedProcessKey) => void;
}
export async function executeDemoDbPurchase(directory: string, approval: DemoDbExecutionApproval, ports: Ports) {
  if (!approvals.has(approval)) throw Error("DB_PURCHASE_EXECUTION_APPROVAL_UNISSUED");
  const prepared = approval.prepared;
  assertIssuedDemoDbPurchase(prepared);
  if (consumed.has(approval)) throw Error("DB_PURCHASE_APPROVAL_CONSUMED");
  const publicHttp = prepared.review.transport_source === "EXPLICIT_TESTNET_HTTP_READBACK";
  if (publicHttp && (ports.testRun || ports.testNamespace || ports.testDispose || ports.transport && ports.transport !== fetch)) throw Error("DB_PURCHASE_PUBLIC_PORTS_FIXED");
  consumed.add(approval);
  await safeDbDirectory(directory); await writeDbPurchaseRecord(directory, "review.json", prepared);
  const fresh = await prepareDemoDbPurchase(ports.transport);
  assertIssuedDemoDbPurchase(prepared);
  confirmFreshPurchaseReview(prepared.review, fresh.review, { consent: true, review_hash: prepared.review.review_hash });
  if (canonical(prepared.costs) !== canonical(fresh.costs)) throw Error("DB_PURCHASE_COSTS_CHANGED_STOPPED");
  const review = prepared.review;
  const admission = confirmTestnetAgentRun(review, { authorization: "HUMAN_APPROVED_EXACT_TESTNET_AGENT_CALL", consent: true,
    review_hash: review.review_hash, target: review.target, scope: DEMO_PURCHASE_SCOPE, call: review.call, exposure: review.exposure, calls: 1 }, ports.testNamespace);
  await writeDbPurchaseRecord(directory, "intent.json", { source: "ONE_HUMAN_REVIEWED_DB_PURCHASE_INTENT_NOT_SETTLEMENT", call: review.call,
    review_hash: review.review_hash, rule: "Key/request journals capture the exact signed identity before one send; never resume/re-sign/resend or delete any claim." });
  assertIssuedDemoDbPurchase(prepared);
  let key: RestrictedProcessKey | undefined;
  try {
    key = ports.loadKey();
    const run = await (ports.testRun ?? runRestrictedTestnetPurchase)(admission, key, { reader: createTestnetReader(review.target, ports.transport) });
    // The existing request/key journals already durably captured before any send.
    // This additional human-output record is not the authoritative exclusion gate.
    if (run.identity) {
      const tx = run.identity.transaction;
      const intent = assertDemoPurchaseIntent({ transaction_hash: run.identity.transaction_hash, sender_id: tx.signer_id,
        public_key: tx.public_key, method: "submit_purchase", gas: tx.gas, proposal: tx.args.proposal, expected_request_hash: null });
      await writeDbPurchaseRecord(directory, "identity.json", { source: "EXACT_CAPTURED_DB_PURCHASE_IDENTITY_NOT_SETTLEMENT", intent });
    }
    await writeDbPurchaseRecord(directory, "run.json", run);
    if (!run.identity) return Object.freeze({ status: "DB_PURCHASE_NOT_ENTERED_READBACK_ONLY", run,
      limitation: "No returned transaction identity. Retain all attempt files; never resume or fall back to a broader key." });
    const intent = assertDemoPurchaseIntent(object(await readDbPublicJson(join(directory, "identity.json")), ["source", "intent"]).intent);
    const observation = await createTestnetReader(review.target, ports.transport).observePurchase(intent);
    if (canonical(observation.target) !== canonical(DEMO_PURCHASE_TARGET) || observation.transaction_hash !== intent.transaction_hash
      || canonical(observation.proposal) !== canonical(intent.proposal)) throw Error("DB_PURCHASE_OBSERVATION_IDENTITY_MISMATCH");
    await writeDbPurchaseRecord(directory, "observation.json", observation);
    return Object.freeze({ status: observation.submission === "FINAL" && observation.payment_evidence === "SETTLED"
      && observation.transfer_succeeded === true && observation.callback_succeeded === true
      && observation.initial_receipt_id && observation.transfer_receipt_id && observation.callback_receipt_id
      && observation.final_record?.status === "SETTLED"
      ? "DB_PURCHASE_SETTLEMENT_OBSERVED" : "DB_PURCHASE_PENDING_OR_UNVERIFIED_READBACK_ONLY", intent, observation,
      provisioning: "NOT_RECORDED", task_check: "NOT_RECORDED", human_acceptance: "NOT_RECORDED",
      limitation: "RPC-reported purchase evidence only. Native transfer/private callback are separate from a returned hash and from provisioning/check/acceptance. No light-client proof or automatic retry." });
  } finally { if (key) (ports.testDispose ?? disposeRestrictedProcessKey)(key); }
}
export async function readDemoDbIntent(directory: string) {
  await safeDbDirectory(directory);
  try { const record = object(await readDbPublicJson(join(directory, "identity.json")), ["source", "intent"]);
    if (record.source !== "EXACT_CAPTURED_DB_PURCHASE_IDENTITY_NOT_SETTLEMENT") throw Error("DB_PURCHASE_RECORD_SOURCE_INVALID"); return assertDemoPurchaseIntent(record.intent);
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  // Crash recovery is READ ONLY. A captured public journal identity can be
  // observed, never adopted as a signing approval or used to release a claim.
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const journal = join(root, ".local", "testnet-mvp", "single-attempt", "working-mvp");
  try { await safeDbDirectory(journal); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  const p = DEMO_PURCHASE_ACTION.proposal;
  const attempt = createHash("sha256").update(JSON.stringify(["runlatch.local-attempt.v1", "testnet", DEMO_PURCHASE_TARGET.contract_id, p.capsule_id, p.request_id])).digest("hex");
  try {
    const record = object(await readDbPublicJson(join(journal, `${attempt}.1.json`)), ["source", "attempt_id", "event", "intent", "payment_evidence", "public_execution"]);
    if (record.source !== "RESTRICTED_TESTNET_ATTEMPT" || record.attempt_id !== attempt || record.event !== "IDENTITY_CAPTURED"
      || record.payment_evidence !== "NOT_OBSERVED" || record.public_execution !== "NOT_PROVEN") throw Error("DB_PURCHASE_JOURNAL_IDENTITY_MISMATCH");
    return assertDemoPurchaseIntent(record.intent);
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
