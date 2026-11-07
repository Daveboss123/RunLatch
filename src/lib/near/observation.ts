/** Explicit file adapter for LOCAL Sandbox runs. No automatic file access, RPC, signing or upload. */
import { buildProjectReport } from "../reporting/project.ts";
import { calculateCommitment } from "../purchasing/commitment.ts";
import { commercialQuoteHash } from "../purchasing/hashing.ts";
import { account, boolean, enumValue, fail, hash, id, list, object, parseBoundedJson, parseProposal, parseProvider, parsePurchase,
  parseQuote, reference, time, amount, type Proposal, type Purchase, type RegisteredQuote } from "./records.ts";

interface ExecutionReceipt { readonly receipt_id: string; readonly succeeded: boolean }
export interface Attempt {
  readonly transaction_id: string; readonly proposal: Proposal; readonly decision: "APPROVED" | "APPROVAL_REQUIRED" | "DENIED";
  readonly reason_codes: readonly string[]; readonly record_source: "CONTRACT_EXECUTION_RECORD" | "CONTRACT_REJECTED_ATTEMPT";
  readonly request_hash: string; readonly initial: ExecutionReceipt | null;
  readonly transfer: (ExecutionReceipt & { readonly receiver: string; readonly amount: string }) | null;
  readonly callback: ExecutionReceipt | null;
}
export interface ObservedPurchase {
  readonly record: Purchase;
  readonly payment_evidence: "NOT_ATTEMPTED" | "SETTLEMENT_PENDING" | "SETTLED" | "SETTLEMENT_FAILED" | "SETTLEMENT_UNVERIFIED";
  readonly milestones: readonly string[];
}
const receipt = (v: unknown): ExecutionReceipt => {
  const r = object(v, ["receipt_id", "succeeded"]);
  return Object.freeze({ receipt_id: reference(r.receipt_id), succeeded: boolean(r.succeeded) });
};
function parseAttempt(v: unknown): Attempt {
  const a = object(v, ["transaction_id", "finality", "proposal", "response", "initial", "transfer", "callback"]);
  if (a.finality !== "FINAL") return fail("UNFINALIZED_OBSERVATION");
  const response = object(a.response, ["decision", "reason_codes", "transfer_scheduled", "source", "request"]);
  // A final callback response normally says transfer_scheduled=false; never use that as settlement proof.
  boolean(response.transfer_scheduled);
  const proposal = parseProposal(a.proposal), purchase = parsePurchase(response.request);
  if (proposal.capsule_id !== purchase.proposal.capsule_id || proposal.request_id !== purchase.proposal.request_id) return fail("ATTEMPT_BINDING_MISMATCH");
  const source = enumValue(response.source, ["CONTRACT_EXECUTION_RECORD", "CONTRACT_REJECTED_ATTEMPT"]);
  const decision = enumValue(response.decision, ["APPROVED", "APPROVAL_REQUIRED", "DENIED"]);
  if (source === "CONTRACT_EXECUTION_RECORD" && (JSON.stringify(proposal) !== JSON.stringify(purchase.proposal) || decision !== purchase.decision)) return fail("ATTEMPT_BINDING_MISMATCH");
  if (source === "CONTRACT_REJECTED_ATTEMPT" && decision !== "DENIED") return fail("INVALID_REJECTED_ATTEMPT");
  let transfer: Attempt["transfer"] = null;
  if (a.transfer !== null) {
    const t = object(a.transfer, ["receipt_id", "succeeded", "receiver", "amount"]);
    transfer = Object.freeze({ receipt_id: reference(t.receipt_id), succeeded: boolean(t.succeeded), receiver: account(t.receiver), amount: amount(t.amount) });
  }
  const initial = a.initial === null ? null : receipt(a.initial), callback = a.callback === null ? null : receipt(a.callback);
  const identities = [initial?.receipt_id, transfer?.receipt_id, callback?.receipt_id].filter(v => v !== undefined);
  if (new Set(identities).size !== identities.length) return fail("DUPLICATE_EXECUTION_RECEIPT");
  if (source === "CONTRACT_REJECTED_ATTEMPT" && (transfer !== null || callback !== null)) return fail("REJECTED_ATTEMPT_TRANSFER");
  if (decision !== "APPROVED" && (transfer !== null || callback !== null)) return fail("DENIED_ATTEMPT_TRANSFER");
  return Object.freeze({ transaction_id: reference(a.transaction_id), proposal, decision,
    reason_codes: Object.freeze(list(response.reason_codes, 32).map(id)), record_source: source, request_hash: purchase.request_hash, initial, transfer, callback });
}

/** A source string is only a claim. Testnet-labelled files are deliberately not accepted by this LOCAL adapter. */
export async function importLocalObservation(serialized: string) {
  const envelope = object(parseBoundedJson(serialized), ["schema_version", "source", "public_testnet", "network_tag", "contract_id", "block_hash", "observed_at_ns", "project_id", "providers", "quotes", "snapshots", "attempts"]);
  if (envelope.schema_version !== 1 || envelope.source !== "LOCAL_NEAR_SANDBOX_OBSERVATION" || envelope.public_testnet !== false || envelope.network_tag !== "testnet") return fail("LOCAL_OBSERVATION_REQUIRED");
  const contractId = account(envelope.contract_id), blockHash = reference(envelope.block_hash), observed = time(envelope.observed_at_ns), projectId = id(envelope.project_id);
  const providers = Object.freeze(list(envelope.providers, 3).map(parseProvider));
  if (providers.length < 2 || new Set(providers.map(p => p.provider_id)).size !== providers.length) return fail("INVALID_PROVIDER_CATALOGUE");
  const quotes: readonly RegisteredQuote[] = Object.freeze(await Promise.all(list(envelope.quotes, 96).map(q => parseQuote(q, contractId, providers))));
  if (!quotes.length || new Set(quotes.map(q => q.terms.input.quote_id)).size !== quotes.length) return fail("DUPLICATE_QUOTE_RECORD");
  for (const provider of providers) if (quotes.filter(q => q.terms.input.provider_id === provider.provider_id).length > provider.quote_count) return fail("QUOTE_COUNT_MISMATCH");
  const snapshots = list(envelope.snapshots, 4);
  const report = await buildProjectReport(JSON.stringify({ source: envelope.source, contract_id: contractId, network_tag: "testnet", block_hash: blockHash,
    project_id: projectId, snapshots }), { project_id: projectId, budget: true, expenses: true, evidence: true });
  const attempts = Object.freeze(list(envelope.attempts, 128).map(parseAttempt));
  if (new Set(attempts.map(a => a.transaction_id)).size !== attempts.length) return fail("DUPLICATE_ATTEMPT_TRANSACTION");
  const receiptIds = attempts.flatMap(a => [a.initial?.receipt_id, a.transfer?.receipt_id, a.callback?.receipt_id]).filter(v => v !== undefined);
  if (new Set(receiptIds).size !== receiptIds.length) return fail("DUPLICATE_EXECUTION_RECEIPT");
  const capsules = snapshots.map(v => {
    const s = object(v), c = object(s.capsule), policy = object(c.policy), project = object(s.project), input = object(project.input);
    return Object.freeze({ capsule_id: id(c.capsule_id), status: enumValue(c.status, ["ACTIVE", "PAUSED", "REVOKED", "COMPLETED", "CLOSING", "CLOSED"]),
      owner_id: account(c.owner_id), policy_hash: hash(c.policy_hash), project_revision: time(policy.project_revision),
      current_project_revision: time(project.revision), project_status: enumValue(project.status, ["ACTIVE", "PAUSED", "CANCELLED", "COMPLETED"]),
      expires_at_ns: time(policy.expires_at_ns), project_expires_at_ns: time(input.expires_at_ns) });
  });
  const purchases: ObservedPurchase[] = [];
  for (const snapshot of snapshots) {
    for (const value of list(object(snapshot).purchases, 32)) {
      const p = parsePurchase(value), quote = quotes.find(q => q.terms.input.quote_id === p.proposal.quote_id);
      const capsule = capsules.find(c => c.capsule_id === p.proposal.capsule_id);
      if (!capsule || p.policy_hash !== capsule.policy_hash || p.proposal.project_id !== projectId) return fail("PURCHASE_POLICY_BINDING_MISMATCH");
      if (BigInt(p.created_at_ns) > BigInt(observed) || p.resolved_at_ns !== null && (BigInt(p.resolved_at_ns) > BigInt(observed)
        || BigInt(p.resolved_at_ns) < BigInt(p.created_at_ns))) return fail("PURCHASE_OBSERVATION_TIME_MISMATCH");
      if (["CANCELLED", "EXPIRED"].includes(p.status) && p.decision !== "DENIED") return fail("DECISION_PAYMENT_MISMATCH");
      if (p.canonical_quote !== null && (!quote || await commercialQuoteHash(p.canonical_quote, "testnet", contractId) !== quote.quote_hash)) return fail("PURCHASE_QUOTE_BINDING_MISMATCH");
      if (p.approved_by !== null && p.approved_by !== capsule.owner_id) return fail("APPROVER_BINDING_MISMATCH");
      if (["SETTLEMENT_PENDING", "SETTLED", "SETTLEMENT_FAILED"].includes(p.status)
        && (!quote?.consumed || quote.consumed_by !== `${p.proposal.capsule_id}:${p.proposal.request_id}`
          || quote.quote_hash !== p.proposal.expected_quote_hash)) return fail("PURCHASE_CONSUMPTION_MISMATCH");
      const bound = attempts.filter(a => a.proposal.capsule_id === p.proposal.capsule_id && a.proposal.request_id === p.proposal.request_id && a.record_source === "CONTRACT_EXECUTION_RECORD");
      if (bound.some(a => a.request_hash !== p.request_hash)) return fail("REQUEST_HASH_BINDING_MISMATCH");
      if (bound.some(a => JSON.stringify(a.proposal) !== JSON.stringify(p.proposal))) return fail("ATTEMPT_BINDING_MISMATCH");
      if (bound.filter(a => a.transfer !== null).length > 1) return fail("DUPLICATE_PAYMENT_ATTEMPT");
      let proven = false;
      for (const a of bound) {
        if (a.transfer !== null) {
          if (!quote || a.transfer.receiver !== quote.terms.input.recipient_id || a.transfer.amount !== quote.terms.input.price) return fail("TRANSFER_CANONICAL_BINDING_MISMATCH");
          if (!a.initial?.succeeded) return fail("TRANSFER_WITHOUT_INITIATING_RECEIPT");
          if (a.callback?.succeeded) {
            if (p.status === "SETTLED" && !a.transfer.succeeded || p.status === "SETTLEMENT_FAILED" && a.transfer.succeeded) return fail("SETTLEMENT_OUTCOME_MISMATCH");
            proven = true;
          }
        }
      }
      const resolved = p.status === "SETTLED" || p.status === "SETTLEMENT_FAILED";
      const milestones = bound.some(a => a.initial?.succeeded) ? ["REQUESTED"] : [];
      if (bound.some(a => a.initial?.succeeded && a.transfer !== null)) milestones.push("AUTHORIZED", "RESERVED", "SETTLEMENT_PENDING");
      const payment = resolved ? proven ? p.status : "SETTLEMENT_UNVERIFIED" : p.status === "SETTLEMENT_PENDING" ? "SETTLEMENT_PENDING" : "NOT_ATTEMPTED";
      purchases.push(Object.freeze({ record: p, payment_evidence: payment, milestones: Object.freeze(milestones) }));
    }
  }
  for (const a of attempts) if (!purchases.some(p => p.record.request_hash === a.request_hash && p.record.proposal.capsule_id === a.proposal.capsule_id && p.record.proposal.request_id === a.proposal.request_id)) return fail("ORPHAN_ATTEMPT_RECORD");
  // No raw imported objects/prompt fields are returned. No storage, network or export side effects.
  return Object.freeze({ schema_version: 1, source: "IMPORTED_LOCAL_SANDBOX_RECORDS" as const, independently_verified: false as const,
    grants_payment_authority: false as const, public_testnet: false as const, contract_id: contractId, block_hash: blockHash,
    observed_at_ns: observed, project_id: projectId, providers, quotes, capsules: Object.freeze(capsules), purchases: Object.freeze(purchases), attempts, report });
}
export type LocalObservation = Awaited<ReturnType<typeof importLocalObservation>>;

export function quoteExposure(q: RegisteredQuote) { return calculateCommitment(q.terms.input); }

/** Explicit owner review data, not a wallet request. Imports cannot enable signing or restore stale authority. */
export function approvalReview(observation: LocalObservation, capsuleId: string, requestId: string, expectedRequestHash: string) {
  const p = observation.purchases.find(p => p.record.proposal.capsule_id === capsuleId && p.record.proposal.request_id === requestId)?.record;
  const c = observation.capsules.find(c => c.capsule_id === capsuleId);
  if (!p || !c || p.status !== "APPROVAL_PENDING" || p.request_hash !== hash(expectedRequestHash)) return fail("APPROVAL_BINDING_MISMATCH");
  const q = observation.quotes.find(q => q.terms.input.quote_id === p.proposal.quote_id);
  if (!q || q.quote_hash !== p.proposal.expected_quote_hash || q.consumed) return fail("QUOTE_UNAVAILABLE");
  if (!observation.providers.find(provider => provider.provider_id === q.terms.input.provider_id)?.active) return fail("PROVIDER_SUSPENDED");
  const now = BigInt(observation.observed_at_ns);
  if (c.status !== "ACTIVE" || c.project_status !== "ACTIVE" || c.project_revision !== c.current_project_revision
    || p.proposal.project_revision !== c.project_revision) return fail("STALE_OR_REVOKED_AUTHORITY");
  if ([c.expires_at_ns, c.project_expires_at_ns, p.approval_expires_at_ns, q.terms.input.expires_at_ns].some(t => now >= BigInt(t))) return fail("APPROVAL_EXPIRED");
  return Object.freeze({ network: "testnet", contract_id: observation.contract_id, account_id: c.owner_id, method: "approve_purchase",
    args: Object.freeze({ capsule_id: capsuleId, request_id: requestId, expected_request_hash: p.request_hash }), deposit_yocto: "1",
    canonical_recipient: q.terms.input.recipient_id, exposure: quoteExposure(q), signing_enabled: false,
    limitation: "Imported historical review only. No verified public target, connector, or explicit signature consent." });
}
