/** Synthetic parser/browser fixtures ONLY. These references are not execution evidence. */
import { commercialQuoteHash, type CanonicalQuoteTerms } from "../../../src/lib/purchasing/hashing.ts";

export async function observationFixture(status = "SETTLED") {
  const terms: CanonicalQuoteTerms = { schema_version: 2, publisher_id: "publisher.sandbox", input: {
    quote_id: "database-quote", provider_id: "database-fixture", recipient_id: "publisher.sandbox", service_id: "database-plan", category: "database",
    resource_key: "booking-database", quantity: 1, price: "50", asset: "near-native", recurring: false,
    expires_at_ns: "1000", previous_quote_id: null, commercial_terms: null } };
  const quoteHash = await commercialQuoteHash(terms, "testnet", "contract.sandbox");
  const proposal = { project_id: "client-work", project_revision: "1", capsule_id: "work", request_id: "database",
    quote_id: terms.input.quote_id, expected_quote_hash: quoteHash };
  const resolved = ["SETTLED", "SETTLEMENT_FAILED"].includes(status), authorized = resolved || status === "SETTLEMENT_PENDING";
  const purchase = { proposal, request_hash: "03".repeat(32), policy_hash: "04".repeat(32), canonical_quote: terms,
    decision: authorized ? "APPROVED" : status === "APPROVAL_PENDING" ? "APPROVAL_REQUIRED" : "DENIED", checks: [{ rule: "QUOTE_HASH", state: "PASSED" }],
    reason_codes: [] as string[], status, reserved_amount: status === "SETTLEMENT_PENDING" ? "50" : "0", committed_future_amount: "0",
    resource_fingerprint: authorized ? "05".repeat(32) : null, created_at_ns: "10", approval_expires_at_ns: "900", approved_by: null,
    resolved_at_ns: resolved ? "20" : null, reconciliation_required: false };
  const quote = { terms, quote_hash: quoteHash, consumed: authorized, consumed_by: authorized ? "work:database" : null, published_at_ns: "1" };
  const snapshot = { project: { input: { project_id: "client-work", budget_ceiling: "300", expires_at_ns: "1000" }, revision: "1", status: "ACTIVE",
    allocated_authority: "300", capsule_ids: ["work"] }, capsule: { capsule_id: "work", owner_id: "operator.sandbox", status: "ACTIVE",
    policy: { project_id: "client-work", project_revision: "1", budget: "300", expires_at_ns: "1000" }, policy_hash: purchase.policy_hash,
    allocated: "300", spent: status === "SETTLED" ? "50" : "0", reserved: purchase.reserved_amount, committed_future: "0", returned: "0",
    request_ids: ["database"], owner_refund: null }, purchases: [purchase], provisioning: [{ request_id: "database", records: [] }],
    task_check: null, outcome: null, human_acceptance: null, evidence_snapshot_hash: "06".repeat(32) };
  const attempt = { transaction_id: "2".repeat(32), finality: "FINAL", proposal, response: { decision: purchase.decision, reason_codes: purchase.reason_codes,
    transfer_scheduled: false, source: "CONTRACT_EXECUTION_RECORD", request: purchase }, initial: { receipt_id: "3".repeat(32), succeeded: true },
    transfer: authorized ? { receipt_id: "4".repeat(32), succeeded: status !== "SETTLEMENT_FAILED", receiver: terms.input.recipient_id, amount: "50" } : null,
    callback: resolved ? { receipt_id: "5".repeat(32), succeeded: true } : null };
  return { schema_version: 1, source: "LOCAL_NEAR_SANDBOX_OBSERVATION", public_testnet: false, network_tag: "testnet", contract_id: "contract.sandbox",
    block_hash: "1".repeat(32), observed_at_ns: "30", project_id: "client-work", providers: [
      { provider_id: "database-fixture", publisher_id: terms.publisher_id, recipient_id: terms.input.recipient_id, active: true, quote_count: 1 },
      { provider_id: "hosting-fixture", publisher_id: terms.publisher_id, recipient_id: terms.input.recipient_id, active: true, quote_count: 0 }],
    quotes: [quote], snapshots: [snapshot], attempts: [attempt] };
}
