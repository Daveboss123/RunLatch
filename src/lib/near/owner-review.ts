/** Unsigned fixed owner controls/outcome actions. Never a signer, settlement resolver or Gate. */
import { buildProjectReport } from "../reporting/project.ts";
import { verifyResourceReport } from "../validation/resource.ts";
import { amount, boolean, count, enumValue, fail, hash, id, list, object, parseBoundedJson, parseProvider, parsePurchase, reference, time } from "./records.ts";
import { parseCapsulePolicy, parseProjectInput } from "./setup-review.ts";
import { assertResourceCriteria, parseProvisioningInput, parseTaskCheckInput } from "./outcome-input.ts";
import { publicKey } from "./testnet-evidence.ts";
import { namedTestnetAccount, parseTestnetTarget, type FinalBlock } from "./testnet-target.ts";
import { canonicalReviewContent as canonical, reviewContentHash as digest } from "./review-content.ts";

const issued = new WeakSet<object>();
const projectStatus = (v: unknown) => enumValue(v, ["ACTIVE", "PAUSED", "CANCELLED", "COMPLETED"]);
type OwnerArgs =
  | { readonly method: "set_project_status"; readonly args: { readonly project_id: string; readonly expected_revision: string; readonly status: ReturnType<typeof projectStatus> } }
  | { readonly method: "advance_project_revision"; readonly args: { readonly project_id: string; readonly expected_revision: string } }
  | { readonly method: "set_provider_status"; readonly args: { readonly provider_id: string; readonly active: boolean } }
  | { readonly method: "set_capsule_paused"; readonly args: { readonly capsule_id: string; readonly paused: boolean } }
  | { readonly method: "revoke_capsule" | "close_capsule"; readonly args: { readonly capsule_id: string } }
  | { readonly method: "reject_purchase" | "cancel_purchase"; readonly args: { readonly capsule_id: string; readonly request_id: string } }
  | { readonly method: "record_provisioning"; readonly args: { readonly capsule_id: string; readonly request_id: string; readonly expected_request_hash: string;
      readonly expected_previous_record_hash: string | null; readonly evidence: ReturnType<typeof parseProvisioningInput> } }
  | { readonly method: "record_task_check"; readonly args: { readonly capsule_id: string; readonly request_id: string; readonly expected_policy_hash: string;
      readonly expected_request_hash: string; readonly report: ReturnType<typeof parseTaskCheckInput> } }
  | { readonly method: "record_human_acceptance"; readonly args: { readonly capsule_id: string; readonly expected_outcome_hash: string;
      readonly expected_evidence_snapshot_hash: string; readonly decision: "ACCEPTED" | "REJECTED" } };
export type OwnerAction = OwnerArgs & { readonly signer_id: string; readonly public_key: string; readonly gas: string };
export function parseOwnerAction(value: unknown): OwnerAction {
  const p = object(parseBoundedJson(canonical(value), 16384), ["method", "args", "signer_id", "public_key", "gas"]);
  const common = { signer_id: namedTestnetAccount(p.signer_id), public_key: publicKey(p.public_key), gas: time(p.gas) };
  if (common.gas === "0" || BigInt(common.gas) > 300_000_000_000_000n) return fail("INVALID_ACTION_GAS");
  switch (p.method) {
    case "set_project_status": {
      const a = object(p.args, ["project_id", "expected_revision", "status"]);
      return Object.freeze({ ...common, method: p.method, args: Object.freeze({ project_id: id(a.project_id), expected_revision: time(a.expected_revision), status: projectStatus(a.status) }) });
    }
    case "advance_project_revision": {
      const a = object(p.args, ["project_id", "expected_revision"]);
      return Object.freeze({ ...common, method: p.method, args: Object.freeze({ project_id: id(a.project_id), expected_revision: time(a.expected_revision) }) });
    }
    case "set_provider_status": {
      const a = object(p.args, ["provider_id", "active"]);
      return Object.freeze({ ...common, method: p.method, args: Object.freeze({ provider_id: id(a.provider_id), active: boolean(a.active) }) });
    }
    case "set_capsule_paused": {
      const a = object(p.args, ["capsule_id", "paused"]);
      return Object.freeze({ ...common, method: p.method, args: Object.freeze({ capsule_id: id(a.capsule_id), paused: boolean(a.paused) }) });
    }
    case "revoke_capsule": case "close_capsule": {
      const a = object(p.args, ["capsule_id"]);
      return Object.freeze({ ...common, method: p.method, args: Object.freeze({ capsule_id: id(a.capsule_id) }) });
    }
    case "reject_purchase": case "cancel_purchase": {
      const a = object(p.args, ["capsule_id", "request_id"]);
      return Object.freeze({ ...common, method: p.method, args: Object.freeze({ capsule_id: id(a.capsule_id), request_id: id(a.request_id) }) });
    }
    case "record_provisioning": {
      const a = object(p.args, ["capsule_id", "request_id", "expected_request_hash", "expected_previous_record_hash", "evidence"]);
      return Object.freeze({ ...common, method: p.method, args: Object.freeze({ capsule_id: id(a.capsule_id), request_id: id(a.request_id),
        expected_request_hash: hash(a.expected_request_hash), expected_previous_record_hash: a.expected_previous_record_hash === null ? null : hash(a.expected_previous_record_hash), evidence: parseProvisioningInput(a.evidence) }) });
    }
    case "record_task_check": {
      const a = object(p.args, ["capsule_id", "request_id", "expected_policy_hash", "expected_request_hash", "report"]);
      return Object.freeze({ ...common, method: p.method, args: Object.freeze({ capsule_id: id(a.capsule_id), request_id: id(a.request_id),
        expected_policy_hash: hash(a.expected_policy_hash), expected_request_hash: hash(a.expected_request_hash), report: parseTaskCheckInput(a.report) }) });
    }
    case "record_human_acceptance": {
      const a = object(p.args, ["capsule_id", "expected_outcome_hash", "expected_evidence_snapshot_hash", "decision"]);
      return Object.freeze({ ...common, method: p.method, args: Object.freeze({ capsule_id: id(a.capsule_id), expected_outcome_hash: hash(a.expected_outcome_hash),
        expected_evidence_snapshot_hash: hash(a.expected_evidence_snapshot_hash), decision: enumValue(a.decision, ["ACCEPTED", "REJECTED"]) }) });
    }
    default: return fail("OWNER_METHOD_NOT_ADMITTED");
  }
}
export function assertOwnerRole(action: OwnerAction, target: ReturnType<typeof parseTestnetTarget>) {
  if (action.signer_id !== target.operator_id) return fail("OWNER_SIGNER_ROLE_MISMATCH");
}
function freezeJson<T>(value: T): T {
  if (value !== null && typeof value === "object") { for (const child of Object.values(value)) freezeJson(child); Object.freeze(value); }
  return value;
}
function parseProject(value: unknown, target: ReturnType<typeof parseTestnetTarget>, now: bigint) {
  const p = object(value, ["input", "owner_id", "revision", "status", "allocated_authority", "capsule_ids", "created_at_ns", "updated_at_ns"]);
  const input = parseProjectInput(p.input), revision = time(p.revision), allocated = amount(p.allocated_authority);
  const ids = list(p.capsule_ids, 64).map(id), created = time(p.created_at_ns), updated = time(p.updated_at_ns);
  if (p.owner_id !== target.operator_id || revision === "0" || new Set(ids).size !== ids.length || BigInt(allocated) > BigInt(input.budget_ceiling)
    || BigInt(created) > BigInt(updated) || BigInt(updated) > now) return fail("INVALID_OWNER_PROJECT_STATE");
  return Object.freeze({ input, owner_id: target.operator_id, revision, status: projectStatus(p.status), allocated_authority: allocated,
    capsule_ids: Object.freeze(ids), created_at_ns: created, updated_at_ns: updated });
}
export interface OwnerContext {
  readonly block: FinalBlock; readonly signer_access: unknown; readonly project: unknown | null; readonly provider: unknown | null; readonly snapshot: unknown | null;
  readonly transport_source: "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE" | "EXPLICIT_TESTNET_HTTP_READBACK";
}
/** Off-chain artifact is explicitly caller-selected, in memory only, never serialized into a call/hash/journal. */
export interface OwnerArtifact { readonly artifact: Uint8Array | null }
export async function prepareOwnerReview(inputTarget: unknown, inputAction: unknown, context: OwnerContext, evidence?: OwnerArtifact) {
  const target = parseTestnetTarget(inputTarget), action = parseOwnerAction(inputAction); assertOwnerRole(action, target);
  const c = object(parseBoundedJson(canonical(context)), ["block", "signer_access", "project", "provider", "snapshot", "transport_source"]);
  const b = object(c.block, ["hash", "height", "timestamp_ns"]), block = Object.freeze({ hash: reference(b.hash), height: count(b.height, Number.MAX_SAFE_INTEGER), timestamp_ns: time(b.timestamp_ns) });
  const key = object(c.signer_access, ["nonce", "permission"]);
  if (key.permission !== "FullAccess") return fail("OWNER_DEPOSIT_CAPABLE_KEY_REQUIRED");
  const nonce = count(key.nonce, Number.MAX_SAFE_INTEGER).toString(), now = BigInt(block.timestamp_ns);
  const artifact = evidence === undefined ? undefined : object(evidence, ["artifact"]).artifact;
  if (action.method === "record_task_check" ? artifact !== null && !(artifact instanceof Uint8Array) : evidence !== undefined) return fail("EXACT_TASK_ARTIFACT_REQUIRED");
  if (artifact instanceof Uint8Array && artifact.byteLength > 16384) return fail("RESOURCE_ARTIFACT_SIZE_LIMIT");
  const artifactCopy = artifact instanceof Uint8Array ? new Uint8Array(artifact) : null;
  let expiry = now + 60_000_000_000n, financials: Awaited<ReturnType<typeof buildProjectReport>>["financials"] = null;
  let project: ReturnType<typeof parseProject> | null = null, provider: ReturnType<typeof parseProvider> | null = null;
  let snapshot: Record<string, unknown> | null = null, localArtifactVerified = false, projectedRevision: string | null = null, potentialOwnerReturn: string | null = null;
  if (action.method === "set_provider_status") {
    if (c.project !== null || c.snapshot !== null) return fail("UNEXPECTED_OWNER_CONTEXT");
    provider = parseProvider(c.provider);
    if (provider.provider_id !== action.args.provider_id) return fail("OWNER_PROVIDER_SCOPE_MISMATCH");
  } else if (action.method === "set_project_status" || action.method === "advance_project_revision") {
    if (c.provider !== null || c.snapshot !== null) return fail("UNEXPECTED_OWNER_CONTEXT");
    project = parseProject(c.project, target, now);
    if (project.input.project_id !== action.args.project_id || project.revision !== action.args.expected_revision) return fail("PROJECT_REVISION_CONFLICT");
    const changes = action.method === "advance_project_revision" || action.args.status !== project.status;
    if (changes && !["ACTIVE", "PAUSED"].includes(project.status)) return fail("PROJECT_TERMINAL");
    projectedRevision = changes ? time((BigInt(project.revision) + 1n).toString()) : project.revision;
  } else {
    if (c.provider !== null) return fail("UNEXPECTED_OWNER_CONTEXT");
    project = parseProject(c.project, target, now);
    snapshot = object(c.snapshot, ["project", "capsule", "purchases", "provisioning", "outcome", "task_check", "human_acceptance", "evidence_snapshot_hash"]);
    if (snapshot.outcome !== null) return fail("LEGACY_RESEARCH_OUTCOME_REVIEW_NOT_ADMITTED");
    if (canonical(snapshot.project) !== canonical(project)) return fail("OWNER_SNAPSHOT_BINDING_MISMATCH");
    const capsule = object(snapshot.capsule, ["capsule_id", "owner_id", "policy", "policy_hash", "policy_schema_version", "status", "allocated", "spent", "reserved",
      "committed_future", "returned", "storage_credit", "created_at_ns", "revoked_at_ns", "request_ids", "owner_refund", "refund_attempts"]);
    const policy = parseCapsulePolicy(capsule.policy), status = enumValue(capsule.status, ["ACTIVE", "PAUSED", "REVOKED", "COMPLETED", "CLOSING", "CLOSED"]);
    const policyHash = hash(capsule.policy_hash), ids = list(capsule.request_ids, 32).map(id), created = time(capsule.created_at_ns);
    if (capsule.capsule_id !== action.args.capsule_id || capsule.owner_id !== target.operator_id || capsule.policy_schema_version !== 2
      || policy.project_id !== project.input.project_id || !project.capsule_ids.includes(action.args.capsule_id) || new Set(ids).size !== ids.length
      || BigInt(created) > now || BigInt(policy.project_revision) > BigInt(project.revision) || policy.project_revision === "0"
      || BigInt(policy.expires_at_ns) > BigInt(project.input.expires_at_ns)) return fail("OWNER_SNAPSHOT_BINDING_MISMATCH");
    amount(capsule.storage_credit); count(capsule.refund_attempts, 0xffff_ffff);
    if (capsule.revoked_at_ns !== null && (BigInt(time(capsule.revoked_at_ns)) < BigInt(created) || BigInt(time(capsule.revoked_at_ns)) > now)) return fail("INVALID_OWNER_CAPSULE_TIME");
    if (capsule.owner_refund !== null) {
      const refund = object(capsule.owner_refund, ["attempt", "amount", "status", "created_at_ns", "resolved_at_ns", "reconciliation_required"]);
      const rs = enumValue(refund.status, ["PENDING", "RETURNED", "FAILED"]), rc = time(refund.created_at_ns);
      if (count(refund.attempt, 0xffff_ffff) !== capsule.refund_attempts || refund.attempt === 0 || amount(refund.amount) === "0" || BigInt(rc) > now
        || (rs === "PENDING") !== (refund.resolved_at_ns === null) || (rs === "PENDING") !== (status === "CLOSING")) return fail("INVALID_OWNER_REFUND_STATE");
      if (refund.resolved_at_ns !== null && (BigInt(time(refund.resolved_at_ns)) < BigInt(rc) || BigInt(time(refund.resolved_at_ns)) > now)) return fail("INVALID_OWNER_REFUND_STATE");
      boolean(refund.reconciliation_required);
    } else if (status === "CLOSING") return fail("INVALID_OWNER_REFUND_STATE");
    const purchases = list(snapshot.purchases, 32).map(parsePurchase);
    for (const p of purchases) {
      if (p.proposal.capsule_id !== capsule.capsule_id || p.proposal.project_id !== project.input.project_id || p.policy_hash !== policyHash
        || p.proposal.project_revision !== policy.project_revision || BigInt(p.created_at_ns) > now || BigInt(p.created_at_ns) < BigInt(created)
        || p.resolved_at_ns !== null && (BigInt(p.resolved_at_ns) > now || BigInt(p.resolved_at_ns) < BigInt(p.created_at_ns))) return fail("OWNER_PURCHASE_BINDING_MISMATCH");
      if (["CANCELLED", "EXPIRED"].includes(p.status) && p.decision !== "DENIED") return fail("DECISION_PAYMENT_MISMATCH");
    }
    for (const history of list(snapshot.provisioning, 32)) {
      const h = object(history, ["request_id", "records"]); id(h.request_id);
      for (const value of list(h.records, 2)) {
        const r = object(value, ["input", "recorded_by", "recorded_at_ns", "record_hash", "source"]), input = parseProvisioningInput(r.input);
        if (r.recorded_by !== target.operator_id || r.source !== "OWNER_RECORDED_OFFCHAIN_EVIDENCE_NOT_PROVIDER_SIGNATURE"
          || BigInt(time(r.recorded_at_ns)) > now || BigInt(input.observed_at_ns) > BigInt(time(r.recorded_at_ns))) return fail("INVALID_OWNER_EVIDENCE_RECORD");
        hash(r.record_hash);
      }
    }
    // Reuse the existing canonical ledger/index/commitment reducer. No replacement authorization engine.
    const report = await buildProjectReport(JSON.stringify({ source: "NEAR_TESTNET_OBSERVATION", contract_id: target.contract_id, network_tag: "testnet",
      block_hash: block.hash, project_id: project.input.project_id, snapshots: [snapshot] }), { project_id: project.input.project_id, budget: true, expenses: false, evidence: false });
    financials = report.financials;
    if (snapshot.task_check !== null) {
      const t = object(snapshot.task_check, ["capsule_id", "request_id", "request_hash", "policy_hash", "report", "attested_by", "recorded_at_ns", "outcome_hash", "source"]);
      const input = parseTaskCheckInput(t.report), p = purchases.find(p => p.proposal.request_id === t.request_id);
      await assertResourceCriteria(input, policy.validation_spec_hash);
      if (!p || t.request_hash !== p.request_hash || t.attested_by !== target.operator_id || t.source !== "OWNER_ATTESTED_LOCAL_FIXTURE_CHECK_NOT_EXTERNAL_TRUTH"
        || input.project_id !== project.input.project_id || input.resource_key !== p.canonical_quote?.input.resource_key
        || BigInt(time(t.recorded_at_ns)) > now || BigInt(input.observed_at_ns) > BigInt(time(t.recorded_at_ns))
        || input.status === "VALIDATION_PASSED" && p.status !== "SETTLED") return fail("OWNER_TASK_CHECK_BINDING_MISMATCH");
      hash(t.outcome_hash);
    }
    if (snapshot.human_acceptance !== null) {
      const a = object(snapshot.human_acceptance, ["capsule_id", "outcome_hash", "evidence_snapshot_hash", "decision", "accepted_by", "recorded_at_ns", "acceptance_hash"]);
      if (a.accepted_by !== target.operator_id || BigInt(time(a.recorded_at_ns)) > now) return fail("INVALID_OWNER_ACCEPTANCE_RECORD");
      hash(a.outcome_hash); hash(a.evidence_snapshot_hash); hash(a.acceptance_hash); enumValue(a.decision, ["ACCEPTED", "REJECTED"]);
    }
    switch (action.method) {
      case "set_capsule_paused":
        if (!["ACTIVE", "PAUSED"].includes(status)) return fail("CAPSULE_CANNOT_RESUME");
        expiry = BigInt(policy.expires_at_ns) < expiry ? BigInt(policy.expires_at_ns) : expiry;
        break;
      case "revoke_capsule":
        if (!["ACTIVE", "PAUSED", "REVOKED"].includes(status)) return fail("CAPSULE_TERMINAL");
        break;
      case "close_capsule":
        if (["CLOSING", "CLOSED"].includes(status)) return fail("CAPSULE_ALREADY_CLOSING_OR_CLOSED");
        if (status === "ACTIVE" && now < BigInt(policy.expires_at_ns)) return fail("CAPSULE_ACTIVE");
        if (capsule.reserved !== "0") return fail("PENDING_SETTLEMENT_BLOCKS_CLOSE");
        if (capsule.refund_attempts === 0xffff_ffff) return fail("REFUND_ATTEMPT_LIMIT");
        potentialOwnerReturn = financials!.available_to_commit;
        break;
      case "reject_purchase": case "cancel_purchase": {
        const p = purchases.find(p => p.proposal.request_id === action.args.request_id);
        if (!p || p.status !== "APPROVAL_PENDING") return fail("REQUEST_NOT_PENDING");
        break;
      }
      case "record_provisioning": {
        const a = action.args, p = purchases.find(p => p.proposal.request_id === a.request_id);
        if (!p || p.request_hash !== a.expected_request_hash) return fail("REQUEST_BINDING_MISMATCH");
        if (!["SETTLED", "SETTLEMENT_FAILED"].includes(p.status)) return fail("PAYMENT_UNRESOLVED");
        if (a.evidence.status === "PROVISIONED" && p.status !== "SETTLED") return fail("PROVISIONING_REQUIRES_SETTLED_PAYMENT_AND_ARTIFACT");
        if (BigInt(a.evidence.observed_at_ns) > now) return fail("FUTURE_EVIDENCE_TIMESTAMP");
        const h = list(snapshot.provisioning, 32).map(v => object(v)).find(h => h.request_id === a.request_id)!;
        const records = list(h.records, 2);
        if (records.length >= 2) return fail("PROVISIONING_HISTORY_LIMIT");
        if ((records.length ? object(records.at(-1)).record_hash : null) !== a.expected_previous_record_hash) return fail("EVIDENCE_REVISION_CONFLICT");
        break;
      }
      case "record_task_check": {
        const a = action.args, p = purchases.find(p => p.proposal.request_id === a.request_id);
        if (snapshot.task_check !== null || snapshot.outcome !== null) return fail("VALIDATION_ALREADY_RECORDED");
        if (!p || p.request_hash !== a.expected_request_hash || policyHash !== a.expected_policy_hash
          || a.report.project_id !== project.input.project_id || a.report.resource_key !== p.canonical_quote?.input.resource_key) return fail("TASK_CHECK_BINDING_MISMATCH");
        if (capsule.reserved !== "0" || status === "CLOSING") return fail("PENDING_SETTLEMENT_BLOCKS_VALIDATION");
        await assertResourceCriteria(a.report, policy.validation_spec_hash);
        if (BigInt(a.report.observed_at_ns) > now) return fail("FUTURE_EVIDENCE_TIMESTAMP");
        if (a.report.status === "VALIDATION_PASSED" && p.status !== "SETTLED") return fail("TASK_PASS_REQUIRES_SETTLED_PAYMENT");
        if (!await verifyResourceReport(JSON.stringify(a.report), artifactCopy)) return fail("EXACT_LOCAL_TASK_REPORT_MISMATCH");
        localArtifactVerified = true;
        break;
      }
      case "record_human_acceptance": {
        if (capsule.reserved !== "0" || status === "CLOSING") return fail("PAYMENT_UNRESOLVED");
        if (snapshot.human_acceptance !== null) return fail("HUMAN_ACCEPTANCE_ALREADY_RECORDED");
        // MVP review is resource-specific. Legacy research remains a regression, not silently reinterpreted.
        if (snapshot.task_check === null || snapshot.outcome !== null) return fail("RESOURCE_TASK_NOT_CHECKED");
        if (object(snapshot.task_check).outcome_hash !== action.args.expected_outcome_hash) return fail("ACCEPTANCE_OUTCOME_MISMATCH");
        if (hash(snapshot.evidence_snapshot_hash) !== action.args.expected_evidence_snapshot_hash) return fail("ACCEPTANCE_EVIDENCE_MISMATCH");
        break;
      }
    }
  }
  if (expiry <= now) return fail("OWNER_REVIEW_EXPIRED");
  const transport = enumValue(c.transport_source, ["INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE", "EXPLICIT_TESTNET_HTTP_READBACK"]);
  const call = Object.freeze({ network: "testnet" as const, signer_id: action.signer_id, public_key: action.public_key, receiver_id: target.contract_id,
    method: action.method, args: action.args, attached_deposit: "1", gas: action.gas });
  const stateHash = await digest({ target, signer_access: { nonce, permission: "FullAccess" }, project, provider, snapshot });
  const expires = time(expiry.toString()), reviewHash = await digest({ domain: "runlatch.exact-owner-review.v1", call, state_hash: stateHash, expires_at_ns: expires, transport_source: transport });
  const review = Object.freeze({ source: "UNSIGNED_EXACT_OWNER_REVIEW" as const, action, call, target, reviewed_block: block, reviewed_at_ns: block.timestamp_ns,
    expires_at_ns: expires, review_hash: reviewHash, state_hash: stateHash, transport_source: transport, financials: freezeJson(financials),
    reviewed_state: freezeJson({ project, provider, snapshot }), signer_access: Object.freeze({ public_key: action.public_key, nonce, permission: "FullAccess" as const }),
    projected_project_revision: projectedRevision, potential_owner_return: potentialOwnerReturn, local_fixture_artifact_verified: localArtifactVerified,
    settlement_verification: "UNVERIFIED_WITHOUT_TRANSACTION_TRANSFER_CALLBACK_READBACK" as const,
    signing_enabled: false as const, grants_payment_authority: false as const, independently_verified: false as const,
    limitation: "Unsigned human-content review only. Rust executes controls and bindings. Revocation cannot recall transfers or release commitments. Provisioning/check/acceptance are separate owner attestations; local fixture checks are not real-provider or client acceptance proof. Close may schedule a separate unused-fund return, never a quality refund." });
  issued.add(review); return review;
}
export type OwnerReview = Awaited<ReturnType<typeof prepareOwnerReview>>;
export function confirmFreshOwnerReview(original: OwnerReview, fresh: OwnerReview, confirmation: unknown) {
  if (!issued.has(original) || !issued.has(fresh)) return fail("UNISSUED_OWNER_REVIEW");
  const c = object(confirmation, ["review_hash", "consent"]);
  if (c.consent !== true || hash(c.review_hash) !== original.review_hash) return fail("EXACT_OWNER_CONFIRMATION_REQUIRED");
  if (canonical(original.call) !== canonical(fresh.call) || original.state_hash !== fresh.state_hash || original.transport_source !== fresh.transport_source) return fail("OWNER_REVIEW_CHANGED");
  if (BigInt(fresh.reviewed_at_ns) < BigInt(original.reviewed_at_ns) || BigInt(fresh.reviewed_at_ns) >= BigInt(original.expires_at_ns)
    || fresh.reviewed_block.height < original.reviewed_block.height) return fail("OWNER_REVIEW_STALE");
  return Object.freeze({ status: "LOCAL_EXACT_OWNER_CONTENT_CONFIRMED" as const, call: original.call, signing_enabled: false as const, grants_payment_authority: false as const });
}
