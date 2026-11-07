/** Explicit read-only RPC. No wallet, secret, broadcast, automatic import or payment authority. */
import { buildProjectReport, type ProjectDisclosure } from "../reporting/project.ts";
import { account, amount, count, enumValue, fail, hash, id, list, object, parseBoundedJson,
  parseProvider, parsePurchase, parseQuote, reference, time } from "./records.ts";

const ENDPOINTS = new Set(["https://rpc.testnet.near.org/", "https://test.rpc.fastnear.com/"]);
const MAX_BYTES = 1_048_576;
export interface TestnetTarget {
  readonly network: "testnet"; readonly rpc_url: string; readonly contract_id: string;
  readonly operator_id: string; readonly expected_code_hash: string;
}
export interface FinalBlock {
  readonly hash: string; readonly height: number; readonly timestamp_ns: string;
}
export interface ProjectSelection {
  readonly project_id: string; readonly capsule_ids: readonly string[];
  readonly provider_ids: readonly string[]; readonly quote_ids: readonly string[];
  readonly disclosure: ProjectDisclosure;
}
export function namedTestnetAccount(value: unknown): string {
  const result = account(value);
  if (!result.endsWith(".testnet")) return fail("NAMED_TESTNET_ACCOUNT_REQUIRED");
  return result;
}
export function parseTestnetTarget(value: unknown): TestnetTarget {
  const c = object(value, ["network", "rpc_url", "contract_id", "operator_id", "expected_code_hash"]);
  if (c.network !== "testnet") return fail("TESTNET_ONLY");
  let url: URL;
  try { if (typeof c.rpc_url !== "string" || c.rpc_url.length > 256) return fail("INVALID_TESTNET_RPC"); url = new URL(c.rpc_url); }
  catch { return fail("INVALID_TESTNET_RPC"); }
  if (url.username || url.password || url.search || url.hash || !ENDPOINTS.has(url.href)) return fail("TESTNET_RPC_NOT_ALLOWED");
  const contract = namedTestnetAccount(c.contract_id), operator = namedTestnetAccount(c.operator_id);
  if (contract === operator) return fail("CONTRACT_OPERATOR_ROLE_CONFLICT");
  return Object.freeze({ network: "testnet", rpc_url: url.href, contract_id: contract,
    operator_id: operator, expected_code_hash: reference(c.expected_code_hash) });
}
function identifiers(value: unknown, maximum: number) {
  const values = list(value, maximum).map(id);
  if (new Set(values).size !== values.length) return fail("DUPLICATE_TESTNET_SELECTION");
  return Object.freeze(values);
}
function parseSelection(value: unknown): ProjectSelection {
  const s = object(value, ["project_id", "capsule_ids", "provider_ids", "quote_ids", "disclosure"]);
  const project = id(s.project_id), disclosure = object(s.disclosure, ["project_id", "budget", "expenses", "evidence"]);
  if (disclosure.project_id !== project || [disclosure.budget, disclosure.expenses, disclosure.evidence].some(v => typeof v !== "boolean")) return fail("EXPLICIT_DISCLOSURE_REQUIRED");
  const capsules = identifiers(s.capsule_ids, 4);
  if (!capsules.length) return fail("CAPSULE_SELECTION_REQUIRED");
  return Object.freeze({ project_id: project, capsule_ids: capsules, provider_ids: identifiers(s.provider_ids, 3), quote_ids: identifiers(s.quote_ids, 16),
    disclosure: Object.freeze({ project_id: project, budget: disclosure.budget as boolean, expenses: disclosure.expenses as boolean, evidence: disclosure.evidence as boolean }) });
}
async function boundedResponse(response: Response): Promise<unknown> {
  if (!response.ok) return fail("TESTNET_RPC_HTTP_ERROR");
  const type = response.headers.get("content-type") ?? "";
  if (!/^application\/(?:json|[a-z0-9.+-]+\+json)(?:;|$)/iu.test(type)) return fail("TESTNET_RPC_CONTENT_TYPE");
  const length = response.headers.get("content-length");
  if (length && (!/^[0-9]{1,12}$/u.test(length) || BigInt(length) > BigInt(MAX_BYTES))) return fail("TESTNET_RPC_RESPONSE_LIMIT");
  const reader = response.body?.getReader();
  if (!reader) return fail("TESTNET_RPC_EMPTY_RESPONSE");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_BYTES) return fail("TESTNET_RPC_RESPONSE_LIMIT");
      chunks.push(next.value);
    }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let text: string; try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return fail("TESTNET_RPC_INVALID_UTF8"); }
  return parseBoundedJson(text, MAX_BYTES);
}
function encodedArgs(args: Readonly<Record<string, unknown>>) {
  const bytes = new TextEncoder().encode(JSON.stringify(args));
  if (bytes.length > 4096) return fail("TESTNET_VIEW_INPUT_LIMIT");
  return btoa(String.fromCharCode(...bytes));
}
const READ_ERRORS = new Set(["UNKNOWN_ACCOUNT", "UNKNOWN_BLOCK", "NO_CONTRACT_CODE", "CONTRACT_EXECUTION_ERROR", "TIMEOUT_ERROR", "DOES_NOT_TRACK_SHARD"]);
const LOCAL_RESPONSE_ERRORS = new Set(["TESTNET_RPC_HTTP_ERROR", "TESTNET_RPC_CONTENT_TYPE", "TESTNET_RPC_RESPONSE_LIMIT", "TESTNET_RPC_EMPTY_RESPONSE",
  "TESTNET_RPC_INVALID_UTF8", "INVALID_CONTRACT_JSON", "CONTRACT_INPUT_LIMIT", "CONTRACT_JSON_DEPTH", "DUPLICATE_CONTRACT_FIELD"]);

/** Injected transports are explicitly unverified test evidence. Config is copied before the first call. */
export function createTestnetReader(input: unknown, injectedFetch?: typeof fetch) {
  const target = parseTestnetTarget(input), transport = injectedFetch ?? fetch;
  const transportSource = injectedFetch ? "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE" as const : "EXPLICIT_TESTNET_HTTP_READBACK" as const;
  function operation(signal?: AbortSignal) {
    let requests = 0;
    const deadline = AbortSignal.timeout(60_000);
    const overall = signal ? AbortSignal.any([signal, deadline]) : deadline;
    async function rpc(method: "status" | "block" | "query", params: unknown) {
      if (overall.aborted) return fail(signal?.aborted ? "TESTNET_READ_CANCELLED" : "TESTNET_READ_TIMEOUT");
      if (++requests > 40) return fail("TESTNET_RPC_REQUEST_LIMIT");
      const requestId = `runlatch-read-${requests}`;
      const requestSignal = AbortSignal.any([overall, AbortSignal.timeout(15_000)]);
      let result: unknown;
      try {
        const response = await transport(target.rpc_url, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }), credentials: "omit", redirect: "error", cache: "no-store",
          referrerPolicy: "no-referrer", signal: requestSignal });
        result = await boundedResponse(response);
      } catch (error) {
        if (overall.aborted) return fail(signal?.aborted ? "TESTNET_READ_CANCELLED" : "TESTNET_READ_TIMEOUT");
        if (requestSignal.aborted) return fail("TESTNET_RPC_TIMEOUT");
        if (error instanceof Error && LOCAL_RESPONSE_ERRORS.has(error.message)) throw error;
        return fail("TESTNET_RPC_UNAVAILABLE");
      }
      const envelope = object(result);
      if (envelope.jsonrpc !== "2.0" || envelope.id !== requestId) return fail("TESTNET_RPC_ENVELOPE_MISMATCH");
      if (Object.hasOwn(envelope, "error")) {
        const error = object(envelope.error), cause = error.cause === undefined ? null : object(error.cause);
        const reason = cause?.name;
        return fail(typeof reason === "string" && READ_ERRORS.has(reason) ? `TESTNET_RPC_${reason}` : "TESTNET_RPC_ERROR");
      }
      if (!Object.hasOwn(envelope, "result")) return fail("TESTNET_RPC_EMPTY_RESULT");
      return envelope.result;
    }
    async function query(block: FinalBlock, params: Record<string, unknown>) {
      const response = object(await rpc("query", { ...params, block_id: block.hash, account_id: target.contract_id }));
      if (response.block_hash !== block.hash || count(response.block_height, Number.MAX_SAFE_INTEGER) !== block.height) return fail("MIXED_TESTNET_BLOCKS");
      return response;
    }
    async function view(block: FinalBlock, method: "get_operator" | "get_schema_version" | "get_network_tag" | "get_storage_requirements"
      | "get_project" | "get_capsule_report_snapshot" | "get_provider" | "get_quote", args: Readonly<Record<string, unknown>>) {
      const response = await query(block, { request_type: "call_function", method_name: method, args_base64: encodedArgs(args) });
      const bytes = Uint8Array.from(list(response.result, MAX_BYTES).map(v => count(v, 255)));
      let text: string; try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
      catch { return fail("TESTNET_VIEW_INVALID_UTF8"); }
      return parseBoundedJson(text, MAX_BYTES);
    }
    async function preflight() {
      const status = object(await rpc("status", []));
      if (status.chain_id !== "testnet") return fail("RPC_NETWORK_MISMATCH");
      const sync = object(status.sync_info);
      if (sync.syncing !== false) return fail("RPC_NODE_SYNCING");
      const header = object(object(await rpc("block", { finality: "final" })).header);
      const block: FinalBlock = Object.freeze({ hash: reference(header.hash), height: count(header.height, Number.MAX_SAFE_INTEGER), timestamp_ns: time(header.timestamp_nanosec) });
      const state = await query(block, { request_type: "view_account" });
      if (reference(state.code_hash) !== target.expected_code_hash) return fail("CONTRACT_CODE_HASH_MISMATCH");
      if (await view(block, "get_operator", {}) !== target.operator_id) return fail("CONTRACT_OPERATOR_MISMATCH");
      if (await view(block, "get_schema_version", {}) !== 2) return fail("UNSUPPORTED_CONTRACT_SCHEMA");
      if (await view(block, "get_network_tag", {}) !== "testnet") return fail("CONTRACT_NETWORK_MISMATCH");
      const raw = object(await view(block, "get_storage_requirements", {}), ["project_credit", "capsule_credit", "provider_credit", "quote_credit", "scope"]);
      if (raw.scope !== "CONSERVATIVE_PREPAID_STATE_LIMITS_NOT_MEASURED_GAS") return fail("UNSUPPORTED_STORAGE_REQUIREMENTS");
      const storage = Object.freeze({ project_credit: amount(raw.project_credit), capsule_credit: amount(raw.capsule_credit),
        provider_credit: amount(raw.provider_credit), quote_credit: amount(raw.quote_credit) });
      if (Object.values(storage).some(v => BigInt(v) === 0n)) return fail("INVALID_STORAGE_REQUIREMENTS");
      return Object.freeze({ target, block, storage, transport_source: transportSource, source: "NEAR_TESTNET_OBSERVATION" as const,
        independently_verified: false as const, grants_payment_authority: false as const,
        limitation: "RPC-reported chain/code/view consistency, not a light-client proof, signing consent or settlement verification." });
    }
    return { preflight, view };
  }
  return Object.freeze({ target,
    preflight: (signal?: AbortSignal) => operation(signal).preflight(),
    async readProject(inputSelection: unknown, signal?: AbortSignal) {
      const selection = parseSelection(inputSelection), session = operation(signal), observed = await session.preflight();
      const rawProject = await session.view(observed.block, "get_project", { project_id: selection.project_id });
      if (rawProject === null) return fail("TESTNET_PROJECT_NOT_FOUND");
      const project = object(rawProject), projectInput = object(project.input);
      if (projectInput.project_id !== selection.project_id || project.owner_id !== target.operator_id) return fail("TESTNET_PROJECT_OWNER_MISMATCH");
      const projectIndex = identifiers(project.capsule_ids, 64);
      if (selection.capsule_ids.some(c => !projectIndex.includes(c))) return fail("TESTNET_CAPSULE_SCOPE_MISMATCH");
      const providers = Object.freeze(await Promise.all(selection.provider_ids.map(async provider_id => parseProvider(await session.view(observed.block, "get_provider", { provider_id })))));
      if (providers.some((p, i) => p.provider_id !== selection.provider_ids[i])) return fail("TESTNET_PROVIDER_SCOPE_MISMATCH");
      const quotes = Object.freeze(await Promise.all(selection.quote_ids.map(async quote_id => parseQuote(await session.view(observed.block, "get_quote", { quote_id }), target.contract_id, providers))));
      if (quotes.some((q, i) => q.terms.input.quote_id !== selection.quote_ids[i] || BigInt(q.published_at_ns) > BigInt(observed.block.timestamp_ns))) return fail("TESTNET_QUOTE_SCOPE_MISMATCH");
      const snapshots = await Promise.all(selection.capsule_ids.map(async capsule_id => {
        const snapshot = object(await session.view(observed.block, "get_capsule_report_snapshot", { capsule_id }),
          ["project", "capsule", "purchases", "provisioning", "outcome", "task_check", "human_acceptance", "evidence_snapshot_hash"]);
        const c = object(snapshot.capsule), policy = object(c.policy);
        if (c.capsule_id !== capsule_id || c.owner_id !== target.operator_id || policy.project_id !== selection.project_id
          || c.policy_schema_version !== 2 || JSON.stringify(snapshot.project) !== JSON.stringify(project)) return fail("TESTNET_SNAPSHOT_BINDING_MISMATCH");
        hash(c.policy_hash); time(policy.project_revision); time(policy.expires_at_ns); time(c.created_at_ns);
        enumValue(c.status, ["ACTIVE", "PAUSED", "REVOKED", "COMPLETED", "CLOSING", "CLOSED"]);
        if (BigInt(time(c.created_at_ns)) > BigInt(observed.block.timestamp_ns)) return fail("TESTNET_RECORD_TIME_MISMATCH");
        for (const value of list(snapshot.purchases, 32)) {
          const p = parsePurchase(value);
          if (p.policy_hash !== c.policy_hash || p.proposal.capsule_id !== capsule_id || p.proposal.project_id !== selection.project_id
            || BigInt(p.created_at_ns) > BigInt(observed.block.timestamp_ns) || p.resolved_at_ns !== null && (BigInt(p.resolved_at_ns) < BigInt(p.created_at_ns)
              || BigInt(p.resolved_at_ns) > BigInt(observed.block.timestamp_ns))) return fail("TESTNET_PURCHASE_BINDING_MISMATCH");
        }
        return Object.freeze(snapshot);
      }));
      const canonicalInput = JSON.stringify({ source: "NEAR_TESTNET_OBSERVATION", contract_id: target.contract_id, network_tag: "testnet",
        block_hash: observed.block.hash, project_id: selection.project_id, snapshots });
      const report = await buildProjectReport(canonicalInput, selection.disclosure);
      return Object.freeze({ ...observed, selection, providers, quotes, snapshots: Object.freeze(snapshots), report,
        settlement_verification: "UNVERIFIED_WITHOUT_TRANSACTION_TRANSFER_CALLBACK_READBACK" as const });
    },
  });
}
