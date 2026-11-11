/** Synthetic-only state adapter. Mutations below are test fixtures, never contract/wallet actions. */
import { createFixtureWorkflow } from "../../../scripts/near/fixture-workflow.ts";
import { createTestnetReader } from "../../../src/lib/near/testnet-rpc.ts";
import { object } from "../../../src/lib/near/records.ts";
import { ownerFixture, ownerTransport } from "../../frontend/helpers/owner-review.ts";
import { target, encode, functionCall } from "../../frontend/helpers/testnet-evidence.ts";
import { commercialQuoteHash } from "../../../src/lib/purchasing/hashing.ts";
import { parsePurchase } from "../../../src/lib/near/records.ts";
import { parsePurchaseObservationIntent } from "../../../src/lib/near/testnet-evidence.ts";

export async function fixtureWorkflowRehearsal(mode = "PROVISIONED", state = "SETTLED", providerId = "database-fixture") {
  const d = await ownerFixture(state);
  if (providerId !== "database-fixture") {
    const terms = { ...d.f.quote.terms, input: { ...d.f.quote.terms.input, provider_id: providerId } };
    const quoteHash = await commercialQuoteHash(terms, "testnet", target.contract_id);
    const p = parsePurchase({ ...d.snapshot.purchases[0], canonical_quote: terms, proposal: { ...d.snapshot.purchases[0].proposal, expected_quote_hash: quoteHash } });
    d.snapshot.purchases = [p]; d.f.quote = { ...d.f.quote, terms, quote_hash: quoteHash }; d.f.provider = { ...d.f.provider, provider_id: providerId };
    d.f.intent = parsePurchaseObservationIntent({ ...d.f.intent, proposal: p.proposal });
    const action = functionCall("submit_purchase", { proposal: p.proposal }); d.f.raw.transaction.actions = [action];
    d.f.raw.receipts[0].receipt.Action.actions = [action];
    const reply = { decision: p.decision, reason_codes: p.reason_codes, transfer_scheduled: false, source: "CONTRACT_EXECUTION_RECORD", request: p };
    d.f.raw.status = { SuccessValue: encode(reply) }; d.f.raw.receipts_outcome[2].outcome.status = { SuccessValue: encode(reply) };
  }
  const snapshot = JSON.parse(JSON.stringify(d.snapshot)) as Record<string, unknown>;
  const transport = ownerTransport(d, (p, result) => p.method_name === "get_capsule_report_snapshot"
    ? { ...object(result), result: [...Buffer.from(JSON.stringify(snapshot))] } : result);
  const reader = createTestnetReader(target, transport.transport);
  const config = { target, intent: d.f.intent, owner: { signer_id: target.operator_id, public_key: d.actions.check.public_key, gas: "100000000000000" }, fixture_result: mode };
  const workflow = createFixtureWorkflow(config, reader);
  function recordProvisioning(evidence: unknown) {
    snapshot.provisioning = [{ request_id: "database", records: [{ input: evidence, recorded_by: target.operator_id, recorded_at_ns: "30",
      record_hash: "aa".repeat(32), source: "OWNER_RECORDED_OFFCHAIN_EVIDENCE_NOT_PROVIDER_SIGNATURE" }] }];
  }
  function recordCheck(report: unknown) {
    const p = d.snapshot.purchases[0];
    snapshot.task_check = { capsule_id: "work", request_id: "database", request_hash: p.request_hash, policy_hash: p.policy_hash, report,
      attested_by: target.operator_id, recorded_at_ns: "30", outcome_hash: "07".repeat(32), source: "OWNER_ATTESTED_LOCAL_FIXTURE_CHECK_NOT_EXTERNAL_TRUTH" };
    object(snapshot.capsule).status = "COMPLETED";
  }
  function recordAcceptance(decision: string) {
    snapshot.human_acceptance = { capsule_id: "work", outcome_hash: "07".repeat(32), evidence_snapshot_hash: snapshot.evidence_snapshot_hash,
      decision, accepted_by: target.operator_id, recorded_at_ns: "30", acceptance_hash: "bb".repeat(32) };
  }
  return { d, snapshot, transport, config, reader, workflow, recordProvisioning, recordCheck, recordAcceptance };
}
