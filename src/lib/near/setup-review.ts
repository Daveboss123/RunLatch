/** Fixed unsigned owner/provider setup calls. No signer, wallet, authority activation or purchase Gate. */
import { calculateCommitment } from "../purchasing/commitment.ts";
import { commercialQuoteHash } from "../purchasing/hashing.ts";
import { amount, count, enumValue, fail, hash, id, list, object, parseBoundedJson, parseProvider, parseQuote,
  parseQuoteTerms, reference, time } from "./records.ts";
import { publicKey } from "./testnet-evidence.ts";
import { namedTestnetAccount, parseTestnetTarget, type FinalBlock } from "./testnet-target.ts";
import { canonicalReviewContent as canonical, reviewContentHash as digest } from "./review-content.ts";

const issuedReviews = new WeakSet<object>();
const positive = (value: unknown) => { const v = amount(value); if (v === "0") return fail("INVALID_SETUP_AMOUNT"); return v; };
function scope(value: unknown, max: number) {
  const values = list(value, max).map(id);
  if (!values.length || new Set(values).size !== values.length) return fail("INVALID_SETUP_SCOPE");
  return Object.freeze(values);
}
export function parseProjectInput(value: unknown) {
  const p = object(value, ["project_id", "organisation_id", "client_ref", "budget_ceiling", "expires_at_ns", "outcome_definition_hash"]);
  return Object.freeze({ project_id: id(p.project_id), organisation_id: id(p.organisation_id), client_ref: id(p.client_ref),
    budget_ceiling: positive(p.budget_ceiling), expires_at_ns: time(p.expires_at_ns), outcome_definition_hash: hash(p.outcome_definition_hash) });
}
export function parseCapsulePolicy(value: unknown) {
  const p = object(value, ["project_id", "project_revision", "task_id", "workflow_id", "agent_id", "agent_public_key", "budget",
    "per_purchase_limit", "per_commitment_limit", "recurring_policy", "allowed_provider_ids", "allowed_service_ids", "allowed_categories",
    "max_quantity", "approval_threshold", "expires_at_ns", "validation_spec_hash"]);
  const budget = positive(p.budget), purchase = positive(p.per_purchase_limit), commitment = positive(p.per_commitment_limit);
  const threshold = p.approval_threshold === null ? null : amount(p.approval_threshold), quantity = count(p.max_quantity, 50);
  if (BigInt(purchase) > BigInt(budget) || BigInt(commitment) > BigInt(budget)
    || threshold !== null && BigInt(threshold) > BigInt(commitment) || quantity === 0) return fail("INVALID_SETUP_POLICY_LIMITS");
  return Object.freeze({ project_id: id(p.project_id), project_revision: time(p.project_revision), task_id: id(p.task_id), workflow_id: id(p.workflow_id),
    agent_id: namedTestnetAccount(p.agent_id), agent_public_key: publicKey(p.agent_public_key), budget, per_purchase_limit: purchase,
    per_commitment_limit: commitment, recurring_policy: enumValue(p.recurring_policy, ["FORBIDDEN", "REQUIRE_APPROVAL"]),
    allowed_provider_ids: scope(p.allowed_provider_ids, 3), allowed_service_ids: scope(p.allowed_service_ids, 4), allowed_categories: scope(p.allowed_categories, 4),
    max_quantity: quantity, approval_threshold: threshold, expires_at_ns: time(p.expires_at_ns), validation_spec_hash: hash(p.validation_spec_hash) });
}
type SetupArgs = { readonly method: "create_project"; readonly args: { readonly project: ReturnType<typeof parseProjectInput> } }
  | { readonly method: "create_capsule"; readonly args: { readonly capsule_id: string; readonly policy: ReturnType<typeof parseCapsulePolicy>; readonly storage_credit: string } }
  | { readonly method: "register_provider"; readonly args: { readonly provider_id: string; readonly publisher_id: string; readonly recipient_id: string } }
  | { readonly method: "publish_quote"; readonly args: { readonly quote: ReturnType<typeof parseQuoteTerms>["input"] } };
export type SetupAction = SetupArgs & { readonly signer_id: string; readonly public_key: string; readonly gas: string };
export function parseSetupAction(value: unknown): SetupAction {
  // Bound and detach all caller input before parsing or awaiting an RPC/hash; do not invoke getters/toJSON.
  const a = object(parseBoundedJson(canonical(value), 16384), ["method", "signer_id", "public_key", "gas", "args"]);
  const signer = namedTestnetAccount(a.signer_id), key = publicKey(a.public_key), gas = time(a.gas);
  if (gas === "0" || BigInt(gas) > 300_000_000_000_000n) return fail("INVALID_ACTION_GAS");
  const common = { signer_id: signer, public_key: key, gas };
  switch (a.method) {
    case "create_project": {
      const args = object(a.args, ["project"]);
      return Object.freeze({ ...common, method: a.method, args: Object.freeze({ project: parseProjectInput(args.project) }) });
    }
    case "create_capsule": {
      const args = object(a.args, ["capsule_id", "policy", "storage_credit"]);
      return Object.freeze({ ...common, method: a.method, args: Object.freeze({ capsule_id: id(args.capsule_id),
        policy: parseCapsulePolicy(args.policy), storage_credit: positive(args.storage_credit) }) });
    }
    case "register_provider": {
      const args = object(a.args, ["provider_id", "publisher_id", "recipient_id"]);
      return Object.freeze({ ...common, method: a.method, args: Object.freeze({ provider_id: id(args.provider_id),
        publisher_id: namedTestnetAccount(args.publisher_id), recipient_id: namedTestnetAccount(args.recipient_id) }) });
    }
    case "publish_quote": {
      const args = object(a.args, ["quote"]), terms = parseQuoteTerms({ input: args.quote, publisher_id: signer, schema_version: 2 });
      namedTestnetAccount(terms.input.recipient_id);
      return Object.freeze({ ...common, method: a.method, args: Object.freeze({ quote: terms.input }) });
    }
    default: return fail("SETUP_METHOD_NOT_ADMITTED");
  }
}
export function assertSetupRole(action: SetupAction, target: ReturnType<typeof parseTestnetTarget>) {
  if (action.method === "publish_quote" ? [target.operator_id, target.contract_id].includes(action.signer_id)
    : action.signer_id !== target.operator_id) return fail("SETUP_SIGNER_ROLE_MISMATCH");
}
interface SetupContext {
  readonly block: FinalBlock;
  readonly storage: { readonly project_credit: string; readonly capsule_credit: string; readonly provider_credit: string; readonly quote_credit: string };
  readonly signer_access: unknown;
  readonly existing_record: unknown;
  readonly project: unknown | null;
  readonly providers: readonly unknown[];
  readonly previous_quote: unknown | null;
  readonly transport_source: "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE" | "EXPLICIT_TESTNET_HTTP_READBACK";
}
export async function prepareSetupReview(inputTarget: unknown, inputAction: unknown, inputContext: SetupContext) {
  const target = parseTestnetTarget(inputTarget), action = parseSetupAction(inputAction);
  assertSetupRole(action, target);
  const c = object(parseBoundedJson(canonical(inputContext)), ["block", "storage", "signer_access", "existing_record", "project", "providers", "previous_quote", "transport_source"]);
  const b = object(c.block, ["hash", "height", "timestamp_ns"]);
  const block = Object.freeze({ hash: reference(b.hash), height: count(b.height, Number.MAX_SAFE_INTEGER), timestamp_ns: time(b.timestamp_ns) });
  const now = BigInt(block.timestamp_ns), expiries = [now + 60_000_000_000n];
  const rawStorage = object(c.storage, ["project_credit", "capsule_credit", "provider_credit", "quote_credit"]);
  const storage = Object.freeze({ project_credit: positive(rawStorage.project_credit), capsule_credit: positive(rawStorage.capsule_credit),
    provider_credit: positive(rawStorage.provider_credit), quote_credit: positive(rawStorage.quote_credit) });
  const key = object(c.signer_access, ["nonce", "permission"]);
  // A deposit-capable human key observation is not authentication, control or permission to sign.
  if (key.permission !== "FullAccess") return fail("SETUP_DEPOSIT_CAPABLE_KEY_REQUIRED");
  const nonce = count(key.nonce, Number.MAX_SAFE_INTEGER).toString();
  if (c.existing_record !== null) return fail("SETUP_ID_ALREADY_EXISTS");
  const providers = Object.freeze(list(c.providers, 3).map(parseProvider));
  if (new Set(providers.map(p => p.provider_id)).size !== providers.length) return fail("DUPLICATE_SETUP_PROVIDER");
  let deposit: string, purchaseFunding = "0", storageCredit: string;
  let exposure: ReturnType<typeof calculateCommitment> | null = null, proposedQuoteHash: string | null = null;
  let projectContext: unknown = null;
  if (action.method === "create_project") {
    if (c.project !== null || providers.length || c.previous_quote !== null) return fail("UNEXPECTED_SETUP_CONTEXT");
    expiries.push(BigInt(action.args.project.expires_at_ns));
    deposit = storageCredit = storage.project_credit;
  } else if (action.method === "register_provider") {
    const p = action.args;
    if (c.project !== null || providers.length || c.previous_quote !== null) return fail("UNEXPECTED_SETUP_CONTEXT");
    if ([target.operator_id, target.contract_id].includes(p.publisher_id) || p.recipient_id === target.contract_id) return fail("SETUP_PROVIDER_ROLE_CONFLICT");
    deposit = storageCredit = storage.provider_credit;
  } else if (action.method === "create_capsule") {
    if (c.previous_quote !== null) return fail("UNEXPECTED_SETUP_CONTEXT");
    const p = object(c.project, ["input", "owner_id", "revision", "status", "allocated_authority", "capsule_ids", "created_at_ns", "updated_at_ns"]);
    const input = parseProjectInput(p.input), policy = action.args.policy, revision = time(p.revision), allocated = amount(p.allocated_authority);
    const capsuleIds = list(p.capsule_ids, 64).map(id), created = time(p.created_at_ns), updated = time(p.updated_at_ns);
    if (revision === "0" || new Set(capsuleIds).size !== capsuleIds.length || capsuleIds.includes(action.args.capsule_id)
      || BigInt(created) > BigInt(updated) || BigInt(updated) > now || BigInt(allocated) > BigInt(input.budget_ceiling)) return fail("INVALID_SETUP_PROJECT_STATE");
    if (p.owner_id !== target.operator_id || input.project_id !== policy.project_id || p.status !== "ACTIVE"
      || revision !== policy.project_revision) return fail("SETUP_PROJECT_AUTHORITY_MISMATCH");
    if ([target.operator_id, target.contract_id].includes(policy.agent_id)) return fail("SETUP_AGENT_ROLE_CONFLICT");
    if (providers.length !== policy.allowed_provider_ids.length || providers.some((provider, i) => provider.provider_id !== policy.allowed_provider_ids[i]
      || !provider.active || [provider.publisher_id, provider.recipient_id].includes(policy.agent_id))) return fail("SETUP_PROVIDER_SCOPE_MISMATCH");
    if (BigInt(policy.expires_at_ns) > BigInt(input.expires_at_ns)) return fail("SETUP_CAPSULE_EXCEEDS_PROJECT_EXPIRY");
    if (BigInt(allocated) + BigInt(policy.budget) > BigInt(input.budget_ceiling)) return fail("SETUP_PROJECT_ALLOCATION_EXCEEDED");
    if (BigInt(action.args.storage_credit) < BigInt(storage.capsule_credit)) return fail("SETUP_STORAGE_CREDIT_INSUFFICIENT");
    purchaseFunding = policy.budget; storageCredit = action.args.storage_credit;
    deposit = amount((BigInt(purchaseFunding) + BigInt(storageCredit)).toString());
    expiries.push(BigInt(input.expires_at_ns), BigInt(policy.expires_at_ns));
    projectContext = { input, owner_id: p.owner_id, revision, status: p.status, allocated_authority: allocated,
      capsule_ids: capsuleIds, created_at_ns: created, updated_at_ns: updated };
  } else {
    if (c.project !== null || providers.length !== 1) return fail("UNEXPECTED_SETUP_CONTEXT");
    const quote = action.args.quote, provider = providers[0];
    if (provider.provider_id !== quote.provider_id || provider.publisher_id !== action.signer_id
      || provider.recipient_id !== quote.recipient_id || !provider.active || provider.quote_count >= 32) return fail("SETUP_PUBLISHER_BINDING_MISMATCH");
    if (quote.quantity === 0) return fail("INVALID_SETUP_QUOTE_QUANTITY");
    exposure = calculateCommitment(quote);
    if (!exposure.bounded) return fail("SETUP_UNBOUNDED_QUOTE");
    if (quote.previous_quote_id === null ? c.previous_quote !== null : c.previous_quote === null) return fail("SETUP_PREVIOUS_QUOTE_REQUIRED");
    if (quote.previous_quote_id !== null) {
      const previous = await parseQuote(c.previous_quote, target.contract_id, providers), old = previous.terms.input;
      if (old.quote_id !== quote.previous_quote_id || BigInt(previous.published_at_ns) > now
        || ["provider_id", "service_id", "category", "asset", "quantity", "recurring"].some(k => old[k as keyof typeof old] !== quote[k as keyof typeof quote])) return fail("SETUP_INCOMPARABLE_PREVIOUS_QUOTE");
    }
    proposedQuoteHash = await commercialQuoteHash({ input: quote, publisher_id: provider.publisher_id, schema_version: 2 }, "testnet", target.contract_id);
    expiries.push(BigInt(quote.expires_at_ns));
    deposit = storageCredit = storage.quote_credit;
  }
  if (expiries.some(expiry => expiry <= now)) return fail("SETUP_REVIEW_EXPIRED");
  const expires = time(expiries.reduce((a, b) => a < b ? a : b).toString());
  const transport = enumValue(c.transport_source, ["INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE", "EXPLICIT_TESTNET_HTTP_READBACK"]);
  const call = Object.freeze({ network: "testnet" as const, signer_id: action.signer_id, public_key: action.public_key,
    receiver_id: target.contract_id, method: action.method, args: action.args, gas: action.gas, attached_deposit: deposit });
  const stateHash = await digest({ target, storage, signer_access: { nonce, permission: "FullAccess" }, existing_record: null,
    project: projectContext, providers, previous_quote: c.previous_quote });
  const reviewHash = await digest({ domain: "runlatch.exact-setup-review.v1", call, state_hash: stateHash, expires_at_ns: expires, transport_source: transport });
  const review = Object.freeze({ source: "UNSIGNED_EXACT_SETUP_REVIEW" as const, action, call, target, reviewed_block: block,
    reviewed_at_ns: block.timestamp_ns, expires_at_ns: expires, review_hash: reviewHash, state_hash: stateHash, transport_source: transport,
    funding: Object.freeze({ purchase_funding: purchaseFunding, storage_credit: storageCredit, attached_deposit: deposit,
      project_ceiling: action.method === "create_project" ? action.args.project.budget_ceiling : null, gas: action.gas,
      purchase_payment_scheduled: false as const }), proposed_quote_hash: proposedQuoteHash, exposure,
    signer_access: Object.freeze({ public_key: action.public_key, nonce, permission: "FullAccess" as const }),
    signing_enabled: false as const, grants_payment_authority: false as const, independently_verified: false as const,
    limitation: "Unsigned content review only. No human authentication or signing consent. Rust validates actual setup state; quote publication is not purchase approval, settlement or provisioning." });
  issuedReviews.add(review);
  return review;
}
export type SetupReview = Awaited<ReturnType<typeof prepareSetupReview>>;
export function confirmFreshSetupReview(review: SetupReview, fresh: SetupReview, confirmation: unknown) {
  if (!issuedReviews.has(review) || !issuedReviews.has(fresh)) return fail("UNISSUED_SETUP_REVIEW");
  const c = object(confirmation, ["review_hash", "consent"]);
  if (c.consent !== true || hash(c.review_hash) !== review.review_hash) return fail("EXACT_SETUP_CONFIRMATION_REQUIRED");
  if (fresh.transport_source !== review.transport_source || canonical(fresh.call) !== canonical(review.call) || fresh.state_hash !== review.state_hash) return fail("SETUP_REVIEW_CHANGED");
  if (BigInt(fresh.reviewed_at_ns) < BigInt(review.reviewed_at_ns) || BigInt(fresh.reviewed_at_ns) >= BigInt(review.expires_at_ns)
    || fresh.reviewed_block.height < review.reviewed_block.height) return fail("SETUP_REVIEW_STALE");
  return Object.freeze({ status: "LOCAL_EXACT_SETUP_CONTENT_CONFIRMED" as const, call: review.call, signing_enabled: false as const,
    grants_payment_authority: false as const });
}
