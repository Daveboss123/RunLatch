/** Fixed, offline resource-fixture checks. No HTTP, database or provider-signature proof. */
import { digestHex } from "../purchasing/hashing.ts";
import { parseBoundedJson } from "../near/records.ts";
export const RESOURCE_CRITERIA = "runlatch.resource-fixture.v1|manifest-project-resource-binding|provisioned-fixture-health-200-https|fixture-route-health-body-ok|no-network-no-provider-signature";
export const RESOURCE_CHECK_IDS = ["MANIFEST_BINDING", "FIXTURE_HEALTH", "FIXTURE_ROUTE"] as const;
export type ResourceCheckStatus = "VALIDATION_PASSED" | "VALIDATION_FAILED" | "VALIDATION_ERROR";
export interface ResourceCheckReport {
  readonly report_schema_version: 1; readonly criteria_id: "website-resource-fixture-v1"; readonly criteria_hash: string;
  readonly validator_id: "runlatch-resource-validator"; readonly validator_version: "1.0.0";
  readonly source: "LOCAL_FIXTURE_VALIDATOR"; readonly project_id: string; readonly resource_key: string;
  readonly artifact_hash: string | null; readonly artifact_bytes: number | null; readonly evidence_hash: string;
  readonly observed_at_ns: string; readonly status: ResourceCheckStatus;
  readonly checks: readonly { readonly check_id: typeof RESOURCE_CHECK_IDS[number]; readonly status: ResourceCheckStatus }[];
}
const text = new TextEncoder();
const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/u.test(v);
const time = (v: unknown): v is string => typeof v === "string" && /^(0|[1-9][0-9]{0,19})$/u.test(v) && BigInt(v) < (1n << 64n);
export const resourceCriteriaHash = () => digestHex(text.encode(RESOURCE_CRITERIA));

export async function validateResourceFixture(bytes: Uint8Array | null, binding: { project_id: string; resource_key: string }, observedAtNs: string): Promise<ResourceCheckReport> {
  if (!id(binding.project_id) || !id(binding.resource_key) || !time(observedAtNs)) throw new Error("INVALID_RESOURCE_CHECK_BINDING");
  const snapshot = bytes === null ? null : new Uint8Array(bytes);
  if (snapshot && snapshot.length > 16384) throw new Error("RESOURCE_ARTIFACT_SIZE_LIMIT");
  let value: unknown = null;
  try { if (snapshot) value = parseBoundedJson(new TextDecoder("utf-8", { fatal: true }).decode(snapshot), 16384); } catch { /* Invalid/duplicate/deep JSON becomes explicit failed checks, not execution. */ }
  const expected = ["fixture_version", "project_id", "resource_key", "fixture_provider_id", "provisioning_status", "health_status", "https_fixture", "route", "health_body", "observed_at_ns"];
  const manifest = value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const shape = manifest !== null && Object.keys(manifest).length === expected.length && Object.keys(manifest).every(key => expected.includes(key))
    && manifest.fixture_version === 1 && id(manifest.project_id) && id(manifest.resource_key) && id(manifest.fixture_provider_id)
    && (manifest.provisioning_status === "PROVISIONED" || manifest.provisioning_status === "FAILED")
    && (manifest.health_status === null || Number.isInteger(manifest.health_status) && Number(manifest.health_status) >= 100 && Number(manifest.health_status) <= 599)
    && typeof manifest.https_fixture === "boolean" && (manifest.route === null || typeof manifest.route === "string" && manifest.route.length <= 64)
    && (manifest.health_body === null || typeof manifest.health_body === "string" && manifest.health_body.length <= 128)
    && time(manifest.observed_at_ns) && BigInt(manifest.observed_at_ns) <= BigInt(observedAtNs);
  const statuses: ResourceCheckStatus[] = snapshot === null ? RESOURCE_CHECK_IDS.map(() => "VALIDATION_ERROR") : [
    shape && manifest!.project_id === binding.project_id && manifest!.resource_key === binding.resource_key ? "VALIDATION_PASSED" : "VALIDATION_FAILED",
    shape && manifest!.provisioning_status === "PROVISIONED" && manifest!.health_status === 200 && manifest!.https_fixture === true ? "VALIDATION_PASSED" : "VALIDATION_FAILED",
    shape && manifest!.route === "/health" && manifest!.health_body === "ok" ? "VALIDATION_PASSED" : "VALIDATION_FAILED",
  ];
  const status: ResourceCheckStatus = statuses.includes("VALIDATION_ERROR") ? "VALIDATION_ERROR" : statuses.includes("VALIDATION_FAILED") ? "VALIDATION_FAILED" : "VALIDATION_PASSED";
  const facts = { report_schema_version: 1 as const, criteria_id: "website-resource-fixture-v1" as const, criteria_hash: await resourceCriteriaHash(),
    validator_id: "runlatch-resource-validator" as const, validator_version: "1.0.0" as const, source: "LOCAL_FIXTURE_VALIDATOR" as const,
    project_id: binding.project_id, resource_key: binding.resource_key, artifact_hash: snapshot === null ? null : await digestHex(snapshot),
    artifact_bytes: snapshot?.length ?? null, observed_at_ns: observedAtNs, status,
    checks: Object.freeze(RESOURCE_CHECK_IDS.map((check_id, index) => Object.freeze({ check_id, status: statuses[index] }))) };
  return Object.freeze({ ...facts, evidence_hash: await digestHex(text.encode(JSON.stringify(facts))) });
}

/** Recomputes evidence from a supplied exact artifact, not an agent's status string. */
export async function verifyResourceReport(reportJson: string, artifact: Uint8Array | null): Promise<boolean> {
  if (typeof reportJson !== "string" || text.encode(reportJson).length > 8192) return false;
  try {
    const value: unknown = JSON.parse(reportJson);
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const report = value as Record<string, unknown>;
    if (!id(report.project_id) || !id(report.resource_key) || !time(report.observed_at_ns)) return false;
    const expected = await validateResourceFixture(artifact, { project_id: report.project_id, resource_key: report.resource_key }, report.observed_at_ns);
    return Object.keys(report).length === Object.keys(expected).length && Object.entries(expected).every(([key, value]) => JSON.stringify(report[key]) === JSON.stringify(value));
  } catch { return false; }
}
