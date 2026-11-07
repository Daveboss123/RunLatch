/** Exact, bounded analytics over supplied final run facts. Not chain verification. */
export interface RunCostFact {
  readonly capsule_id: string; readonly contract_id: string;
  readonly source: "SIMULATED" | "LOCAL_NEAR_SANDBOX" | "NEAR_TESTNET_OBSERVATION";
  readonly network_tag: "local" | "testnet";
  readonly workflow_id: string; readonly criteria_hash: string;
  readonly validator_id: string; readonly validator_version: string; readonly asset: "near-native";
  readonly capsule_status: "ACTIVE" | "PAUSED" | "REVOKED" | "COMPLETED" | "CLOSING" | "CLOSED";
  readonly validation_status: "VALIDATION_PASSED" | "VALIDATION_FAILED" | "VALIDATION_ERROR" | null;
  readonly attestation: "OWNER_ATTESTED" | "UNATTESTED";
  readonly recorded_at_ns: string | null;
  readonly budget: string; readonly allocated: string; readonly spent: string; readonly reserved: string;
  readonly returned: string; readonly storage_credit: string;
  readonly provider_spend: readonly { readonly provider_id: string; readonly spent: string }[];
}
const FIELDS = ["capsule_id", "contract_id", "source", "network_tag", "workflow_id", "criteria_hash", "validator_id",
  "validator_version", "asset", "capsule_status", "validation_status", "attestation", "recorded_at_ns", "budget",
  "allocated", "spent", "reserved", "returned", "storage_credit", "provider_spend"] as const;
const MAX = (1n << 128n) - 1n;
const bad = (code: string): never => { throw new Error(code); };
function amount(value: unknown): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,38})$/u.test(value)) return bad("INVALID_INTEGER_AMOUNT");
  const result = BigInt(value);
  if (result > MAX) return bad("INTEGER_AMOUNT_OVERFLOW");
  return result;
}
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
const oneOf = (value: unknown, allowed: readonly string[]): value is string => typeof value === "string" && allowed.includes(value);
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
function fact(value: unknown): RunCostFact {
  if (!object(value) || Object.keys(value).length !== FIELDS.length || Object.keys(value).some(key => !FIELDS.some(field => field === key))) return bad("INVALID_RUN_FACT");
  for (const name of ["capsule_id", "workflow_id", "validator_id"]) {
    if (typeof value[name] !== "string" || !/^[A-Za-z0-9_-]{1,64}$/u.test(value[name])) return bad("INVALID_RUN_FACT_ID");
  }
  if (typeof value.contract_id !== "string" || !/^[a-z0-9][a-z0-9._-]{1,63}$/u.test(value.contract_id)
    || typeof value.validator_version !== "string" || !/^[0-9]+\.[0-9]+\.[0-9]+$/u.test(value.validator_version)
    || value.validator_version.length > 32 || typeof value.criteria_hash !== "string" || !/^[0-9a-f]{64}$/u.test(value.criteria_hash)
    || !oneOf(value.source, ["SIMULATED", "LOCAL_NEAR_SANDBOX", "NEAR_TESTNET_OBSERVATION"])
    || !oneOf(value.network_tag, ["local", "testnet"]) || value.asset !== "near-native"
    || !oneOf(value.capsule_status, ["ACTIVE", "PAUSED", "REVOKED", "COMPLETED", "CLOSING", "CLOSED"])
    || !oneOf(value.attestation, ["OWNER_ATTESTED", "UNATTESTED"])
    || value.validation_status !== null && !oneOf(value.validation_status, ["VALIDATION_PASSED", "VALIDATION_FAILED", "VALIDATION_ERROR"])) return bad("INVALID_RUN_FACT");
  if (value.recorded_at_ns !== null && (typeof value.recorded_at_ns !== "string"
    || !/^(0|[1-9][0-9]{0,19})$/u.test(value.recorded_at_ns) || BigInt(value.recorded_at_ns) > (1n << 64n) - 1n)) return bad("INVALID_COMPLETION_TIME");
  const budget = amount(value.budget), allocated = amount(value.allocated), spent = amount(value.spent), reserved = amount(value.reserved);
  if (spent + reserved > allocated || allocated + amount(value.returned) !== budget) return bad("INVALID_RUN_LEDGER");
  amount(value.storage_credit);
  if (!Array.isArray(value.provider_spend) || value.provider_spend.length > 3) return bad("INVALID_PROVIDER_SPEND");
  const providers = new Set<string>();
  let sum = 0n;
  for (const provider of value.provider_spend) {
    if (!object(provider) || Object.keys(provider).length !== 2 || !("provider_id" in provider) || !("spent" in provider)
      || typeof provider.provider_id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/u.test(provider.provider_id)
      || providers.has(provider.provider_id)) return bad("INVALID_PROVIDER_SPEND");
    providers.add(provider.provider_id); sum += amount(provider.spent);
  }
  if (sum !== spent) return bad("PROVIDER_SPEND_MISMATCH");
  return value as unknown as RunCostFact;
}
interface Group {
  key: string[]; runs: number; passed: number; failed: number; errors: number; spent: bigint;
  providers: Map<string, bigint>; first: bigint | null; last: bigint | null; failedCost: bigint;
}
/** Serialized input avoids supplied getters/mutable model objects. Facts' source
 * labels are assertions from an upstream observer; this reducer authenticates none. */
export function analyzeRunCosts(serialized: string) {
  if (typeof serialized !== "string" || serialized.length > 131072 || new TextEncoder().encode(serialized).length > 131072) return bad("RUN_FACT_INPUT_LIMIT");
  let input: unknown;
  try { input = JSON.parse(serialized); } catch { return bad("INVALID_RUN_FACT_JSON"); }
  if (!Array.isArray(input) || input.length > 64) return bad("RUN_FACT_COUNT_LIMIT");
  const seen = new Map<string, string>(), groups = new Map<string, Group>();
  const excluded: { capsule_id: string; reason: string }[] = [];
  let duplicates = 0;
  for (const value of input) {
    const run = fact(value);
    const identity = JSON.stringify([run.source, run.network_tag, run.contract_id, run.capsule_id]);
    const normalized = JSON.stringify(FIELDS.map(field => field === "provider_spend"
      ? [...run.provider_spend].sort((a, b) => compare(a.provider_id, b.provider_id)) : run[field]));
    const original = seen.get(identity);
    if (original !== undefined) {
      if (original !== normalized) return bad("CONFLICTING_RUN_SNAPSHOTS");
      duplicates += 1; continue;
    }
    seen.set(identity, normalized);
    const reason = run.attestation !== "OWNER_ATTESTED" ? "UNATTESTED"
      : amount(run.reserved) > 0n || run.capsule_status === "CLOSING" ? "PENDING_SETTLEMENT"
      : run.validation_status === null || run.recorded_at_ns === null ? "NO_FINAL_OUTCOME"
      : ["ACTIVE", "PAUSED"].includes(run.capsule_status) ? "AUTHORITY_ACTIVE" : null;
    if (reason) { excluded.push({ capsule_id: run.capsule_id, reason }); continue; }
    const key = [run.source, run.network_tag, run.contract_id, run.workflow_id, run.criteria_hash, run.validator_id, run.validator_version, run.asset];
    const groupId = JSON.stringify(key);
    const group = groups.get(groupId) ?? { key, runs: 0, passed: 0, failed: 0, errors: 0, spent: 0n, providers: new Map<string, bigint>(), first: null, last: null, failedCost: 0n };
    group.runs += 1; group.spent += amount(run.spent);
    if (run.validation_status === "VALIDATION_PASSED") group.passed += 1;
    else if (run.validation_status === "VALIDATION_FAILED") group.failed += 1;
    else group.errors += 1;
    if (run.validation_status !== "VALIDATION_PASSED") group.failedCost += amount(run.spent);
    const time = BigInt(run.recorded_at_ns!);
    group.first = group.first === null || time < group.first ? time : group.first;
    group.last = group.last === null || time > group.last ? time : group.last;
    for (const provider of run.provider_spend) group.providers.set(provider.provider_id, (group.providers.get(provider.provider_id) ?? 0n) + amount(provider.spent));
    groups.set(groupId, group);
  }
  return { source: "DERIVED_FROM_INPUT_FACTS_NOT_INDEPENDENT_CHAIN_PROOF" as const,
    input_count: input.length, unique_count: seen.size, duplicate_count: duplicates, excluded,
    cohorts: [...groups.values()].map(group => ({ key: group.key, completed_runs: group.runs, passed_runs: group.passed,
      failed_runs: group.failed, error_runs: group.errors, settled_spend: group.spent.toString(), failed_run_cost: group.failedCost.toString(),
      provider_spend: [...group.providers.entries()].sort(([a], [b]) => compare(a, b)).map(([provider_id, spent]) => ({ provider_id, spent: spent.toString() })),
      completion_range_ns: { first: group.first!.toString(), last: group.last!.toString() },
      cost_per_success: group.passed ? { numerator: group.spent.toString(), denominator: group.passed.toString(), floor_yocto: (group.spent / BigInt(group.passed)).toString() } : null })) };
}
