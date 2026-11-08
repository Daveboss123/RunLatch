/** Explicit read-only RPC. No wallet, secret, broadcast, automatic import or payment authority. */
import { buildProjectReport, type ProjectDisclosure } from "../reporting/project.ts";
import { assertTerminalPurchaseEvidence, inspectPurchaseEvidence, parsePurchaseObservationIntent, unverifiedPurchase, type PurchaseObservationIntent } from "./testnet-evidence.ts";
import { canonicalReviewContent } from "./review-content.ts";
import { inspectRestrictedAccess, parseRestrictedAgentScope } from "./agent-access.ts";
import { parsePurchaseAction, preparePurchaseReview } from "./action-review.ts";
import { parseTestnetTarget, type FinalBlock } from "./testnet-target.ts";
import { assertSetupRole, parseSetupAction, prepareSetupReview } from "./setup-review.ts";
import { assertOwnerRole, parseOwnerAction, prepareOwnerReview, type OwnerArtifact } from "./owner-review.ts";
export { namedTestnetAccount, parseTestnetTarget, type TestnetTarget, type FinalBlock } from "./testnet-target.ts";
import { amount, count, enumValue, fail, hash, id, list, object, parseBoundedJson,
  parseProvider, parsePurchase, parseQuote, reference, time } from "./records.ts";

const MAX_BYTES = 1_048_576;
const issuedNonceReadbacks = new WeakSet<object>();
export interface ProjectSelection {
  readonly project_id: string; readonly capsule_ids: readonly string[];
  readonly provider_ids: readonly string[]; readonly quote_ids: readonly string[];
  readonly disclosure: ProjectDisclosure;
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
const READ_ERRORS = new Set(["UNKNOWN_ACCOUNT", "UNKNOWN_BLOCK", "NO_CONTRACT_CODE", "CONTRACT_EXECUTION_ERROR", "TIMEOUT_ERROR", "DOES_NOT_TRACK_SHARD", "UNKNOWN_TRANSACTION"]);
const UNAVAILABLE_EVIDENCE = new Set(["TESTNET_RPC_UNAVAILABLE", "TESTNET_RPC_TIMEOUT", "TESTNET_READ_TIMEOUT", "TESTNET_READ_CANCELLED", "TESTNET_RPC_HTTP_ERROR",
  "TESTNET_RPC_TIMEOUT_ERROR", "TESTNET_RPC_DOES_NOT_TRACK_SHARD", "TESTNET_RPC_UNKNOWN_TRANSACTION", "TESTNET_RPC_UNKNOWN_BLOCK", "TESTNET_RPC_METHOD_UNAVAILABLE", "TESTNET_RPC_ERROR"]);
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
    async function rpc(method: "status" | "block" | "query" | "tx_status" | "EXPERIMENTAL_tx_status", params: unknown) {
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
      if (overall.aborted) return fail(signal?.aborted ? "TESTNET_READ_CANCELLED" : "TESTNET_READ_TIMEOUT");
      if (requestSignal.aborted) return fail("TESTNET_RPC_TIMEOUT");
      const envelope = object(result);
      if (envelope.jsonrpc !== "2.0" || envelope.id !== requestId) return fail("TESTNET_RPC_ENVELOPE_MISMATCH");
      if (Object.hasOwn(envelope, "error")) {
        const error = object(envelope.error), cause = error.cause === undefined ? null : object(error.cause);
        if (error.code === -32601) return fail("TESTNET_RPC_METHOD_UNAVAILABLE");
        const reason = cause?.name;
        return fail(typeof reason === "string" && READ_ERRORS.has(reason) ? `TESTNET_RPC_${reason}` : "TESTNET_RPC_ERROR");
      }
      if (!Object.hasOwn(envelope, "result")) return fail("TESTNET_RPC_EMPTY_RESULT");
      return envelope.result;
    }
    async function query(block: FinalBlock, params: Record<string, unknown>, accountId = target.contract_id) {
      const response = object(await rpc("query", { ...params, block_id: block.hash, account_id: accountId }));
      if (response.block_hash !== block.hash || count(response.block_height, Number.MAX_SAFE_INTEGER) !== block.height) return fail("MIXED_TESTNET_BLOCKS");
      return response;
    }
    async function view(block: FinalBlock, method: "get_operator" | "get_schema_version" | "get_network_tag" | "get_storage_requirements"
      | "get_project" | "get_capsule" | "get_capsule_report_snapshot" | "get_provider" | "get_quote", args: Readonly<Record<string, unknown>>) {
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
      const version = status.version === undefined ? null : object(status.version).version;
      const match = typeof version === "string" && version.length <= 64 ? /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:-rc[.\d]*|$)/u.exec(version) : null;
      const receiptStatusMethod = match && (+match[1] > 2 || +match[1] === 2 && +match[2] >= 14) ? "tx_status" as const : "EXPERIMENTAL_tx_status" as const;
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
        receipt_status_method: receiptStatusMethod,
        independently_verified: false as const, grants_payment_authority: false as const,
        limitation: "RPC-reported chain/code/view consistency, not a light-client proof, signing consent or settlement verification." });
    }
    async function verifyCode(block: FinalBlock) {
      const state = await query(block, { request_type: "view_account" });
      if (reference(state.code_hash) !== target.expected_code_hash) return fail("EXECUTION_CODE_HASH_MISMATCH");
    }
    async function restrictedAccess(block: FinalBlock, inputScope: unknown) {
      const scope = parseRestrictedAgentScope(inputScope, target);
      const key = await query(block, { request_type: "view_access_key", public_key: scope.public_key }, scope.agent_id);
      // Nine returned rows are rejected; no incomplete pagination or account-wide unbounded walk.
      const keys = await query(block, { request_type: "view_access_key_list", limit: 9 }, scope.agent_id);
      if (keys.next_key !== undefined && keys.next_key !== null) return fail("AGENT_ACCESS_KEY_LIST_INCOMPLETE");
      return inspectRestrictedAccess(scope, target, { nonce: key.nonce, permission: key.permission }, keys);
    }
    async function humanAccess(block: FinalBlock, signer: string, publicKey: string) {
      const key = await query(block, { request_type: "view_access_key", public_key: publicKey }, signer);
      return { nonce: key.nonce, permission: key.permission };
    }
    async function observePurchase(intent: PurchaseObservationIntent) {
      if (intent.sender_id === target.contract_id) return fail("CONTRACT_CANNOT_BE_PURCHASE_SIGNER");
      const unavailable = (reason: string) => Object.freeze({ ...unverifiedPurchase(intent, reason), transport_source: transportSource,
        source: "NEAR_TESTNET_OBSERVATION" as const, target });
      try {
        const before = await preflight();
        const execution = await rpc(before.receipt_status_method, { tx_hash: intent.transaction_hash, sender_account_id: intent.sender_id, wait_until: "FINAL" });
        const raw = object(execution);
        const finality = enumValue(raw.final_execution_status, ["NONE", "INCLUDED", "EXECUTED_OPTIMISTIC", "INCLUDED_FINAL", "EXECUTED", "FINAL"]);
        if (finality !== "FINAL" && raw.transaction === undefined) return { observation: Object.freeze({ ...unavailable("TRANSACTION_NOT_FINAL"), submission: "NOT_FINAL" as const }), block: null, transaction_nonce: null };
        // Pin views AFTER receipt lookup: a pre-lookup block may precede the final callback.
        const observed = await preflight();
        const snapshot = object(await view(observed.block, "get_capsule_report_snapshot", { capsule_id: intent.proposal.capsule_id }));
        const capsule = object(snapshot.capsule), policy = object(capsule.policy), project = object(snapshot.project), projectInput = object(project.input);
        if (capsule.capsule_id !== intent.proposal.capsule_id || capsule.owner_id !== target.operator_id || capsule.policy_schema_version !== 2
          || policy.project_id !== intent.proposal.project_id || projectInput.project_id !== intent.proposal.project_id || project.owner_id !== target.operator_id) return fail("TESTNET_SNAPSHOT_BINDING_MISMATCH");
        const projectRead = await view(observed.block, "get_project", { project_id: intent.proposal.project_id });
        if (JSON.stringify(projectRead) !== JSON.stringify(project)) return fail("TESTNET_SNAPSHOT_BINDING_MISMATCH");
        const report = await buildProjectReport(JSON.stringify({ source: "NEAR_TESTNET_OBSERVATION", contract_id: target.contract_id, network_tag: "testnet",
          block_hash: observed.block.hash, project_id: intent.proposal.project_id, snapshots: [snapshot] }),
        { project_id: intent.proposal.project_id, budget: true, expenses: false, evidence: false });
        const purchases = list(snapshot.purchases, 32).map(parsePurchase), p = purchases.find(p => p.proposal.request_id === intent.proposal.request_id) ?? null;
        let quote = null;
        if (p?.canonical_quote) {
          const providerId = p.canonical_quote.input.provider_id;
          const provider = parseProvider(await view(observed.block, "get_provider", { provider_id: providerId }));
          if (provider.provider_id !== providerId) return fail("TESTNET_PROVIDER_SCOPE_MISMATCH");
          quote = await parseQuote(await view(observed.block, "get_quote", { quote_id: p.proposal.quote_id }), target.contract_id, [provider]);
        }
        const hashes = finality === "FINAL" ? [...new Set([object(raw.transaction_outcome).block_hash,
          ...list(raw.receipts_outcome, 32).map(v => object(v).block_hash)].map(reference))] : [];
        if (hashes.length > 16) return fail("TESTNET_OUTCOME_BLOCK_LIMIT");
        const blocks: Record<string, FinalBlock> = Object.create(null);
        for (const blockHash of hashes) {
          if (blockHash === observed.block.hash) { blocks[blockHash] = observed.block; continue; }
          const header = object(object(await rpc("block", { block_id: blockHash })).header);
          const block = Object.freeze({ hash: reference(header.hash), height: count(header.height, Number.MAX_SAFE_INTEGER), timestamp_ns: time(header.timestamp_nanosec) });
          if (block.hash !== blockHash) return fail("TESTNET_OUTCOME_BLOCK_MISMATCH");
          blocks[blockHash] = block;
        }
        // Current code alone cannot establish which code executed the historical Gate/callback.
        const executionOutcomes = finality === "FINAL" ? list(raw.receipts_outcome, 32).map(v => object(v)) : [];
        const initialId = raw.transaction_outcome === undefined ? undefined : object(object(raw.transaction_outcome).outcome).status;
        const rootId = initialId && typeof initialId === "object" ? object(initialId).SuccessReceiptId : undefined;
        const initiating = executionOutcomes.find(o => o.id === rootId);
        const initiatingStatus = initiating === undefined ? undefined : object(initiating.outcome).status;
        const callbackId = initiatingStatus && typeof initiatingStatus === "object" ? object(initiatingStatus).SuccessReceiptId : undefined;
        const callback = executionOutcomes.find(o => o.id === callbackId);
        const codeBlocks = [...new Set([initiating, callback].filter(o => o !== undefined).map(o => reference(o!.block_hash)))];
        for (const blockHash of codeBlocks) await verifyCode(blocks[blockHash]);
        const evidence = inspectPurchaseEvidence(intent, execution, { contract_id: target.contract_id, operator_id: target.operator_id,
          block: observed.block, capsule, purchase: p, quote, outcome_blocks: blocks });
        return { observation: Object.freeze({ ...observed, ...evidence, financials: report.financials, execution_code_blocks: Object.freeze(codeBlocks) }),
          block: observed.block, transaction_nonce: object(raw.transaction).nonce };
      } catch (error) {
        if (error instanceof Error && UNAVAILABLE_EVIDENCE.has(error.message)) return { observation: unavailable(error.message), block: null, transaction_nonce: null };
        throw error;
      }
    }
    return { preflight, view, restrictedAccess, humanAccess, observePurchase };
  }
  return Object.freeze({ target,
    preflight: (signal?: AbortSignal) => operation(signal).preflight(),
    async readRestrictedAgent(inputScope: unknown, signal?: AbortSignal) {
      const scope = parseRestrictedAgentScope(inputScope, target), session = operation(signal), observed = await session.preflight();
      return Object.freeze({ ...observed, access: await session.restrictedAccess(observed.block, scope) });
    },
    async readSetupReview(inputAction: unknown, signal?: AbortSignal) {
      const action = parseSetupAction(inputAction);
      assertSetupRole(action, target);
      const session = operation(signal), observed = await session.preflight();
      const signerAccess = await session.humanAccess(observed.block, action.signer_id, action.public_key);
      let existing: unknown, project: unknown = null, previous: unknown = null;
      const providers: unknown[] = [];
      if (action.method === "create_project") existing = await session.view(observed.block, "get_project", { project_id: action.args.project.project_id });
      else if (action.method === "register_provider") existing = await session.view(observed.block, "get_provider", { provider_id: action.args.provider_id });
      else if (action.method === "create_capsule") {
        existing = await session.view(observed.block, "get_capsule", { capsule_id: action.args.capsule_id });
        project = await session.view(observed.block, "get_project", { project_id: action.args.policy.project_id });
        for (const provider_id of action.args.policy.allowed_provider_ids) providers.push(await session.view(observed.block, "get_provider", { provider_id }));
      } else {
        const quote = action.args.quote;
        existing = await session.view(observed.block, "get_quote", { quote_id: quote.quote_id });
        providers.push(await session.view(observed.block, "get_provider", { provider_id: quote.provider_id }));
        if (quote.previous_quote_id !== null) previous = await session.view(observed.block, "get_quote", { quote_id: quote.previous_quote_id });
      }
      return prepareSetupReview(target, action, { block: observed.block, storage: observed.storage, signer_access: signerAccess,
        existing_record: existing, project, providers, previous_quote: previous, transport_source: transportSource });
    },
    async readOwnerReview(inputAction: unknown, evidence?: OwnerArtifact, signal?: AbortSignal) {
      const action = parseOwnerAction(inputAction); assertOwnerRole(action, target);
      // Capture artifact before the first asynchronous read. It is never sent to the RPC.
      let artifact: OwnerArtifact | undefined;
      if (action.method === "record_task_check") {
        const e = object(evidence, ["artifact"]);
        if (e.artifact !== null && !(e.artifact instanceof Uint8Array)) return fail("EXACT_TASK_ARTIFACT_REQUIRED");
        if (e.artifact instanceof Uint8Array && e.artifact.byteLength > 16384) return fail("RESOURCE_ARTIFACT_SIZE_LIMIT");
        artifact = { artifact: e.artifact === null ? null : new Uint8Array(e.artifact) };
      } else if (evidence !== undefined) return fail("UNEXPECTED_OWNER_ARTIFACT");
      const session = operation(signal), observed = await session.preflight();
      const signerAccess = await session.humanAccess(observed.block, action.signer_id, action.public_key);
      let project: unknown = null, provider: unknown = null, snapshot: unknown = null;
      if (action.method === "set_provider_status") provider = await session.view(observed.block, "get_provider", { provider_id: action.args.provider_id });
      else if (action.method === "set_project_status" || action.method === "advance_project_revision") project = await session.view(observed.block, "get_project", { project_id: action.args.project_id });
      else {
        snapshot = await session.view(observed.block, "get_capsule_report_snapshot", { capsule_id: action.args.capsule_id });
        const capsule = object(object(snapshot).capsule), policy = object(capsule.policy);
        project = await session.view(observed.block, "get_project", { project_id: id(policy.project_id) });
      }
      return prepareOwnerReview(target, action, { block: observed.block, signer_access: signerAccess, project, provider, snapshot,
        transport_source: transportSource }, artifact);
    },
    async readPurchaseReview(inputAction: unknown, inputScope: unknown | null, signal?: AbortSignal) {
      const action = parsePurchaseAction(inputAction);
      const scope = inputScope === null ? null : parseRestrictedAgentScope(inputScope, target);
      if (action.method === "submit_purchase" ? !scope || scope.agent_id !== action.signer_id || scope.public_key !== action.public_key : scope !== null) return fail("ACTION_ROLE_SCOPE_MISMATCH");
      const session = operation(signal), observed = await session.preflight(), p = action.proposal;
      const snapshot = object(await session.view(observed.block, "get_capsule_report_snapshot", { capsule_id: p.capsule_id }));
      const project = await session.view(observed.block, "get_project", { project_id: p.project_id });
      if (JSON.stringify(snapshot.project) !== JSON.stringify(project)) return fail("TESTNET_SNAPSHOT_BINDING_MISMATCH");
      const report = await buildProjectReport(JSON.stringify({ source: "NEAR_TESTNET_OBSERVATION", contract_id: target.contract_id, network_tag: "testnet",
        block_hash: observed.block.hash, project_id: p.project_id, snapshots: [snapshot] }), { project_id: p.project_id, budget: true, expenses: false, evidence: false });
      const rawQuote = await session.view(observed.block, "get_quote", { quote_id: p.quote_id });
      const terms = object(object(rawQuote).terms), providerId = id(object(terms.input).provider_id);
      const provider = await session.view(observed.block, "get_provider", { provider_id: providerId });
      const access = scope === null ? null : await session.restrictedAccess(observed.block, scope);
      const review = await preparePurchaseReview(target, action, { block: observed.block, snapshot, provider, quote: rawQuote, access,
        transport_source: transportSource, financials: report.financials });
      return review;
    },
    async observePurchase(inputIntent: unknown, signal?: AbortSignal) {
      const intent = parsePurchaseObservationIntent(inputIntent);
      return (await operation(signal).observePurchase(intent)).observation;
    },
    /** Read-only exact prior transaction/key nonce reconciliation. No nonce allocation or resend. */
    async reconcileAgentNonce(input: unknown, signal?: AbortSignal) {
      const v = object(parseBoundedJson(canonicalReviewContent(input), 16384), ["intent", "scope", "nonce"]);
      const intent = parsePurchaseObservationIntent(v.intent), scope = parseRestrictedAgentScope(v.scope, target), nonce = time(v.nonce);
      if (intent.method !== "submit_purchase" || intent.sender_id !== scope.agent_id || intent.public_key !== scope.public_key
        || nonce === "0") return fail("RECONCILIATION_SCOPE_MISMATCH");
      // Ordinary RPC nonces are JSON numbers; never round/repair an unsafe observation.
      if (BigInt(nonce) > BigInt(Number.MAX_SAFE_INTEGER)) return fail("RECONCILIATION_NONCE_UNREADABLE");
      const session = operation(signal), prior = await session.observePurchase(intent), evidence = prior.observation;
      assertTerminalPurchaseEvidence(evidence);
      if (!prior.block) return fail("PRIOR_TRANSACTION_NOT_FINAL");
      if (count(prior.transaction_nonce, Number.MAX_SAFE_INTEGER).toString() !== nonce) return fail("PRIOR_TRANSACTION_NONCE_MISMATCH");
      const access = await session.restrictedAccess(prior.block, scope);
      if (access.nonce !== nonce) return fail("FINALIZED_KEY_NONCE_DIVERGED");
      const result = Object.freeze({ source: "NEAR_TESTNET_NONCE_OBSERVATION" as const, transport_source: transportSource, target,
        intent, nonce, block: prior.block, access, payment_evidence: evidence.payment_evidence, record_source: evidence.record_source,
        actual_decision: evidence.actual_decision, initial_receipt_id: evidence.initial_receipt_id,
        transfer_receipt_id: evidence.transfer_receipt_id, callback_receipt_id: evidence.callback_receipt_id,
        signing_enabled: false as const, grants_payment_authority: false as const, independently_verified: false as const,
        limitation: "RPC-reported exact finalized transaction and same-block restricted key nonce/permission. Not signing consent, nonce allocation, release/resend authority, provisioning or a light-client proof." });
      issuedNonceReadbacks.add(result);
      return result;
    },
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

export type AgentNonceReadback = Awaited<ReturnType<ReturnType<typeof createTestnetReader>["reconcileAgentNonce"]>>;
/** In-memory provenance only. Serialized/forged readbacks cannot stand in for a fresh reader operation. */
export function assertIssuedAgentNonceReadback(value: AgentNonceReadback) {
  if (!issuedNonceReadbacks.has(value)) return fail("UNISSUED_AGENT_NONCE_READBACK");
}
