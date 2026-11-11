/** Bounded explicit project/evidence join. No file relabelling, signer, retry or authority. */
import type { createTestnetReader } from "./testnet-rpc.ts";
import { parseProjectSelection } from "./testnet-rpc.ts";
import { canonicalReviewContent as canonical } from "./review-content.ts";
import { parsePurchaseObservationIntent } from "./testnet-evidence.ts";
import { account, enumValue, fail, hash, id, list, object, parseBoundedJson, parsePurchase, time } from "./records.ts";
import { buildProjectReport } from "../reporting/project.ts";
import { projectOutcomeObservation, type CanonicalObservation } from "../intelligence/receipts.ts";
import type { Attempt, ObservedPurchase } from "./observation.ts";
import { attachReportEvidence } from "../reporting/evidence-report.ts";

type Reader = Pick<ReturnType<typeof createTestnetReader>, "readProject" | "observePurchase">;
const issued = new WeakSet<object>();
export async function readVerifiedProject(reader: Reader, input: unknown, signal?: AbortSignal) {
  const v = object(parseBoundedJson(canonical(input), 16384), ["selection", "intents"]), selection = parseProjectSelection(v.selection);
  const projectId = selection.project_id, capsuleIds = selection.capsule_ids;
  const intents = list(v.intents, 4).map(parsePurchaseObservationIntent);
  if (new Set(intents.map(i => i.transaction_hash)).size !== intents.length || intents.some(i => i.proposal.project_id !== projectId || !capsuleIds.includes(i.proposal.capsule_id))) return fail("PROJECT_EVIDENCE_SCOPE_MISMATCH");
  const abort = signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000);
  if (abort.aborted) return fail("TESTNET_READ_CANCELLED");
  const evidence = [] as Awaited<ReturnType<Reader["observePurchase"]>>[];
  for (const intent of intents) {
    if (abort.aborted) return fail("TESTNET_READ_CANCELLED");
    evidence.push(await reader.observePurchase(intent, abort));
  }
  const selected = await reader.readProject(selection, abort);
  const fullReport = await buildProjectReport(JSON.stringify({ source: "NEAR_TESTNET_OBSERVATION", contract_id: selected.target.contract_id,
    network_tag: "testnet", block_hash: selected.block.hash, project_id: projectId, snapshots: selected.snapshots }),
  { project_id: projectId, budget: true, expenses: true, evidence: true });
  const purchases: ObservedPurchase[] = [], attempts: Attempt[] = [], usedReceipts = new Set<string>();
  const unverified: { capsule_id: string; request_id: string; transaction_hash: string; limitation: string }[] = [];
  for (const e of evidence) {
    if (e.transport_source !== selected.transport_source || e.target.contract_id !== selected.target.contract_id) return fail("PROJECT_EVIDENCE_TRANSPORT_MISMATCH");
    if ("block" in e && (e.block.height > selected.block.height || BigInt(e.block.timestamp_ns) > BigInt(selected.block.timestamp_ns)
      || e.block.height === selected.block.height && e.block.hash !== selected.block.hash)) return fail("PROJECT_EVIDENCE_STALE_BLOCK");
    if (e.payment_evidence === "SETTLED" || e.payment_evidence === "SETTLEMENT_FAILED") {
      const current = selected.snapshots.flatMap(s => list(object(s).purchases, 32)).map(parsePurchase)
        .find(p => p.proposal.capsule_id === e.proposal.capsule_id && p.proposal.request_id === e.proposal.request_id);
      if (!current || !e.final_record || canonical(current) !== canonical(e.final_record)) return fail("PROJECT_EVIDENCE_TERMINAL_RECORD_MISMATCH");
      for (const ref of [e.initial_receipt_id, e.transfer_receipt_id, e.callback_receipt_id]) {
        if (!ref || usedReceipts.has(ref)) return fail("PROJECT_EVIDENCE_REUSED_RECEIPT"); usedReceipts.add(ref);
      }
    }
    if (e.payment_evidence === "SETTLEMENT_UNVERIFIED") unverified.push({ capsule_id: e.proposal.capsule_id, request_id: e.proposal.request_id, transaction_hash: e.transaction_hash, limitation: e.limitation });
  }
  const capsules = selected.snapshots.map(raw => {
    const snapshot = object(raw), c = object(snapshot.capsule), policy = object(c.policy), project = object(snapshot.project), pInput = object(project.input);
    for (const rawPurchase of list(snapshot.purchases, 32)) {
      const p = parsePurchase(rawPurchase), matches = evidence.filter(e => e.proposal.capsule_id === p.proposal.capsule_id && e.proposal.request_id === p.proposal.request_id);
      const proofs = matches.filter(e => e.final_record && canonical(e.final_record) === canonical(p));
      const proven = proofs.find(e => p.status === "SETTLED" && e.payment_evidence === "SETTLED" || p.status === "SETTLEMENT_FAILED" && e.payment_evidence === "SETTLEMENT_FAILED");
      const payment: ObservedPurchase["payment_evidence"] = p.status === "SETTLED" || p.status === "SETTLEMENT_FAILED" ? proven ? p.status : "SETTLEMENT_UNVERIFIED"
        : p.status === "SETTLEMENT_PENDING" ? "SETTLEMENT_PENDING" : "NOT_ATTEMPTED";
      const milestones = proven ? ["REQUESTED", "AUTHORIZED", "RESERVED", "SETTLEMENT_PENDING"] : [];
      purchases.push(Object.freeze({ record: p, payment_evidence: payment, milestones: Object.freeze(milestones) }));
      for (const e of proofs) {
        if (e.actual_decision === null || !e.initial_receipt_id || e.record_source !== "CONTRACT_EXECUTION_RECORD" && e.record_source !== "CONTRACT_REJECTED_ATTEMPT") continue;
        attempts.push(Object.freeze({ transaction_id: e.transaction_hash, proposal: e.proposal, decision: e.actual_decision, reason_codes: e.reason_codes,
          record_source: e.record_source, request_hash: p.request_hash, initial: { receipt_id: e.initial_receipt_id, succeeded: true },
          transfer: e.transfer_receipt_id && p.canonical_quote && e.transfer_succeeded !== null ? { receipt_id: e.transfer_receipt_id, succeeded: e.transfer_succeeded, receiver: p.canonical_quote.input.recipient_id, amount: p.canonical_quote.input.price } : null,
          callback: e.callback_receipt_id && e.callback_succeeded !== null ? { receipt_id: e.callback_receipt_id, succeeded: e.callback_succeeded } : null }));
      }
    }
    return Object.freeze({ capsule_id: id(c.capsule_id), status: enumValue(c.status, ["ACTIVE", "PAUSED", "REVOKED", "COMPLETED", "CLOSING", "CLOSED"]),
      owner_id: account(c.owner_id), policy_hash: hash(c.policy_hash), project_revision: time(policy.project_revision), current_project_revision: time(project.revision),
      project_status: enumValue(project.status, ["ACTIVE", "PAUSED", "CANCELLED", "COMPLETED"]), expires_at_ns: time(policy.expires_at_ns), project_expires_at_ns: time(pInput.expires_at_ns) });
  });
  const observation: CanonicalObservation = Object.freeze({ schema_version: 1, source: selected.transport_source === "EXPLICIT_TESTNET_HTTP_READBACK" ? "TESTNET_RPC_RECORDS" : "INJECTED_TESTNET_RECORDS",
    independently_verified: false, grants_payment_authority: false, public_testnet: selected.transport_source === "EXPLICIT_TESTNET_HTTP_READBACK",
    contract_id: selected.target.contract_id, block_hash: selected.block.hash, observed_at_ns: selected.block.timestamp_ns, project_id: projectId,
    providers: selected.providers, quotes: selected.quotes, capsules: Object.freeze(capsules), purchases: Object.freeze(purchases), attempts: Object.freeze(attempts), report: fullReport,
    unverified_requests: Object.freeze(unverified) });
  const outcome = await projectOutcomeObservation(observation, selected.snapshots);
  const result = Object.freeze({ selected, outcome, evidence: Object.freeze(evidence), report: attachReportEvidence(selected.report, purchases),
    source: observation.source, unverified_requests: observation.unverified_requests!, independently_verified: false as const, grants_payment_authority: false as const });
  issued.add(result); return result;
}
export type VerifiedProject = Awaited<ReturnType<typeof readVerifiedProject>>;
export function assertIssuedVerifiedProject(value: VerifiedProject) { if (!issued.has(value)) return fail("UNISSUED_PROJECT_EVIDENCE"); }
