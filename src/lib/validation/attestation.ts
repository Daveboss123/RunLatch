/** Bounded owner-review payload preparation only; no signer, RPC or authority. */
import { verifyValidationReport, type ValidationReport, type ValidationMetrics, type ValidationStatus } from "./research.ts";

export const MAX_ATTESTATION_REPORT_BYTES = 262_144;
export interface ValidationAttestationInput {
  readonly report_schema_version: 1;
  readonly criteria_id: "research-output-v1";
  readonly criteria_hash: string;
  readonly validator_id: "runlatch-research-validator";
  readonly validator_version: "1.0.0";
  readonly artifact_hash: string | null;
  readonly artifact_bytes: number | null;
  readonly evidence_hash: string;
  readonly status: ValidationStatus;
  readonly reason_codes: readonly string[];
  readonly issue_count: number;
  readonly issues_truncated: boolean;
  readonly metrics: ValidationMetrics;
}
export interface PreparedAttestation {
  readonly capsule_id: string;
  readonly expected_policy_hash: string;
  readonly report: ValidationAttestationInput;
  readonly source: "LOCAL_ATTESTATION_PREPARATION";
  readonly attestation: "UNATTESTED";
  readonly requires_owner_signature: true;
  readonly grants_payment_authority: false;
}

export class AttestationPreparationError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = "AttestationPreparationError"; this.code = code; }
}
const fail = (code: string): never => { throw new AttestationPreparationError(code); };
const hash = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
const count = (value: number | null): boolean => value === null || Number.isSafeInteger(value) && value >= 0 && value <= 4_294_967_295;

/**
 * Serialized JSON ensures private, plain parsed data while async hashes run:
 * no supplied getters, model objects or mutable report references are executed.
 * Signing/submission is separate and must bind this capsule and policy hash.
 */
export async function prepareValidationAttestation(
  reportJson: string, capsuleId: string, expectedPolicyHash: string, validationSpecHash: string,
): Promise<PreparedAttestation> {
  if (typeof capsuleId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/u.test(capsuleId)) fail("INVALID_CAPSULE_ID");
  if (!hash(expectedPolicyHash) || !hash(validationSpecHash)) fail("INVALID_ATTESTATION_BINDING");
  if (typeof reportJson !== "string" || reportJson.length > MAX_ATTESTATION_REPORT_BYTES
    || new TextEncoder().encode(reportJson).byteLength > MAX_ATTESTATION_REPORT_BYTES) fail("REPORT_SIZE_LIMIT");
  let value: unknown;
  try { value = JSON.parse(reportJson); } catch { return fail("INVALID_REPORT_JSON"); }
  if (!await verifyValidationReport(value)) fail("INVALID_REPORT_INTEGRITY");
  // The verifier established the exact shape; this private parsed value cannot
  // be mutated by the caller between verification and payload construction.
  const report = value as ValidationReport;
  if (report.criteria_hash !== validationSpecHash) fail("REPORT_CRITERIA_MISMATCH");
  if (!count(report.artifact_bytes) || !count(report.metrics.record_count)
    || report.issue_count > 1024 || report.metrics.records_checked > (report.metrics.record_count ?? 0)) fail("SUMMARY_COUNT_LIMIT");
  const reasons = [...new Set(report.issues.map(issue => issue.code))].sort();
  if (reasons.length > 32 || reasons.some(code => !/^[A-Z][A-Z0-9_]{0,63}$/u.test(code))) fail("REASON_CODE_LIMIT");
  const summary: ValidationAttestationInput = Object.freeze({
    report_schema_version: 1, criteria_id: report.criteria_id, criteria_hash: report.criteria_hash,
    validator_id: report.validator_id, validator_version: report.validator_version,
    artifact_hash: report.artifact_hash, artifact_bytes: report.artifact_bytes, evidence_hash: report.evidence_hash,
    status: report.status, reason_codes: Object.freeze(reasons), issue_count: report.issue_count,
    issues_truncated: report.issues_truncated, metrics: Object.freeze({ ...report.metrics }),
  });
  return Object.freeze({ capsule_id: capsuleId, expected_policy_hash: expectedPolicyHash, report: summary,
    source: "LOCAL_ATTESTATION_PREPARATION", attestation: "UNATTESTED", requires_owner_signature: true,
    grants_payment_authority: false });
}
