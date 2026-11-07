/** Deliberately synthetic, test-only data. Never execution evidence or a saved real metric. */
import { observationFixture } from "./observation.ts";
import { validateResourceFixture } from "../../../src/lib/validation/resource.ts";
export async function outcomeFixture(payment = "SETTLED", validation: "VALIDATION_PASSED" | "VALIDATION_FAILED" | "VALIDATION_ERROR" | null = "VALIDATION_PASSED") {
  const b = await observationFixture(payment), s = b.snapshots[0];
  const manifest = { fixture_version: 1, project_id: b.project_id, resource_key: "booking-database", fixture_provider_id: "database-fixture",
    provisioning_status: validation === "VALIDATION_FAILED" ? "FAILED" : "PROVISIONED", health_status: 200, https_fixture: true,
    route: "/health", health_body: "ok", observed_at_ns: "21" };
  const report = await validateResourceFixture(validation === "VALIDATION_ERROR" ? null : new TextEncoder().encode(JSON.stringify(manifest)),
    { project_id: b.project_id, resource_key: "booking-database" }, "22");
  return { ...b, snapshots: [{ ...s, capsule: { ...s.capsule, status: validation ? "COMPLETED" : "ACTIVE", created_at_ns: "2", policy_schema_version: 2,
    storage_credit: "1000", policy: { ...s.capsule.policy, workflow_id: "website-resource-fixture-v1", task_id: "booking-website", validation_spec_hash: report.criteria_hash } },
    task_check: validation ? { capsule_id: "work", request_id: "database", request_hash: s.purchases[0].request_hash, policy_hash: s.capsule.policy_hash,
      report, attested_by: "operator.sandbox", recorded_at_ns: "23", outcome_hash: "07".repeat(32), source: "OWNER_ATTESTED_LOCAL_FIXTURE_CHECK_NOT_EXTERNAL_TRUTH" } : null,
    human_acceptance: null as null | { capsule_id: string; outcome_hash: string; evidence_snapshot_hash: string; decision: string; accepted_by: string; recorded_at_ns: string; acceptance_hash: string } }] };
}
