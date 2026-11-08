/** Synthetic-only state adapter. Mutations below are test fixtures, never contract/wallet actions. */
import { createFixtureWorkflow } from "../../../scripts/near/fixture-workflow.ts";
import { createTestnetReader } from "../../../src/lib/near/testnet-rpc.ts";
import { object } from "../../../src/lib/near/records.ts";
import { ownerFixture, ownerTransport } from "../../frontend/helpers/owner-review.ts";
import { target } from "../../frontend/helpers/testnet-evidence.ts";

export async function fixtureWorkflowRehearsal(mode = "PROVISIONED", state = "SETTLED") {
  const d = await ownerFixture(state);
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
