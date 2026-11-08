/** Fixed SYNTHETIC rehearsal. No process keys, default fetch, files or real owner actions. */
import { fixtureWorkflowRehearsal } from "../../tests/near/helpers/fixture-workflow.ts";

try {
  if (process.argv.length !== 2) throw new Error("NO_REHEARSAL_ARGUMENTS_ALLOWED");
  const r = await fixtureWorkflowRehearsal();
  const provision = await r.workflow.reviewProvisioning();
  if (provision.review.action.method !== "record_provisioning") throw new Error("TEST_ACTION_MISMATCH");
  r.recordProvisioning(provision.review.action.args.evidence); // Synthetic test mutation, not a signature.
  await r.workflow.reviewTaskCheck(); r.recordCheck(provision.fixture_check);
  await r.workflow.reviewAcceptance("ACCEPTED"); r.recordAcceptance("ACCEPTED"); // Fixed TEST choice, not human acceptance.
  const result = await r.workflow.readReceipt({ budget: true, expenses: true, evidence: true });
  console.log(JSON.stringify({ source: "SYNTHETIC_FIXTURE_WORKFLOW_REHEARSAL", public_testnet: false, contract_execution: false,
    real_owner_acceptance: false, all_transaction_receipt_hashes_are_test_placeholders: true, result }));
} catch {
  console.log(JSON.stringify({ source: "SYNTHETIC_FIXTURE_WORKFLOW_REHEARSAL_FAILURE", code: "REHEARSAL_FAILED", public_testnet: false }));
  process.exitCode = 1;
}
