/** One database fixture slice composed from existing readers/reviews. No signer, writer or Gate. */
import type { createTestnetReader } from "../../src/lib/near/testnet-rpc.ts";
import { parseTestnetTarget, namedTestnetAccount, type FinalBlock } from "../../src/lib/near/testnet-target.ts";
import { parsePurchaseObservationIntent, publicKey } from "../../src/lib/near/testnet-evidence.ts";
import { parseOwnerAction } from "../../src/lib/near/owner-review.ts";
import { parseProvisioningInput, parseTaskCheckInput } from "../../src/lib/near/outcome-input.ts";
import { canonicalReviewContent as canonical } from "../../src/lib/near/review-content.ts";
import { count, enumValue, fail, hash, list, object, parseBoundedJson, parsePurchase, reference, time } from "../../src/lib/near/records.ts";
import { calculateCommitment } from "../../src/lib/purchasing/commitment.ts";
import { validateResourceFixture, verifyResourceReport } from "../../src/lib/validation/resource.ts";

type Reader = Pick<ReturnType<typeof createTestnetReader>, "target" | "observePurchase" | "readOwnerReview" | "readProject">;
type Payment = Awaited<ReturnType<Reader["observePurchase"]>>;
interface Disclosure { readonly budget: boolean; readonly expenses: boolean; readonly evidence: boolean }

/** Caller supplies an explicit read-only reader. Its injected transport remains synthetic, even here. */
export function createFixtureWorkflow(input: unknown, reader: Reader) {
  const config = object(parseBoundedJson(canonical(input), 16384), ["target", "intent", "owner", "fixture_result"]);
  const target = parseTestnetTarget(config.target), intent = parsePurchaseObservationIntent(config.intent);
  const owner = object(config.owner, ["signer_id", "public_key", "gas"]);
  const human = Object.freeze({ signer_id: namedTestnetAccount(owner.signer_id), public_key: publicKey(owner.public_key), gas: time(owner.gas) });
  const mode = enumValue(config.fixture_result, ["PROVISIONED", "FAILED", "MISSING"]);
  if (canonical(target) !== canonical(reader.target) || human.signer_id !== target.operator_id || intent.method !== "submit_purchase"
    || intent.sender_id === target.operator_id || human.gas === "0" || BigInt(human.gas) > 300_000_000_000_000n) return fail("FIXTURE_WORKFLOW_SCOPE_MISMATCH");
  let fixture: { artifact: Uint8Array | null; report: Awaited<ReturnType<typeof validateResourceFixture>> } | undefined;
  let busy = false;
  const labels = Object.freeze({ source: "UNSIGNED_DATABASE_FIXTURE_WORKFLOW" as const, fixture_trust_class: "DEMO_FIXTURE" as const,
    signing_enabled: false as const, grants_payment_authority: false as const, independently_verified: false as const,
    limitation: "Read-only composition. Fixture health/HTTPS are local manifest checks, not a live database or endpoint. Owner reviews are unsigned; acceptance is never inferred. Rust and actual approved execution remain authoritative." });
  async function exclusive<T>(work: () => Promise<T>): Promise<T> {
    if (busy) return fail("FIXTURE_WORKFLOW_BUSY");
    busy = true;
    try { return await work(); } finally { busy = false; }
  }
  async function settled(signal?: AbortSignal) {
    const payment = await reader.observePurchase(intent, signal);
    if (canonical(payment.target) !== canonical(target) || payment.transaction_hash !== intent.transaction_hash
      || canonical(payment.proposal) !== canonical(intent.proposal)) return fail("FIXTURE_PAYMENT_IDENTITY_MISMATCH");
    if (payment.submission !== "FINAL" || payment.payment_evidence !== "SETTLED" || payment.transfer_succeeded !== true
      || payment.callback_succeeded !== true || !payment.initial_receipt_id || !payment.transfer_receipt_id || !payment.callback_receipt_id
      || !payment.final_record || !("block" in payment)) return fail("FIXTURE_PAYMENT_NOT_SETTLED");
    const p = parsePurchase(payment.final_record), q = p.canonical_quote?.input;
    if (canonical(p.proposal) !== canonical(intent.proposal) || p.status !== "SETTLED" || p.reconciliation_required || p.reserved_amount !== "0"
      || !p.resolved_at_ns || !q || q.provider_id !== "database-fixture" || q.service_id !== "database-plan" || q.category !== "database"
      || q.resource_key !== "booking-database" || q.quantity !== 1 || q.recurring || q.commercial_terms !== null) return fail("FIXTURE_CANONICAL_DATABASE_REQUIRED");
    return payment;
  }
  function observedBlock(payment: Payment): FinalBlock {
    if (!("block" in payment)) return fail("FIXTURE_PAYMENT_NOT_SETTLED");
    const b = object(payment.block, ["hash", "height", "timestamp_ns"]);
    return Object.freeze({ hash: reference(b.hash), height: count(b.height, Number.MAX_SAFE_INTEGER), timestamp_ns: time(b.timestamp_ns) });
  }
  function bindSnapshot(snapshot: unknown, block: FinalBlock, transport: string, payment: Payment) {
    const prior = observedBlock(payment);
    if (transport !== payment.transport_source || block.height < prior.height
      || BigInt(block.timestamp_ns) < BigInt(prior.timestamp_ns)
      || block.height === prior.height && block.hash !== prior.hash) return fail("FIXTURE_STALE_OR_MIXED_READBACK");
    const s = object(snapshot), c = object(s.capsule);
    const p = list(s.purchases, 32).map(parsePurchase).find(p => p.proposal.request_id === intent.proposal.request_id);
    if (!p || c.capsule_id !== intent.proposal.capsule_id || c.policy_hash !== p.policy_hash
      || canonical(p) !== canonical(payment.final_record)) return fail("FIXTURE_SNAPSHOT_PURCHASE_MISMATCH");
    return s;
  }
  function history(s: Record<string, unknown>) {
    const h = list(s.provisioning, 32).map(v => object(v)).filter(v => v.request_id === intent.proposal.request_id);
    if (h.length !== 1) return fail("FIXTURE_PROVISIONING_SCOPE_MISMATCH");
    return list(h[0].records, 2).map(v => object(v));
  }
  function evidence() {
    if (!fixture) return fail("FIXTURE_NOT_PREPARED");
    return parseProvisioningInput({ status: mode === "MISSING" ? "UNKNOWN" : mode, trust_class: "DEMO_FIXTURE", source_id: "database-fixture",
      observed_at_ns: fixture.report.observed_at_ns, artifact_hash: fixture.report.artifact_hash, evidence_hash: fixture.report.evidence_hash });
  }
  function assertRecordedFixture(s: Record<string, unknown>, current = true) {
    const records = history(s), candidates = current ? records.slice(-1) : records;
    const matched = candidates.find(r => canonical(parseProvisioningInput(r.input)) === canonical(evidence()));
    if (!matched) return fail("FIXTURE_PROVISIONING_NOT_RECORDED");
    return matched;
  }
  async function assertRecordedCheck(s: Record<string, unknown>) {
    if (!fixture || s.task_check === null) return fail("FIXTURE_TASK_CHECK_NOT_RECORDED");
    const t = object(s.task_check), report = parseTaskCheckInput(t.report);
    if (t.capsule_id !== intent.proposal.capsule_id || t.request_id !== intent.proposal.request_id
      || canonical(report) !== canonical(fixture.report) || !await verifyResourceReport(JSON.stringify(report), fixture.artifact)) return fail("FIXTURE_RECORDED_CHECK_MISMATCH");
    return t;
  }
  const args = { capsule_id: intent.proposal.capsule_id, request_id: intent.proposal.request_id };
  return Object.freeze({ ...labels, target, intent,
    reviewProvisioning: (signal?: AbortSignal) => exclusive(async () => {
      const payment = await settled(signal);
      // Only after the existing observer reports a successful transfer AND private callback.
      // No URL, provider code or caller status string is executed. Repeated reviews reuse exact bytes.
      if (!fixture) {
        const observed = observedBlock(payment).timestamp_ns;
        const artifact = mode === "MISSING" ? null : new TextEncoder().encode(JSON.stringify({ fixture_version: 1,
          project_id: intent.proposal.project_id, resource_key: "booking-database", fixture_provider_id: "database-fixture", provisioning_status: mode,
          health_status: mode === "PROVISIONED" ? 200 : null, https_fixture: mode === "PROVISIONED", route: "/health",
          health_body: mode === "PROVISIONED" ? "ok" : null, observed_at_ns: observed }));
        fixture = { artifact, report: await validateResourceFixture(artifact, { project_id: intent.proposal.project_id, resource_key: "booking-database" }, observed) };
      }
      const action = parseOwnerAction({ ...human, method: "record_provisioning", args: { ...args,
        expected_request_hash: payment.final_record!.request_hash, expected_previous_record_hash: null, evidence: evidence() } });
      const review = await reader.readOwnerReview(action, undefined, signal);
      const s = bindSnapshot(review.reviewed_state.snapshot, review.reviewed_block, review.transport_source, payment);
      if (history(s).length !== 0) return fail("FIXTURE_PROVISIONING_ALREADY_RECORDED");
      return Object.freeze({ ...labels, payment, review, fixture_check: fixture.report, fixture_invocations: mode === "MISSING" ? 0 : 1 });
    }),
    reviewTaskCheck: (signal?: AbortSignal) => exclusive(async () => {
      if (!fixture) return fail("FIXTURE_NOT_PREPARED");
      const payment = await settled(signal);
      const action = parseOwnerAction({ ...human, method: "record_task_check", args: { ...args, expected_request_hash: payment.final_record!.request_hash,
        expected_policy_hash: payment.final_record!.policy_hash, report: fixture.report } });
      const review = await reader.readOwnerReview(action, { artifact: fixture.artifact }, signal);
      const s = bindSnapshot(review.reviewed_state.snapshot, review.reviewed_block, review.transport_source, payment);
      assertRecordedFixture(s);
      return Object.freeze({ ...labels, payment, review });
    }),
    reviewAcceptance: (decision: unknown, signal?: AbortSignal) => {
      const choice = enumValue(decision, ["ACCEPTED", "REJECTED"]);
      return exclusive(async () => {
        if (!fixture) return fail("FIXTURE_NOT_PREPARED");
        const payment = await settled(signal);
        // Read current report only to obtain contract-issued outcome/evidence hashes; no invented hashes.
        const selected = await reader.readProject({ project_id: intent.proposal.project_id, capsule_ids: [intent.proposal.capsule_id], provider_ids: [], quote_ids: [],
          disclosure: { project_id: intent.proposal.project_id, budget: false, expenses: false, evidence: false } }, signal);
        const s = bindSnapshot(selected.snapshots[0], selected.block, selected.transport_source, payment);
        assertRecordedFixture(s); const t = await assertRecordedCheck(s);
        const action = parseOwnerAction({ ...human, method: "record_human_acceptance", args: { capsule_id: args.capsule_id,
          expected_outcome_hash: hash(t.outcome_hash), expected_evidence_snapshot_hash: hash(s.evidence_snapshot_hash), decision: choice } });
        const review = await reader.readOwnerReview(action, undefined, signal);
        const fresh = bindSnapshot(review.reviewed_state.snapshot, review.reviewed_block, review.transport_source, payment);
        assertRecordedFixture(fresh); await assertRecordedCheck(fresh);
        return Object.freeze({ ...labels, payment, review });
      });
    },
    readReceipt: (inputDisclosure: unknown, signal?: AbortSignal) => {
      const d = object(inputDisclosure, ["budget", "expenses", "evidence"]);
      if ([d.budget, d.expenses, d.evidence].some(v => typeof v !== "boolean")) return fail("EXPLICIT_DISCLOSURE_REQUIRED");
      const disclosure: Disclosure = { budget: d.budget as boolean, expenses: d.expenses as boolean, evidence: d.evidence as boolean };
      return exclusive(async () => {
        const payment = await settled(signal);
        const selected = await reader.readProject({ project_id: intent.proposal.project_id, capsule_ids: [args.capsule_id], provider_ids: [], quote_ids: [],
          disclosure: { project_id: intent.proposal.project_id, ...disclosure } }, signal);
        const s = bindSnapshot(selected.snapshots[0], selected.block, selected.transport_source, payment);
        const p = payment.final_record!, q = p.canonical_quote!.input;
        const records = history(s).map(value => {
          const r = object(value, ["input", "recorded_by", "recorded_at_ns", "record_hash", "source"]), input = parseProvisioningInput(r.input);
          if (r.recorded_by !== target.operator_id || r.source !== "OWNER_RECORDED_OFFCHAIN_EVIDENCE_NOT_PROVIDER_SIGNATURE"
            || BigInt(time(r.recorded_at_ns)) > BigInt(selected.block.timestamp_ns) || BigInt(time(r.recorded_at_ns)) < BigInt(p.resolved_at_ns!)
            || BigInt(input.observed_at_ns) > BigInt(time(r.recorded_at_ns))) return fail("FIXTURE_STORED_PROVISIONING_MISMATCH");
          return Object.freeze({ input, record_hash: hash(r.record_hash), recorded_at_ns: time(r.recorded_at_ns), source: r.source });
        });
        const provision = records.at(-1) ?? null;
        let checked = null;
        if (s.task_check !== null) {
          assertRecordedFixture(s, false); const t = await assertRecordedCheck(s);
          if (t.request_hash !== p.request_hash || t.policy_hash !== p.policy_hash || t.attested_by !== target.operator_id
            || t.source !== "OWNER_ATTESTED_LOCAL_FIXTURE_CHECK_NOT_EXTERNAL_TRUTH" || BigInt(time(t.recorded_at_ns)) > BigInt(selected.block.timestamp_ns)
            || BigInt(fixture!.report.observed_at_ns) > BigInt(time(t.recorded_at_ns))) return fail("FIXTURE_STORED_TASK_MISMATCH");
          checked = Object.freeze({ report: fixture!.report, outcome_hash: hash(t.outcome_hash), artifact_verified_locally: true,
            recorded_at_ns: time(t.recorded_at_ns), trust: "OWNER_ATTESTED_LOCAL_FIXTURE_CHECK_NOT_EXTERNAL_TRUTH" });
        }
        const a = s.human_acceptance === null ? null : object(s.human_acceptance,
          ["capsule_id", "outcome_hash", "evidence_snapshot_hash", "decision", "accepted_by", "recorded_at_ns", "acceptance_hash"]);
        if (a && (!checked || a.capsule_id !== args.capsule_id || a.outcome_hash !== checked.outcome_hash || a.accepted_by !== target.operator_id
          || BigInt(time(a.recorded_at_ns)) > BigInt(selected.block.timestamp_ns)
          || BigInt(time(a.recorded_at_ns)) < BigInt(checked.recorded_at_ns))) return fail("FIXTURE_ACCEPTANCE_BINDING_MISMATCH");
        if (a) hash(a.acceptance_hash);
        const acceptance = a ? Object.freeze({ decision: enumValue(a.decision, ["ACCEPTED", "REJECTED"]),
          current: hash(a.evidence_snapshot_hash) === hash(s.evidence_snapshot_hash), recorded_at_ns: time(a.recorded_at_ns),
          scope: "CAPSULE_OUTCOME_OWNER_ACTION_NOT_CLIENT_ACCEPTANCE" }) : null;
        const receipt = disclosure.expenses ? Object.freeze({ project_id: intent.proposal.project_id, project_revision: intent.proposal.project_revision,
          capsule_id: args.capsule_id, request_id: args.request_id, policy_hash: p.policy_hash, request_hash: p.request_hash, quote_hash: intent.proposal.expected_quote_hash,
          quote_id: intent.proposal.quote_id, policy_version: 2, provider_id: q.provider_id, amount_due_now: q.price, asset: "near-native",
          commitment: calculateCommitment(q), authorization: p.decision, gate_checks: p.checks, reason_codes: p.reason_codes,
          settlement: payment.payment_evidence, transaction_hash: intent.transaction_hash, transfer_receipt_id: payment.transfer_receipt_id,
          callback_receipt_id: payment.callback_receipt_id, created_at_ns: p.created_at_ns, resolved_at_ns: p.resolved_at_ns,
          evidence: disclosure.evidence ? Object.freeze({ provisioning: provision, check: checked, human_acceptance: acceptance }) : null }) : null;
        return Object.freeze({ ...labels, transport_source: payment.transport_source, observed_block: selected.block, receipt, report: selected.report });
      });
    },
  });
}
