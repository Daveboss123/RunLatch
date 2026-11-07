/** Browser-only illustrative records. Invented references, not Sandbox or testnet evidence. */
import { commercialQuoteHash, type CanonicalQuoteTerms } from "../purchasing/hashing.ts";
import { validateResourceFixture } from "../validation/resource.ts";
import { importOutcomeObservation, type OutcomeObservation } from "./receipts.ts";

export async function illustrativeOutcomes(): Promise<readonly OutcomeObservation[]> {
  const bundles: OutcomeObservation[] = [];
  for (const [index, scenario] of ["passed", "paid-failure", "payment-failure"].entries()) {
    const project = `illustrative-${scenario}`, capsule = `sample-${index}`, failedPayment = index === 2;
    const ns = (n: number) => (1794090000000000000n + BigInt(index * 100 + n)).toString();
    const ref = (n: number) => "23456789ABCDEFGHJKLMNPQ"[index * 5 + n].repeat(32);
    const terms: CanonicalQuoteTerms = { schema_version: 2, publisher_id: "fixture.sandbox", input: {
      quote_id: `database-${index}`, provider_id: "database-fixture", recipient_id: "fixture.sandbox", service_id: "database-plan", category: "database",
      resource_key: "booking-database", quantity: 1, price: "50", asset: "near-native", recurring: false, expires_at_ns: ns(99), previous_quote_id: null, commercial_terms: null } };
    const quoteHash = await commercialQuoteHash(terms, "testnet", "illustrative.sandbox");
    const proposal = { project_id: project, project_revision: "1", capsule_id: capsule, request_id: "database", quote_id: terms.input.quote_id, expected_quote_hash: quoteHash };
    const purchase = { proposal, request_hash: "03".repeat(32), policy_hash: "04".repeat(32), canonical_quote: terms, decision: "APPROVED",
      checks: [{ rule: "QUOTE_HASH", state: "PASSED" }], reason_codes: [], status: failedPayment ? "SETTLEMENT_FAILED" : "SETTLED",
      reserved_amount: "0", committed_future_amount: "0", resource_fingerprint: "05".repeat(32), created_at_ns: ns(10), approval_expires_at_ns: ns(90),
      approved_by: null, resolved_at_ns: ns(20), reconciliation_required: false };
    const artifact = { fixture_version: 1, project_id: project, resource_key: "booking-database", fixture_provider_id: "database-fixture",
      provisioning_status: index === 0 ? "PROVISIONED" : "FAILED", health_status: index === 0 ? 200 : 503, https_fixture: true,
      route: "/health", health_body: index === 0 ? "ok" : "unavailable", observed_at_ns: ns(21) };
    const report = await validateResourceFixture(failedPayment ? null : new TextEncoder().encode(JSON.stringify(artifact)), { project_id: project, resource_key: "booking-database" }, ns(22));
    const attempt = { transaction_id: ref(1), finality: "FINAL", proposal, response: { decision: "APPROVED", reason_codes: [], transfer_scheduled: false, source: "CONTRACT_EXECUTION_RECORD", request: purchase },
      initial: { receipt_id: ref(2), succeeded: true }, transfer: { receipt_id: ref(3), succeeded: !failedPayment, receiver: "fixture.sandbox", amount: "50" }, callback: { receipt_id: ref(4), succeeded: true } };
    const b = await importOutcomeObservation(JSON.stringify({ schema_version: 1, source: "LOCAL_NEAR_SANDBOX_OBSERVATION", public_testnet: false, network_tag: "testnet",
      contract_id: "illustrative.sandbox", block_hash: "1".repeat(32), observed_at_ns: ns(30), project_id: project,
      providers: [{ provider_id: "database-fixture", publisher_id: "fixture.sandbox", recipient_id: "fixture.sandbox", active: true, quote_count: 1 },
        { provider_id: "hosting-fixture", publisher_id: "fixture.sandbox", recipient_id: "fixture.sandbox", active: true, quote_count: 0 }],
      quotes: [{ terms, quote_hash: quoteHash, consumed: true, consumed_by: `${capsule}:database`, published_at_ns: ns(1) }],
      snapshots: [{ project: { input: { project_id: project, budget_ceiling: "300", expires_at_ns: ns(99) }, revision: "1", status: "ACTIVE", allocated_authority: "300", capsule_ids: [capsule] },
        capsule: { capsule_id: capsule, owner_id: "operator.sandbox", status: "COMPLETED", created_at_ns: ns(2), policy_schema_version: 2,
          policy: { project_id: project, project_revision: "1", budget: "300", expires_at_ns: ns(99), workflow_id: "website-resource-fixture-v1", validation_spec_hash: report.criteria_hash }, policy_hash: purchase.policy_hash,
          allocated: "300", spent: failedPayment ? "0" : "50", reserved: "0", committed_future: "0", returned: "0", storage_credit: "1000", request_ids: ["database"], owner_refund: null },
        purchases: [purchase], provisioning: [{ request_id: "database", records: [] }], outcome: null,
        task_check: { capsule_id: capsule, request_id: "database", request_hash: purchase.request_hash, policy_hash: purchase.policy_hash, report,
          attested_by: "operator.sandbox", recorded_at_ns: ns(23), outcome_hash: "07".repeat(32), source: "OWNER_ATTESTED_LOCAL_FIXTURE_CHECK_NOT_EXTERNAL_TRUTH" },
        human_acceptance: null, evidence_snapshot_hash: "06".repeat(32) }], attempts: [attempt] }));
    bundles.push(Object.freeze({ ...b, runs: Object.freeze(b.runs.map(r => Object.freeze({ ...r, cost_fact: r.cost_fact ? { ...r.cost_fact, source: "SIMULATED" as const } : null }))) }));
  }
  return Object.freeze(bundles);
}
