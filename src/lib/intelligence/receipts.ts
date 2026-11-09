/** Read-only, bounded projections. Imported records are claims, not independent chain proof. */
import { importLocalObservation, type LocalObservation, type ObservedPurchase } from "../near/observation.ts";
import { account, amount, count, enumValue, fail, hash, id, list, object, parseBoundedJson, time } from "../near/records.ts";
import { RESOURCE_CHECK_IDS, resourceCriteriaHash, type ResourceCheckStatus } from "../validation/resource.ts";
import { researchCriteriaHash } from "../validation/research.ts";
import { analyzeRunCosts, type RunCostFact } from "./cohort.ts";

const STATES = ["VALIDATION_PASSED", "VALIDATION_FAILED", "VALIDATION_ERROR"] as const;
const nullableHash = (v: unknown) => v === null ? null : hash(v);
const version = (v: unknown) => typeof v === "string" && /^[0-9]{1,8}\.[0-9]{1,8}\.[0-9]{1,8}$/u.test(v) ? v : fail("INVALID_VALIDATOR_VERSION");
function timestamp(v: unknown, observed: string, earliest = "0") {
  const result = time(v);
  if (BigInt(result) > BigInt(observed) || BigInt(result) < BigInt(earliest)) return fail("OUTCOME_TIME_MISMATCH");
  return result;
}
export interface ValidationEvidence {
  readonly status: ResourceCheckStatus; readonly validator_id: string; readonly validator_version: string;
  readonly criteria_id: string; readonly criteria_hash: string; readonly artifact_hash: string | null;
  readonly evidence_hash: string; readonly outcome_hash: string; readonly recorded_at_ns: string;
  readonly observed_at_ns: string | null; readonly request_id: string | null; readonly resource_key: string | null;
  readonly scope: "EXACT_RESOURCE_FIXTURE_CHECK" | "CAPSULE_RESEARCH_CHECK";
  readonly source: string; readonly reason_codes: readonly string[];
}
export interface RunEvidence {
  readonly capsule_id: string; readonly project_id: string; readonly contract_id: string;
  readonly policy_version: number; readonly policy_hash: string; readonly workflow_id: string;
  readonly created_at_ns: string; readonly observed_at_ns: string; readonly validation: ValidationEvidence | null;
  readonly completion: "FINAL_TASK_REPORT_RECORDED" | "NO_FINAL_TASK_REPORT";
  readonly acceptance: "ACCEPTED" | "REJECTED" | "NOT_RECORDED";
  readonly acceptance_current: boolean; readonly acceptance_at_ns: string | null;
  readonly ledger_spend: string; readonly evidenced_spend: string; readonly cost_fact: RunCostFact | null;
  readonly exclusion: string | null;
}
export interface OutcomeReceipt {
  readonly contract_id: string;
  readonly project_id: string; readonly capsule_id: string; readonly request_id: string; readonly quote_id: string;
  readonly policy_version: number; readonly policy_hash: string; readonly request_hash: string;
  readonly quote_hash: string; readonly provider_id: string | null; readonly amount: string | null;
  readonly canonical_quote_hash: string | null;
  readonly authorization: "APPROVED" | "APPROVAL_REQUIRED" | "DENIED"; readonly reason_codes: readonly string[];
  readonly transfer_submission: "TRANSFER_RECEIPT_RECORDED" | "SCHEDULED_NOT_EVIDENCED" | "NOT_SUBMITTED";
  readonly settlement: ObservedPurchase["payment_evidence"]; readonly transaction_id: string | null;
  readonly settlement_reference: string | null; readonly callback_reference: string | null;
  readonly created_at_ns: string; readonly resolved_at_ns: string | null; readonly observed_at_ns: string;
  readonly completion: RunEvidence["completion"]; readonly validation: ValidationEvidence | null;
  readonly acceptance: RunEvidence["acceptance"]; readonly acceptance_current: boolean;
  readonly acceptance_at_ns: string | null;
  readonly provisioning: "PROVISIONED" | "FAILED" | "UNKNOWN" | "NOT_EVIDENCED";
  readonly provisioning_at_ns: string | null; readonly provisioning_source: string | null;
}

async function validation(snapshot: Record<string, unknown>, observation: LocalObservation, capsuleId: string,
  policyHash: string, criteria: string, owner: string, created: string): Promise<ValidationEvidence | null> {
  const raw = snapshot.task_check ?? snapshot.outcome;
  if (raw === null) return null;
  const resource = snapshot.task_check !== null;
  const o = object(raw, resource ? ["capsule_id", "request_id", "request_hash", "policy_hash", "report", "attested_by", "recorded_at_ns", "outcome_hash", "source"]
    : ["capsule_id", "policy_hash", "report", "attested_by", "recorded_at_ns", "outcome_hash", "source"]);
  if (o.capsule_id !== capsuleId || o.policy_hash !== policyHash || account(o.attested_by) !== owner) return fail("OUTCOME_OWNER_BINDING_MISMATCH");
  const source = resource ? "OWNER_ATTESTED_LOCAL_FIXTURE_CHECK_NOT_EXTERNAL_TRUTH" : "OWNER_ATTESTED_OFFCHAIN_REPORT";
  if (o.source !== source) return fail("UNSUPPORTED_OUTCOME_SOURCE");
  const recorded = timestamp(o.recorded_at_ns, observation.observed_at_ns, created), r = object(o.report);
  const status = enumValue(r.status, STATES), validatorId = id(r.validator_id), validatorVersion = version(r.validator_version);
  const criteriaId = id(r.criteria_id), criteriaHash = hash(r.criteria_hash);
  if (r.report_schema_version !== 1 || criteriaHash !== criteria || criteriaHash !== await (resource ? resourceCriteriaHash() : researchCriteriaHash())
    || validatorId !== (resource ? "runlatch-resource-validator" : "runlatch-research-validator")
    || validatorVersion !== "1.0.0" || criteriaId !== (resource ? "website-resource-fixture-v1" : "research-output-v1")) return fail("UNSUPPORTED_OUTCOME_CRITERIA");
  const artifactHash = nullableHash(r.artifact_hash);
  const artifactBytes = r.artifact_bytes === null ? null : count(r.artifact_bytes, resource ? 16384 : 1048576);
  if ((artifactHash === null) !== (artifactBytes === null) || status === "VALIDATION_PASSED" && !artifactBytes
    || resource && (status === "VALIDATION_ERROR") !== (artifactHash === null)) return fail("INCONSISTENT_OUTCOME_ARTIFACT");
  let requestId: string | null = null, resourceKey: string | null = null, observed: string | null = null;
  let reasons: readonly string[];
  if (resource) {
    object(r, ["report_schema_version", "criteria_id", "criteria_hash", "validator_id", "validator_version", "source", "project_id", "resource_key",
      "artifact_hash", "artifact_bytes", "evidence_hash", "observed_at_ns", "status", "checks"]);
    requestId = id(o.request_id); resourceKey = id(r.resource_key);
    const purchase = observation.purchases.find(p => p.record.proposal.capsule_id === capsuleId && p.record.proposal.request_id === requestId)?.record;
    if (!purchase || o.request_hash !== purchase.request_hash || r.project_id !== observation.project_id
      || resourceKey !== purchase.canonical_quote?.input.resource_key || r.source !== "LOCAL_FIXTURE_VALIDATOR") return fail("TASK_RESOURCE_BINDING_MISMATCH");
    if (status === "VALIDATION_PASSED" && purchase.status !== "SETTLED") return fail("TASK_PASS_WITHOUT_REPORTED_SETTLEMENT");
    observed = timestamp(r.observed_at_ns, recorded, created);
    const checks = list(r.checks, 3).map((v, i) => {
      const c = object(v, ["check_id", "status"]);
      if (c.check_id !== RESOURCE_CHECK_IDS[i]) return fail("INVALID_OBJECTIVE_CHECKS");
      return { check_id: id(c.check_id), status: enumValue(c.status, STATES) };
    });
    if (checks.length !== 3) return fail("INVALID_OBJECTIVE_CHECKS");
    const derived = checks.some(c => c.status === "VALIDATION_ERROR") ? "VALIDATION_ERROR" : checks.some(c => c.status === "VALIDATION_FAILED") ? "VALIDATION_FAILED" : "VALIDATION_PASSED";
    if (status !== derived) return fail("INCONSISTENT_TASK_CHECK_RESULT");
    reasons = Object.freeze(checks.filter(c => c.status !== "VALIDATION_PASSED").map(c => c.check_id));
  } else {
    object(r, ["report_schema_version", "criteria_id", "criteria_hash", "validator_id", "validator_version", "artifact_hash", "artifact_bytes", "evidence_hash",
      "status", "reason_codes", "issue_count", "issues_truncated", "metrics"]);
    reasons = Object.freeze(list(r.reason_codes, 32).map(id));
    count(r.issue_count, 64);
    if (typeof r.issues_truncated !== "boolean") return fail("INVALID_OUTCOME_SUMMARY");
    const metrics = object(r.metrics, ["record_count", "records_checked", "unique_id_count", "unique_url_count"]);
    if (metrics.record_count !== null) count(metrics.record_count, 50);
    for (const field of ["records_checked", "unique_id_count", "unique_url_count"]) count(metrics[field], 50);
  }
  return Object.freeze({ status, validator_id: validatorId, validator_version: validatorVersion, criteria_id: criteriaId, criteria_hash: criteriaHash,
    artifact_hash: artifactHash, evidence_hash: hash(r.evidence_hash), outcome_hash: hash(o.outcome_hash), recorded_at_ns: recorded,
    observed_at_ns: observed, request_id: requestId, resource_key: resourceKey, scope: resource ? "EXACT_RESOURCE_FIXTURE_CHECK" : "CAPSULE_RESEARCH_CHECK", source, reason_codes: reasons });
}

/** No raw artifact/prompt objects survive this adapter. Outcome hashes are references, not truth guarantees. */
export async function importOutcomeObservation(serialized: string) {
  const observation = await importLocalObservation(serialized);
  for (const q of observation.quotes) timestamp(q.published_at_ns, observation.observed_at_ns);
  const input = object(parseBoundedJson(serialized));
  const runs: RunEvidence[] = [], receipts: OutcomeReceipt[] = [];
  for (const v of list(input.snapshots, 4)) {
    const s = object(v), c = object(s.capsule), policy = object(c.policy), capsuleId = id(c.capsule_id);
    if (c.policy_schema_version !== 2) return fail("UNSUPPORTED_POLICY_VERSION");
    const created = timestamp(c.created_at_ns, observation.observed_at_ns), policyHash = hash(c.policy_hash);
    const workflowId = id(policy.workflow_id), criteria = hash(policy.validation_spec_hash), owner = account(c.owner_id);
    const checked = await validation(s, observation, capsuleId, policyHash, criteria, owner, created);
    if (checked && (BigInt(amount(c.reserved)) !== 0n || c.status === "CLOSING")) return fail("PENDING_SETTLEMENT_BLOCKS_OUTCOME");
    const a = s.human_acceptance === null ? null : object(s.human_acceptance,
      ["capsule_id", "outcome_hash", "evidence_snapshot_hash", "decision", "accepted_by", "recorded_at_ns", "acceptance_hash"]);
    if (a && (!checked || a.capsule_id !== capsuleId || a.outcome_hash !== checked.outcome_hash || account(a.accepted_by) !== owner)) return fail("ACCEPTANCE_OWNER_BINDING_MISMATCH");
    if (a) { hash(a.acceptance_hash); hash(a.evidence_snapshot_hash); }
    const acceptance = a ? enumValue(a.decision, ["ACCEPTED", "REJECTED"]) : "NOT_RECORDED";
    const acceptanceTime = a ? timestamp(a.recorded_at_ns, observation.observed_at_ns, checked!.recorded_at_ns) : null;
    const current = a !== null && a.evidence_snapshot_hash === hash(s.evidence_snapshot_hash);
    const purchases = observation.purchases.filter(p => p.record.proposal.capsule_id === capsuleId);
    const providers = new Map<string, bigint>();
    for (const p of purchases) if (p.payment_evidence === "SETTLED") {
      const q = p.record.canonical_quote!.input;
      providers.set(q.provider_id, (providers.get(q.provider_id) ?? 0n) + BigInt(q.price));
    }
    const evidenced = [...providers.values()].reduce((sum, n) => sum + n, 0n).toString();
    const ledger = amount(c.spent), incomplete = purchases.some(p => p.payment_evidence === "SETTLEMENT_UNVERIFIED");
    let exclusion: string | null = incomplete || evidenced !== ledger ? "SETTLEMENT_UNVERIFIED" : null;
    const fact: RunCostFact | null = exclusion ? null : {
      capsule_id: capsuleId, contract_id: observation.contract_id, source: "LOCAL_NEAR_SANDBOX", network_tag: "local", workflow_id: workflowId,
      criteria_hash: criteria, validator_id: checked?.validator_id ?? "not-recorded", validator_version: checked?.validator_version ?? "0.0.0", asset: "near-native",
      capsule_status: enumValue(c.status, ["ACTIVE", "PAUSED", "REVOKED", "COMPLETED", "CLOSING", "CLOSED"]), validation_status: checked?.status ?? null,
      attestation: checked ? "OWNER_ATTESTED" : "UNATTESTED", recorded_at_ns: checked?.recorded_at_ns ?? null,
      budget: amount(policy.budget), allocated: amount(c.allocated), spent: ledger, reserved: amount(c.reserved), returned: amount(c.returned), storage_credit: amount(c.storage_credit),
      provider_spend: [...providers].sort(([a], [b]) => a.localeCompare(b)).map(([provider_id, spent]) => ({ provider_id, spent: spent.toString() })) };
    if (fact) exclusion = analyzeRunCosts(JSON.stringify([fact])).excluded[0]?.reason ?? null;
    const run: RunEvidence = Object.freeze({ capsule_id: capsuleId, project_id: observation.project_id, contract_id: observation.contract_id, policy_version: 2,
      policy_hash: policyHash, workflow_id: workflowId, created_at_ns: created, observed_at_ns: observation.observed_at_ns, validation: checked,
      completion: checked ? "FINAL_TASK_REPORT_RECORDED" : "NO_FINAL_TASK_REPORT", acceptance, acceptance_current: current, acceptance_at_ns: acceptanceTime,
      ledger_spend: ledger, evidenced_spend: evidenced, cost_fact: fact, exclusion });
    runs.push(run);
    for (const p of purchases) {
      const record = p.record;
      timestamp(record.created_at_ns, observation.observed_at_ns, created);
      const attempts = observation.attempts.filter(a => a.record_source === "CONTRACT_EXECUTION_RECORD" && a.request_hash === record.request_hash
        && a.proposal.capsule_id === capsuleId && a.proposal.request_id === record.proposal.request_id);
      const transferred = attempts.find(a => a.transfer !== null), initiating = transferred ?? attempts.find(a => a.initial?.succeeded);
      const provision = list(object(list(s.provisioning, 32).find(v => object(v).request_id === record.proposal.request_id)).records, 2);
      let provisioning: OutcomeReceipt["provisioning"] = "NOT_EVIDENCED", provisionTime: string | null = null, provisionSource: string | null = null;
      for (const value of provision) {
        const e = object(value, ["input", "recorded_by", "recorded_at_ns", "record_hash", "source"]), input = object(e.input,
          ["status", "trust_class", "source_id", "observed_at_ns", "artifact_hash", "evidence_hash"]);
        if (account(e.recorded_by) !== owner || e.source !== "OWNER_RECORDED_OFFCHAIN_EVIDENCE_NOT_PROVIDER_SIGNATURE") return fail("PROVISIONING_OWNER_BINDING_MISMATCH");
        hash(e.record_hash); hash(input.evidence_hash); nullableHash(input.artifact_hash); id(input.source_id);
        enumValue(input.trust_class, ["DEMO_FIXTURE", "APPLICATION_OBSERVATION"]);
        const recorded = timestamp(e.recorded_at_ns, observation.observed_at_ns, record.resolved_at_ns ?? created);
        provisionTime = timestamp(input.observed_at_ns, recorded, created);
        provisioning = enumValue(input.status, ["PROVISIONED", "FAILED", "UNKNOWN"]); provisionSource = e.source;
      }
      const applicable = checked && (checked.request_id === null || checked.request_id === record.proposal.request_id) ? checked : null;
      receipts.push(Object.freeze({ contract_id: observation.contract_id, project_id: observation.project_id, capsule_id: capsuleId, request_id: record.proposal.request_id,
        quote_id: record.proposal.quote_id, policy_version: 2, policy_hash: policyHash, request_hash: record.request_hash, quote_hash: record.proposal.expected_quote_hash,
        provider_id: record.canonical_quote?.input.provider_id ?? null, amount: record.canonical_quote?.input.price ?? null,
        canonical_quote_hash: record.canonical_quote ? observation.quotes.find(q => q.terms.input.quote_id === record.proposal.quote_id)?.quote_hash ?? null : null,
        authorization: record.decision, reason_codes: record.reason_codes,
        transfer_submission: transferred ? "TRANSFER_RECEIPT_RECORDED" : ["SETTLED", "SETTLEMENT_FAILED", "SETTLEMENT_PENDING"].includes(record.status) ? "SCHEDULED_NOT_EVIDENCED" : "NOT_SUBMITTED",
        settlement: p.payment_evidence, transaction_id: initiating?.transaction_id ?? null,
        settlement_reference: ["SETTLED", "SETTLEMENT_FAILED"].includes(p.payment_evidence) ? transferred?.transfer?.receipt_id ?? null : null,
        callback_reference: transferred?.callback?.receipt_id ?? null, created_at_ns: record.created_at_ns, resolved_at_ns: record.resolved_at_ns,
        observed_at_ns: observation.observed_at_ns, completion: run.completion, validation: applicable, acceptance: applicable ? acceptance : "NOT_RECORDED",
        acceptance_current: applicable !== null && current, acceptance_at_ns: applicable ? acceptanceTime : null, provisioning, provisioning_at_ns: provisionTime, provisioning_source: provisionSource }));
    }
  }
  return Object.freeze({ observation, runs: Object.freeze(runs), receipts: Object.freeze(receipts), independently_verified: false as const });
}
export type OutcomeObservation = Awaited<ReturnType<typeof importOutcomeObservation>>;

/** Owner-selected bundles only. Exact duplicate runs ignored; conflicting snapshots require a new selection. */
export function summarizeOutcomes(bundles: readonly OutcomeObservation[], range: { from: string; to: string } = { from: "0", to: ((1n << 64n) - 1n).toString() }) {
  if (bundles.length > 16) return fail("OUTCOME_BUNDLE_LIMIT");
  const from = BigInt(time(range.from)), to = BigInt(time(range.to));
  if (from > to) return fail("INVALID_OUTCOME_RANGE");
  const seen = new Map<string, string>(), runs: RunEvidence[] = [], receipts: OutcomeReceipt[] = [], selected: OutcomeObservation[] = [];
  let duplicates = 0, filtered = 0, ledgerCount = 0, pendingSettlements = 0;
  const ledgerTotals = { allocated: 0n, spent: 0n, reserved: 0n, committed_future: 0n };
  for (const b of bundles) {
    let include = false, unique = false;
    for (const run of b.runs) {
      const identity = JSON.stringify([run.contract_id, run.capsule_id]);
      const canonical = JSON.stringify({ run, receipts: b.receipts.filter(r => r.capsule_id === run.capsule_id), observation: b.observation });
      if (seen.has(identity)) { if (seen.get(identity) !== canonical) return fail("CONFLICTING_OUTCOME_SNAPSHOTS"); duplicates++; continue; }
      seen.set(identity, canonical);
      unique = true;
      pendingSettlements += b.receipts.filter(r => r.capsule_id === run.capsule_id
        && (r.settlement === "SETTLEMENT_PENDING" || r.settlement === "SETTLEMENT_UNVERIFIED")).length;
      const at = BigInt(run.validation?.recorded_at_ns ?? run.observed_at_ns);
      if (at < from || at > to) { filtered++; continue; }
      runs.push(run); receipts.push(...b.receipts.filter(r => r.capsule_id === run.capsule_id)); include = true;
    }
    if (include) selected.push(b);
    // Ledger position is an observation snapshot, not a time-filtered flow.
    // Use the same duplicate/conflict checks as receipts before counting it.
    if (unique && b.observation.report.financials) {
      ledgerCount++;
      for (const key of Object.keys(ledgerTotals) as (keyof typeof ledgerTotals)[]) {
        ledgerTotals[key] += BigInt(b.observation.report.financials[key]);
      }
    }
  }
  const costs = analyzeRunCosts(JSON.stringify(runs.flatMap(r => r.cost_fact ? [r.cost_fact] : [])));
  const spend = new Map<string, { contract_id: string; provider_id: string; spent: bigint }>(), blocked = new Map<string, number>(), attempts = new Set<string>();
  for (const r of receipts) if (r.settlement === "SETTLED" && r.provider_id && r.amount) {
    const key = JSON.stringify([r.contract_id, r.provider_id]);
    const row = spend.get(key) ?? { contract_id: r.contract_id, provider_id: r.provider_id, spent: 0n };
    row.spent += BigInt(r.amount); spend.set(key, row);
  }
  for (const b of selected) for (const a of b.observation.attempts) {
    if (!runs.some(r => r.contract_id === b.observation.contract_id && r.capsule_id === a.proposal.capsule_id)) continue;
    const key = JSON.stringify([b.observation.contract_id, a.transaction_id]);
    if (attempts.has(key)) continue; attempts.add(key);
    if (a.decision !== "DENIED") continue;
    for (const reason of new Set(a.reason_codes.length ? a.reason_codes : ["NO_REASON_RECORDED"])) blocked.set(reason, (blocked.get(reason) ?? 0) + 1);
  }
  const times = runs.map(r => BigInt(r.validation?.recorded_at_ns ?? r.observed_at_ns));
  amount([...spend.values()].reduce((sum, row) => sum + row.spent, 0n).toString());
  return { source: "DERIVED_SELECTED_INPUT_NOT_INDEPENDENT_CHAIN_PROOF" as const, sample_count: runs.length, duplicate_count: duplicates, filtered_count: filtered,
    time_range_ns: times.length ? { first: times.reduce((a, b) => a < b ? a : b).toString(), last: times.reduce((a, b) => a > b ? a : b).toString() } : null,
    ledger: ledgerCount ? { observation_count: ledgerCount, pending_settlement_receipts: pendingSettlements,
      allocated: amount(ledgerTotals.allocated.toString()), spent: amount(ledgerTotals.spent.toString()),
      reserved: amount(ledgerTotals.reserved.toString()), committed_future: amount(ledgerTotals.committed_future.toString()) } : null,
    receipts, runs, costs, excluded: runs.filter(r => r.exclusion).map(r => ({ capsule_id: r.capsule_id, reason: r.exclusion! })),
    provider_spend: [...spend.values()].map(row => ({ ...row, spent: row.spent.toString() })).sort((a, b) => BigInt(a.spent) > BigInt(b.spent) ? -1 : BigInt(a.spent) < BigInt(b.spent) ? 1 : `${a.contract_id}:${a.provider_id}`.localeCompare(`${b.contract_id}:${b.provider_id}`)),
    blocked_reasons: [...blocked].sort(([a], [b]) => a.localeCompare(b)).map(([reason, count]) => ({ reason, count })),
    quote_changes: selected.flatMap(b => b.observation.quotes.map(q => {
      const input = q.terms.input, prior = b.observation.quotes.find(p => p.terms.input.quote_id === input.previous_quote_id);
      const reason = !input.previous_quote_id ? "NO_PRIOR_QUOTE_REFERENCE" : !prior ? "PRIOR_QUOTE_NOT_SELECTED" :
        BigInt(prior.published_at_ns) > BigInt(q.published_at_ns) || prior.terms.input.quote_id === input.quote_id ? "PRIOR_QUOTE_TIME_MISMATCH" :
          ["provider_id", "recipient_id", "service_id", "category", "resource_key", "quantity", "asset", "recurring", "commercial_terms"].some(k =>
            JSON.stringify(prior.terms.input[k as keyof typeof input]) !== JSON.stringify(input[k as keyof typeof input])) ? "NONCOMPARABLE_TERMS" : null;
      return { contract_id: b.observation.contract_id, project_id: b.observation.project_id, quote_id: input.quote_id, provider_id: input.provider_id,
        prior_quote_id: input.previous_quote_id, previous_amount: reason ? null : prior!.terms.input.price, current_amount: input.price,
        delta_yocto: reason ? null : (BigInt(input.price) - BigInt(prior!.terms.input.price)).toString(), unavailable_reason: reason };
    })) };
}
