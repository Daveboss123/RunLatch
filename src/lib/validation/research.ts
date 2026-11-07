/**
 * Offline, dependency-free research-output checks shared by a future CLI/UI.
 * No fetch, model judgement, payment authorization, or on-chain attestation.
 */

export const VALIDATOR_ID = "runlatch-research-validator";
export const VALIDATOR_VERSION = "1.0.0";
export const MAX_ARTIFACT_BYTES = 1_048_576;
const MAX_ISSUES = 64;

const ROOT_FIELDS = Object.freeze(["sources", "topic"]);
const SOURCE_FIELDS = Object.freeze(["id", "summary", "title", "url"]);

export const RESEARCH_VALIDATION_SPEC = Object.freeze({
  criteria_id: "research-output-v1",
  schema_version: 1,
  minimum_source_count: 20,
  maximum_source_count: 50,
  maximum_artifact_bytes: MAX_ARTIFACT_BYTES,
  maximum_reported_issues: MAX_ISSUES,
  root_fields: ROOT_FIELDS,
  source_fields: SOURCE_FIELDS,
  topic_max_characters: 512,
  source_id_pattern: "^[A-Za-z0-9_-]{1,64}$",
  title_max_characters: 256,
  summary_max_characters: 2048,
  url_max_characters: 2048,
  nonempty_text_rule: "nonempty after whitespace trimming",
  url_rule: "absolute HTTPS with hostname, no userinfo, whitespace or control characters",
  url_identity_rule: "WHATWG serialized URL without fragment; preserve path/query semantics",
  uniqueness_rule: "distinct exact IDs and normalized URL identities",
  utf8_rule: "strict UTF-8 before JSON parsing",
  network_reachability_checked: false,
  factual_accuracy_checked: false,
});

export type ValidationStatus = "VALIDATION_PASSED" | "VALIDATION_FAILED" | "VALIDATION_ERROR";
export interface ValidationIssue { readonly code: string; readonly path: string; readonly message: string }
export interface ValidationMetrics {
  readonly record_count: number | null;
  readonly records_checked: number;
  readonly unique_id_count: number;
  readonly unique_url_count: number;
}
export interface ValidationReport {
  readonly report_schema_version: 1;
  readonly validator_id: typeof VALIDATOR_ID;
  readonly validator_version: typeof VALIDATOR_VERSION;
  readonly criteria_id: "research-output-v1";
  readonly criteria_hash: string;
  readonly artifact_hash: string | null;
  readonly artifact_bytes: number | null;
  readonly evidence_hash: string;
  readonly status: ValidationStatus;
  readonly issues: readonly ValidationIssue[];
  readonly issue_count: number;
  readonly issues_truncated: boolean;
  readonly metrics: ValidationMetrics;
  readonly source: "LOCAL_VALIDATOR";
  readonly attestation: "UNATTESTED";
  readonly grants_payment_authority: false;
  readonly network_reachability_checked: false;
  readonly factual_accuracy_checked: false;
}

type EvidencePayload = Omit<ValidationReport, "evidence_hash">;
type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Versioned canonical JSON: sorted object keys, ordered arrays, safe integers. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  throw new TypeError("Unsupported value in canonical validation evidence");
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes);
  const result = await globalThis.crypto.subtle.digest("SHA-256", copy);
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function hashPayload(domain: string, value: unknown): Promise<string> {
  return sha256(new TextEncoder().encode(`${domain}\n${canonicalJson(value)}`));
}

export async function researchCriteriaHash(): Promise<string> {
  return hashPayload("runlatch.validation-spec.v1", RESEARCH_VALIDATION_SPEC);
}

function normalizedUrl(value: string): string | null {
  if (value.length > RESEARCH_VALIDATION_SPEC.url_max_characters || /[\u0000-\u0020\u007f]/u.test(value)) return null;
  if (!/^https:\/\//iu.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    url.hash = "";
    return url.href;
  } catch { return null; }
}

interface CheckResult {
  issues: ValidationIssue[];
  issueCount: number;
  metrics: ValidationMetrics;
}

function checkDocument(document: unknown): CheckResult {
  const issues: ValidationIssue[] = [];
  let issueCount = 0;
  const add = (code: string, path: string, message: string) => {
    issueCount += 1;
    if (issues.length < MAX_ISSUES) issues.push({ code, path, message });
  };
  const metrics = { record_count: null as number | null, records_checked: 0, unique_id_count: 0, unique_url_count: 0 };
  const text = (value: unknown, maximum: number, path: string, code: string) => {
    if (typeof value !== "string" || !value.trim() || value.length > maximum) {
      add(code, path, `Required nonempty text must be at most ${maximum} characters.`);
      return false;
    }
    return true;
  };
  const exactFields = (value: JsonObject, allowed: readonly string[], path: string) => {
    // Do not echo unknown field names: they can themselves contain private data.
    if (Object.keys(value).some(key => !allowed.includes(key))) {
      add("UNEXPECTED_FIELDS", path, "The object contains fields outside this criteria version.");
    }
  };

  if (!isObject(document)) {
    add("INVALID_ROOT", "$", "The report must be a JSON object.");
    return { issues, issueCount, metrics };
  }
  exactFields(document, ROOT_FIELDS, "$");
  text(document.topic, RESEARCH_VALIDATION_SPEC.topic_max_characters, "$.topic", "INVALID_TOPIC");
  if (!Array.isArray(document.sources)) {
    add("INVALID_SOURCES", "$.sources", "Sources must be an array.");
    return { issues, issueCount, metrics };
  }
  metrics.record_count = document.sources.length;
  if (document.sources.length < RESEARCH_VALIDATION_SPEC.minimum_source_count) {
    add("TOO_FEW_SOURCES", "$.sources", "At least 20 distinct source records are required.");
  }
  if (document.sources.length > RESEARCH_VALIDATION_SPEC.maximum_source_count) {
    add("TOO_MANY_SOURCES", "$.sources", "At most 50 source records may be evaluated; no records were checked.");
    return { issues, issueCount, metrics };
  }
  const ids = new Set<string>();
  const urls = new Set<string>();
  for (const [index, value] of document.sources.entries()) {
    const path = `$.sources[${index}]`;
    metrics.records_checked += 1;
    if (!isObject(value)) { add("INVALID_SOURCE", path, "Each source must be a JSON object."); continue; }
    exactFields(value, SOURCE_FIELDS, path);
    if (typeof value.id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/u.test(value.id)) {
      add("INVALID_SOURCE_ID", `${path}.id`, "Use an ASCII ID of 1–64 letters, digits, hyphens or underscores.");
    } else {
      if (ids.has(value.id)) add("DUPLICATE_SOURCE_ID", `${path}.id`, "This source ID is already present.");
      ids.add(value.id);
    }
    text(value.title, RESEARCH_VALIDATION_SPEC.title_max_characters, `${path}.title`, "INVALID_TITLE");
    text(value.summary, RESEARCH_VALIDATION_SPEC.summary_max_characters, `${path}.summary`, "INVALID_SUMMARY");
    const identity = typeof value.url === "string" ? normalizedUrl(value.url) : null;
    if (!identity) {
      add("INVALID_SOURCE_URL", `${path}.url`, "Use a bounded absolute HTTPS URL without credentials, whitespace or control characters; this is a syntax check only.");
    } else {
      if (urls.has(identity)) add("DUPLICATE_SOURCE_URL", `${path}.url`, "This normalized source URL is already present.");
      urls.add(identity);
    }
  }
  metrics.unique_id_count = ids.size;
  metrics.unique_url_count = urls.size;
  return { issues, issueCount, metrics };
}

async function report(payload: Omit<EvidencePayload, "criteria_hash">): Promise<ValidationReport> {
  const full: EvidencePayload = { ...payload, criteria_hash: await researchCriteriaHash() };
  const evidenceHash = await hashPayload("runlatch.validation-evidence.v1", full);
  return Object.freeze({ ...full, evidence_hash: evidenceHash,
    issues: Object.freeze(full.issues.map(issue => Object.freeze({ ...issue }))), metrics: Object.freeze({ ...full.metrics }) });
}

/** Hash an exact bounded byte snapshot before parsing. Never normalize artifact bytes. */
export async function validateResearchArtifact(artifact: Uint8Array | null): Promise<ValidationReport> {
  const base = {
    report_schema_version: 1 as const, validator_id: VALIDATOR_ID, validator_version: VALIDATOR_VERSION,
    criteria_id: "research-output-v1" as const, source: "LOCAL_VALIDATOR" as const,
    attestation: "UNATTESTED" as const, grants_payment_authority: false as const,
    network_reachability_checked: false as const, factual_accuracy_checked: false as const,
  } as const;
  const emptyMetrics: ValidationMetrics = { record_count: null, records_checked: 0, unique_id_count: 0, unique_url_count: 0 };
  if (artifact === null) return report({ ...base, status: "VALIDATION_ERROR", artifact_hash: null, artifact_bytes: null,
    issues: [{ code: "ARTIFACT_UNAVAILABLE", path: "$", message: "No artifact was provided; no content check or artifact hash is available." }],
    issue_count: 1, issues_truncated: false, metrics: emptyMetrics });
  if (!(artifact instanceof Uint8Array)) throw new TypeError("Artifact must be bytes or null");
  if (artifact.byteLength > MAX_ARTIFACT_BYTES) return report({ ...base, status: "VALIDATION_FAILED", artifact_hash: null,
    artifact_bytes: artifact.byteLength, issues: [{ code: "ARTIFACT_TOO_LARGE", path: "$", message: "Artifact exceeds 1 MiB; content and hashing were not evaluated." }],
    issue_count: 1, issues_truncated: false, metrics: emptyMetrics });
  // Copy before the first await, so caller mutation cannot change the checked bytes.
  const bytes = new Uint8Array(artifact);
  const artifactHash = await sha256(bytes);
  let document: unknown;
  try { document = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch {
    return report({ ...base, status: "VALIDATION_FAILED", artifact_hash: artifactHash, artifact_bytes: bytes.byteLength,
      issues: [{ code: "INVALID_UTF8_OR_JSON", path: "$", message: "Artifact must be strict UTF-8 containing valid JSON." }],
      issue_count: 1, issues_truncated: false, metrics: emptyMetrics });
  }
  const result = checkDocument(document);
  return report({ ...base, status: result.issueCount ? "VALIDATION_FAILED" : "VALIDATION_PASSED", artifact_hash: artifactHash,
    artifact_bytes: bytes.byteLength, issues: result.issues, issue_count: result.issueCount,
    issues_truncated: result.issueCount > MAX_ISSUES, metrics: result.metrics });
}

const REPORT_FIELDS = Object.freeze(["report_schema_version", "validator_id", "validator_version", "criteria_id", "criteria_hash",
  "artifact_hash", "artifact_bytes", "evidence_hash", "status", "issues", "issue_count", "issues_truncated", "metrics",
  "source", "attestation", "grants_payment_authority", "network_reachability_checked", "factual_accuracy_checked"]);

function exactObject(value: unknown, fields: readonly string[]): value is JsonObject {
  if (!isObject(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Object.keys(value);
  return keys.length === fields.length && keys.every(key => fields.includes(key)
    && Object.getOwnPropertyDescriptor(value, key)?.get === undefined
    && Object.getOwnPropertyDescriptor(value, key)?.set === undefined);
}

function validReportShape(value: unknown): value is ValidationReport {
  if (!exactObject(value, REPORT_FIELDS) || value.report_schema_version !== 1 || typeof value.status !== "string"
    || !["VALIDATION_PASSED", "VALIDATION_FAILED", "VALIDATION_ERROR"].includes(value.status)) return false;
  const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  if (!Array.isArray(value.issues) || value.issues.length > MAX_ISSUES || !count(value.issue_count)
    || value.issue_count < value.issues.length || value.issues_truncated !== (value.issue_count > MAX_ISSUES)
    || value.issues.length !== Math.min(value.issue_count, MAX_ISSUES)) return false;
  for (const issue of value.issues) {
    if (!exactObject(issue, ["code", "path", "message"]) || typeof issue.code !== "string" || !/^[A-Z][A-Z0-9_]{0,127}$/u.test(issue.code)
      || typeof issue.path !== "string" || issue.path.length > 128
      || typeof issue.message !== "string" || !issue.message || issue.message.length > 512) return false;
  }
  if (!exactObject(value.metrics, ["record_count", "records_checked", "unique_id_count", "unique_url_count"])) return false;
  const metrics = value.metrics;
  if (!(metrics.record_count === null || count(metrics.record_count)) || !count(metrics.records_checked)
    || !count(metrics.unique_id_count) || !count(metrics.unique_url_count)
    || metrics.records_checked > 50 || metrics.unique_id_count > metrics.records_checked
    || metrics.unique_url_count > metrics.records_checked) return false;
  if (!(value.artifact_bytes === null || count(value.artifact_bytes))
    || !(value.artifact_hash === null || typeof value.artifact_hash === "string" && /^[0-9a-f]{64}$/u.test(value.artifact_hash))) return false;
  if (value.artifact_hash !== null && (value.artifact_bytes === null || value.artifact_bytes > MAX_ARTIFACT_BYTES)) return false;
  if (value.status === "VALIDATION_PASSED") {
    if (value.issue_count !== 0 || value.artifact_hash === null || value.artifact_bytes === null || value.artifact_bytes === 0 || metrics.record_count === null
      || metrics.record_count < 20 || metrics.record_count > 50 || metrics.records_checked !== metrics.record_count
      || metrics.unique_id_count !== metrics.record_count || metrics.unique_url_count !== metrics.record_count) return false;
  } else if (value.issue_count === 0) return false;
  if (value.status === "VALIDATION_ERROR" && (value.artifact_hash !== null || value.artifact_bytes !== null || metrics.record_count !== null)) return false;
  return true;
}

/** Integrity/shape only, not authentication or proof the checker ran honestly. */
export async function verifyValidationReport(value: unknown, expectedArtifact?: Uint8Array): Promise<boolean> {
  try {
    if (!validReportShape(value)) return false;
    const { evidence_hash, ...payload } = value;
    if (!/^[0-9a-f]{64}$/u.test(evidence_hash) || value.criteria_hash !== await researchCriteriaHash()
      || value.validator_id !== VALIDATOR_ID || value.validator_version !== VALIDATOR_VERSION
      || value.criteria_id !== "research-output-v1" || value.source !== "LOCAL_VALIDATOR"
      || value.attestation !== "UNATTESTED" || value.grants_payment_authority !== false
      || value.network_reachability_checked !== false || value.factual_accuracy_checked !== false) return false;
    if (expectedArtifact !== undefined && (!(expectedArtifact instanceof Uint8Array)
      || expectedArtifact.byteLength > MAX_ARTIFACT_BYTES || value.artifact_hash !== await sha256(expectedArtifact)
      || value.artifact_bytes !== expectedArtifact.byteLength)) return false;
    return evidence_hash === await hashPayload("runlatch.validation-evidence.v1", payload);
  } catch { return false; }
}
