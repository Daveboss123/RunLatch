/** Strict owner-attestation inputs matching schema2 Rust. Hashes are not external truth. */
import { count, enumValue, fail, hash, id, list, object, time } from "./records.ts";
import { RESOURCE_CHECK_IDS, resourceCriteriaHash, type ResourceCheckReport } from "../validation/resource.ts";

export const validationStatus = (value: unknown) => enumValue(value, ["VALIDATION_PASSED", "VALIDATION_FAILED", "VALIDATION_ERROR"]);
export function parseProvisioningInput(value: unknown) {
  const p = object(value, ["status", "trust_class", "source_id", "observed_at_ns", "artifact_hash", "evidence_hash"]);
  const status = enumValue(p.status, ["PROVISIONED", "FAILED", "UNKNOWN"]), artifact = p.artifact_hash === null ? null : hash(p.artifact_hash);
  if (status === "PROVISIONED" && artifact === null) return fail("PROVISIONING_ARTIFACT_REQUIRED");
  return Object.freeze({ status, trust_class: enumValue(p.trust_class, ["DEMO_FIXTURE", "APPLICATION_OBSERVATION"]), source_id: id(p.source_id),
    observed_at_ns: time(p.observed_at_ns), artifact_hash: artifact, evidence_hash: hash(p.evidence_hash) });
}
export function parseTaskCheckInput(value: unknown): ResourceCheckReport {
  const p = object(value, ["report_schema_version", "criteria_id", "criteria_hash", "validator_id", "validator_version", "source", "project_id", "resource_key",
    "artifact_hash", "artifact_bytes", "evidence_hash", "observed_at_ns", "status", "checks"]);
  if (p.report_schema_version !== 1 || p.criteria_id !== "website-resource-fixture-v1" || p.validator_id !== "runlatch-resource-validator"
    || p.validator_version !== "1.0.0" || p.source !== "LOCAL_FIXTURE_VALIDATOR") return fail("UNSUPPORTED_TASK_CHECK_METHOD");
  const checks = Object.freeze(list(p.checks, 3).map((value, index) => {
    const c = object(value, ["check_id", "status"]);
    if (c.check_id !== RESOURCE_CHECK_IDS[index]) return fail("INVALID_OBJECTIVE_CHECKS");
    return Object.freeze({ check_id: RESOURCE_CHECK_IDS[index], status: validationStatus(c.status) });
  }));
  const status = validationStatus(p.status), artifact = p.artifact_hash === null ? null : hash(p.artifact_hash);
  const bytes = p.artifact_bytes === null ? null : count(p.artifact_bytes, 16384);
  const derived = checks.some(c => c.status === "VALIDATION_ERROR") ? "VALIDATION_ERROR"
    : checks.some(c => c.status === "VALIDATION_FAILED") ? "VALIDATION_FAILED" : "VALIDATION_PASSED";
  if (checks.length !== 3 || status !== derived) return fail("INCONSISTENT_TASK_CHECK_RESULT");
  if (status === "VALIDATION_ERROR" ? artifact !== null || bytes !== null
    : artifact === null || bytes === null || bytes === 0 && status !== "VALIDATION_FAILED") return fail("INCONSISTENT_TASK_ARTIFACT");
  return Object.freeze({ report_schema_version: 1, criteria_id: "website-resource-fixture-v1", criteria_hash: hash(p.criteria_hash),
    validator_id: "runlatch-resource-validator", validator_version: "1.0.0", source: "LOCAL_FIXTURE_VALIDATOR", project_id: id(p.project_id), resource_key: id(p.resource_key),
    artifact_hash: artifact, artifact_bytes: bytes, evidence_hash: hash(p.evidence_hash), observed_at_ns: time(p.observed_at_ns), status, checks });
}
export async function assertResourceCriteria(report: ResourceCheckReport, policyHash: unknown) {
  if (report.criteria_hash !== await resourceCriteriaHash() || report.criteria_hash !== hash(policyHash)) return fail("VALIDATION_SPEC_MISMATCH");
}
