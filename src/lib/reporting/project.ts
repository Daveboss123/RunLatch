/** Selected, read-only project expense projection. It is not chain verification or accounting software. */
import { budgetBreakdown, calculateCommitment, integerAmount } from "../purchasing/commitment.ts";
import { commercialQuoteHash, type CanonicalQuoteTerms } from "../purchasing/hashing.ts";
import { executionFromSource } from "../execution.ts";
type ObjectValue = Record<string, unknown>;
const fail = (code: string): never => { throw new Error(code); };
function object(value: unknown): ObjectValue { if (value === null || typeof value !== "object" || Array.isArray(value)) return fail("INVALID_CANONICAL_RECORD"); return value as ObjectValue; }
const id = (value: unknown): string => typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/u.test(value) ? value : fail("INVALID_RECORD_ID");
const hash = (value: unknown): string => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value) ? value : fail("INVALID_RECORD_HASH");
const amount = (value: unknown): string => { integerAmount(value); return value as string; };
function list(value: unknown, max: number): unknown[] { if (!Array.isArray(value) || value.length > max) return fail("RECORD_COUNT_LIMIT"); return value; }
const enumValue = (value: unknown, values: readonly string[]): string => typeof value === "string" && values.includes(value) ? value : fail("INVALID_RECORD_STATUS");
const time = (value: unknown): string => typeof value === "string" && /^(0|[1-9][0-9]{0,19})$/u.test(value) && BigInt(value) < (1n << 64n) ? value : fail("INVALID_RECORD_TIME");
export interface ProjectDisclosure { readonly project_id: string; readonly budget: boolean; readonly expenses: boolean; readonly evidence: boolean }

export async function buildProjectReport(serialized: string, disclosure: ProjectDisclosure) {
  if (typeof serialized !== "string" || new TextEncoder().encode(serialized).length > 1_048_576) return fail("PROJECT_REPORT_INPUT_LIMIT");
  id(disclosure.project_id);
  if ([disclosure.budget, disclosure.expenses, disclosure.evidence].some(v => typeof v !== "boolean")) return fail("EXPLICIT_DISCLOSURE_REQUIRED");
  let parsed: unknown; try { parsed = JSON.parse(serialized); } catch { return fail("INVALID_REPORT_JSON"); }
  const input = object(parsed);
  if (Object.keys(input).length !== 6 || Object.keys(input).some(k => !["source", "contract_id", "network_tag", "block_hash", "project_id", "snapshots"].includes(k))) return fail("INVALID_REPORT_ENVELOPE");
  const source = enumValue(input.source, ["SIMULATED", "LOCAL_NEAR_SANDBOX_OBSERVATION", "NEAR_TESTNET_OBSERVATION"]);
  if (input.project_id !== disclosure.project_id || input.network_tag !== "testnet" || typeof input.contract_id !== "string" || !/^[a-z0-9][a-z0-9._-]{1,63}$/u.test(input.contract_id)
    || typeof input.block_hash !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/u.test(input.block_hash)) return fail("REPORT_SCOPE_MISMATCH");
  const snapshots = list(input.snapshots, 4); if (!snapshots.length) return fail("NO_CANONICAL_REPORT_RECORDS");
  const seen = new Set<string>(), requests = new Set<string>();
  const totals = { original_budget: 0n, allocated: 0n, spent: 0n, reserved: 0n, committed_future: 0n, returned: 0n };
  const expenses: { capsule_id: string; request_id: string; provider_id: string | null; service_id: string | null; amount_due_now: string | null;
    total_commitment: string | null; future_commitment: string; decision: string; payment_status: string; provisioning_status: string;
    provisioning_trust_class: string | null; task_check_status: string; task_check_scope: string; human_acceptance: string;
    human_acceptance_scope: string; acceptance_matches_current_evidence: boolean }[] = [];
  let canonicalProject: string | null = null, projectCapsuleCount = 0;
  for (const item of snapshots) {
    const snapshot = object(item), project = object(snapshot.project), projectInput = object(project.input), capsule = object(snapshot.capsule), policy = object(capsule.policy);
    if (projectInput.project_id !== disclosure.project_id || policy.project_id !== disclosure.project_id) return fail("REPORT_SCOPE_MISMATCH");
    const projectCanonical = JSON.stringify(project);
    if (canonicalProject !== null && canonicalProject !== projectCanonical) return fail("MIXED_PROJECT_SNAPSHOTS");
    canonicalProject = projectCanonical; projectCapsuleCount = list(project.capsule_ids, 64).length;
    const projectIndex = list(project.capsule_ids, 64).map(id);
    if (new Set(projectIndex).size !== projectIndex.length) return fail("DUPLICATE_PROJECT_INDEX");
    const capsuleId = id(capsule.capsule_id); if (seen.has(capsuleId)) return fail("DUPLICATE_CAPSULE_SNAPSHOT"); seen.add(capsuleId);
    if (!list(project.capsule_ids, 64).includes(capsuleId)) return fail("CAPSULE_PROJECT_INDEX_MISMATCH");
    time(project.revision); time(policy.project_revision); hash(capsule.policy_hash);
    const original = integerAmount(policy.budget), returned = integerAmount(capsule.returned);
    const balances = budgetBreakdown({ allocated: amount(capsule.allocated), spent: amount(capsule.spent), reserved: amount(capsule.reserved), committed_future: amount(capsule.committed_future) });
    if (integerAmount(balances.allocated) + returned !== original) return fail("INVALID_ALLOCATION_LEDGER");
    const allocation = integerAmount(project.allocated_authority), ceiling = integerAmount(projectInput.budget_ceiling);
    if (allocation > ceiling || original > allocation) return fail("INVALID_PROJECT_ALLOCATION");
    for (const field of ["allocated", "spent", "reserved", "committed_future"] as const) totals[field] += integerAmount(balances[field]);
    totals.original_budget += original; totals.returned += returned;
    let spentSum = 0n, reservedSum = 0n, futureSum = 0n;
    const canonicalRequests = list(snapshot.purchases, 32), indexed = list(capsule.request_ids, 32);
    if (canonicalRequests.length !== indexed.length) return fail("INCOMPLETE_PURCHASE_SNAPSHOT");
    const provisioning = list(snapshot.provisioning, 32);
    if (provisioning.length !== canonicalRequests.length) return fail("INCOMPLETE_EVIDENCE_SNAPSHOT");
    const check = snapshot.task_check === null ? null : object(snapshot.task_check);
    const outcome = snapshot.outcome === null ? null : object(snapshot.outcome);
    if (check !== null && outcome !== null) return fail("CONFLICTING_TASK_OUTCOMES");
    const checkReport = check !== null ? object(check.report) : outcome !== null ? object(outcome.report) : null;
    const taskStatus = checkReport === null ? "NOT_CHECKED" : enumValue(checkReport.status, ["VALIDATION_PASSED", "VALIDATION_FAILED", "VALIDATION_ERROR"]);
    if (check && (check.capsule_id !== capsuleId || check.policy_hash !== capsule.policy_hash || !indexed.includes(check.request_id))) return fail("TASK_OUTCOME_BINDING_MISMATCH");
    if (outcome && (outcome.capsule_id !== capsuleId || outcome.policy_hash !== capsule.policy_hash)) return fail("TASK_OUTCOME_BINDING_MISMATCH");
    const acceptance = snapshot.human_acceptance === null ? null : object(snapshot.human_acceptance);
    const snapshotHash = hash(snapshot.evidence_snapshot_hash);
    const acceptanceCurrent = acceptance !== null && acceptance.evidence_snapshot_hash === snapshotHash;
    if (acceptance && (acceptance.capsule_id !== capsuleId || acceptance.outcome_hash !== (check?.outcome_hash ?? outcome?.outcome_hash))) return fail("ACCEPTANCE_BINDING_MISMATCH");
    const acceptanceStatus = acceptance === null ? "NOT_RECORDED" : enumValue(acceptance.decision, ["ACCEPTED", "REJECTED"]);
    for (const record of canonicalRequests) {
      const request = object(record), proposal = object(request.proposal), requestId = id(proposal.request_id);
      if (proposal.capsule_id !== capsuleId || proposal.project_id !== disclosure.project_id || !indexed.includes(requestId)) return fail("PURCHASE_BINDING_MISMATCH");
      const identity = `${capsuleId}:${requestId}`; if (requests.has(identity)) return fail("DUPLICATE_PURCHASE_SNAPSHOT"); requests.add(identity);
      const payment = enumValue(request.status, ["DENIED", "APPROVAL_PENDING", "SETTLEMENT_PENDING", "SETTLED", "SETTLEMENT_FAILED", "CANCELLED", "EXPIRED"]);
      const decision = enumValue(request.decision, ["APPROVED", "APPROVAL_REQUIRED", "DENIED"]);
      if (["SETTLEMENT_PENDING", "SETTLED", "SETTLEMENT_FAILED"].includes(payment) && decision !== "APPROVED"
        || payment === "APPROVAL_PENDING" && decision !== "APPROVAL_REQUIRED"
        || payment === "DENIED" && decision !== "DENIED") return fail("DECISION_PAYMENT_MISMATCH");
      const pending = integerAmount(request.reserved_amount), future = integerAmount(request.committed_future_amount);
      if (payment !== "SETTLEMENT_PENDING" && pending !== 0n || !["SETTLEMENT_PENDING", "SETTLED"].includes(payment) && future !== 0n) return fail("INVALID_OPERATION_LEDGER");
      reservedSum += pending; futureSum += future;
      let quote: CanonicalQuoteTerms | null = null;
      if (request.canonical_quote !== null) {
        quote = request.canonical_quote as CanonicalQuoteTerms;
        const quoteObject = object(quote), q = object(quoteObject.input);
        id(q.provider_id); id(q.service_id); id(q.resource_key);
        const computedHash = await commercialQuoteHash(quote, input.network_tag, input.contract_id);
        if (["SETTLEMENT_PENDING", "SETTLED", "SETTLEMENT_FAILED"].includes(payment) && computedHash !== proposal.expected_quote_hash) return fail("CANONICAL_QUOTE_HASH_MISMATCH");
        if (payment === "SETTLED") spentSum += integerAmount(q.price);
        if (payment === "SETTLEMENT_PENDING" && pending !== integerAmount(q.price)) return fail("RESERVATION_AMOUNT_MISMATCH");
        if (["SETTLEMENT_PENDING", "SETTLED"].includes(payment) && calculateCommitment(quote.input).committed_future !== future.toString()) return fail("COMMITMENT_AMOUNT_MISMATCH");
      } else if (["SETTLEMENT_PENDING", "SETTLED", "SETTLEMENT_FAILED"].includes(payment)) return fail("MISSING_CANONICAL_QUOTE");
      const matching = provisioning.filter(item => object(item).request_id === requestId);
      if (matching.length !== 1) return fail("PROVISIONING_SCOPE_MISMATCH");
      const evidence = list(object(matching[0]).records, 2);
      if (evidence.length && !["SETTLED", "SETTLEMENT_FAILED"].includes(payment)) return fail("PROVISIONING_WITHOUT_RESOLVED_PAYMENT");
      const latest = evidence.length ? object(object(evidence[evidence.length - 1]).input) : null;
      const provisionStatus = latest === null ? "NOT_EVIDENCED" : enumValue(latest.status, ["PROVISIONED", "FAILED", "UNKNOWN"]);
      const trust = latest === null ? null : enumValue(latest.trust_class, ["DEMO_FIXTURE", "APPLICATION_OBSERVATION"]);
      if (provisionStatus === "PROVISIONED" && payment !== "SETTLED") return fail("PROVISIONING_WITHOUT_SETTLED_PAYMENT");
      const commitment = quote === null ? null : calculateCommitment(quote.input);
      const appliesToRequest = check !== null && check.request_id === requestId;
      expenses.push({ capsule_id: capsuleId, request_id: requestId, provider_id: quote?.input.provider_id ?? null, service_id: quote?.input.service_id ?? null,
        amount_due_now: quote?.input.price ?? null, total_commitment: commitment?.known_minimum_commitment ?? null, future_commitment: future.toString(),
        decision, payment_status: payment, provisioning_status: provisionStatus, provisioning_trust_class: trust,
        task_check_status: appliesToRequest || outcome !== null ? taskStatus : "NOT_CHECKED",
        task_check_scope: appliesToRequest ? "EXACT_RESOURCE_FIXTURE_CHECK" : outcome !== null ? "CAPSULE_RESEARCH_CHECK_NOT_INDIVIDUAL_DELIVERY" : "NOT_APPLICABLE",
        human_acceptance: appliesToRequest || outcome !== null ? acceptanceStatus : "NOT_RECORDED",
        human_acceptance_scope: "CAPSULE_OUTCOME_OWNER_ACTION_NOT_CLIENT_ACCEPTANCE",
        acceptance_matches_current_evidence: (appliesToRequest || outcome !== null) && acceptanceCurrent });
    }
    if (capsule.owner_refund !== null) {
      const refund = object(capsule.owner_refund); if (refund.status === "PENDING") reservedSum += integerAmount(refund.amount);
    }
    if (spentSum !== integerAmount(balances.spent) || reservedSum !== integerAmount(balances.reserved) || futureSum !== integerAmount(balances.committed_future)) return fail("OPERATION_SUM_MISMATCH");
  }
  if (totals.original_budget > (1n << 128n) - 1n) return fail("REPORT_TOTAL_OVERFLOW");
  if (canonicalProject === null || totals.original_budget > integerAmount(object(JSON.parse(canonicalProject)).allocated_authority)) return fail("INVALID_PROJECT_ALLOCATION");
  const coverage = { selected_capsules: seen.size, project_capsules: projectCapsuleCount, complete_project: seen.size === projectCapsuleCount };
  if (coverage.complete_project && totals.original_budget !== integerAmount(object(JSON.parse(canonicalProject)).allocated_authority)) return fail("INCOMPLETE_PROJECT_ALLOCATION");
  const financials = disclosure.budget ? { original_budget: totals.original_budget.toString(), returned: totals.returned.toString(),
    ...budgetBreakdown({ allocated: totals.allocated.toString(), spent: totals.spent.toString(), reserved: totals.reserved.toString(), committed_future: totals.committed_future.toString() }) } : null;
  return Object.freeze({ schema_version: 1, project_id: disclosure.project_id, source, asset: "near-native",
    execution: executionFromSource(source),
    verification: "DERIVED_CANONICAL_INPUT_NOT_INDEPENDENT_CHAIN_PROOF", read_only: true, coverage, financials,
    expenses: disclosure.expenses ? expenses.map(row => disclosure.evidence ? row : {
      capsule_id: row.capsule_id, request_id: row.request_id, provider_id: row.provider_id, service_id: row.service_id, amount_due_now: row.amount_due_now,
      total_commitment: row.total_commitment, future_commitment: row.future_commitment, decision: row.decision, payment_status: row.payment_status }) : [],
    evidence_scope: disclosure.evidence ? "OWNER_ATTESTED_OR_UNATTESTED_OFFCHAIN_FACTS; FIXTURE_CHECKS_NOT_REAL_PROVIDER_PROOF" : "NOT_DISCLOSED",
    limitations: "Not an invoice, FX rate, client acceptance guarantee, hosted access-control service or supplier cancellation. Export only after owner disclosure review." });
}
