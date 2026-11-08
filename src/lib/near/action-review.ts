/** Exact unsigned purchasing review. Not owner authentication, a policy engine, a signer or a wallet relay. */
import { calculateCommitment } from "../purchasing/commitment.ts";
import { amount, count, enumValue, fail, hash, id, list, object, parseBoundedJson, parseProposal, parseProvider, parsePurchase, parseQuote, reference, time, type Proposal } from "./records.ts";
import { publicKey } from "./testnet-evidence.ts";
import { namedTestnetAccount, parseTestnetTarget, type FinalBlock } from "./testnet-target.ts";
import type { inspectRestrictedAccess } from "./agent-access.ts";
import type { buildProjectReport } from "../reporting/project.ts";
import { canonicalReviewContent as canonical, reviewContentHash as digest } from "./review-content.ts";

const issuedReviews = new WeakSet<object>();

export interface PurchaseAction {
  readonly method: "submit_purchase" | "approve_purchase"; readonly signer_id: string; readonly public_key: string;
  readonly gas: string; readonly proposal: Proposal; readonly expected_request_hash: string | null;
}
export function parsePurchaseAction(value: unknown): PurchaseAction {
  const a = object(value, ["method", "signer_id", "public_key", "gas", "proposal", "expected_request_hash"]);
  const method = enumValue(a.method, ["submit_purchase", "approve_purchase"]), gas = time(a.gas);
  if (BigInt(gas) === 0n || BigInt(gas) > 300_000_000_000_000n) return fail("INVALID_ACTION_GAS");
  if (method === "submit_purchase" ? a.expected_request_hash !== null : a.expected_request_hash === null) return fail("INVALID_ACTION_APPROVAL_BINDING");
  return Object.freeze({ method, signer_id: namedTestnetAccount(a.signer_id), public_key: publicKey(a.public_key), gas,
    proposal: parseProposal(a.proposal), expected_request_hash: a.expected_request_hash === null ? null : hash(a.expected_request_hash) });
}
interface ReviewContext {
  readonly block: FinalBlock; readonly snapshot: unknown; readonly provider: unknown; readonly quote: unknown;
  readonly access: ReturnType<typeof inspectRestrictedAccess> | null;
  readonly transport_source: "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE" | "EXPLICIT_TESTNET_HTTP_READBACK";
  readonly financials?: Awaited<ReturnType<typeof buildProjectReport>>["financials"];
}
/** Caller must first validate the pinned ledger with the shared report reducer. Reader does this before returning. */
export async function preparePurchaseReview(inputTarget: unknown, inputAction: unknown, context: ReviewContext) {
  const target = parseTestnetTarget(inputTarget), action = parsePurchaseAction(inputAction), snapshot = object(parseBoundedJson(canonical(context.snapshot)));
  const block = Object.freeze({ hash: reference(context.block.hash), height: count(context.block.height, Number.MAX_SAFE_INTEGER), timestamp_ns: time(context.block.timestamp_ns) });
  const access = context.access === null ? null : Object.freeze({ ...context.access, method_names: Object.freeze([...context.access.method_names]) });
  const capsule = object(snapshot.capsule), policy = object(capsule.policy), project = object(snapshot.project), projectInput = object(project.input);
  const p = action.proposal, now = BigInt(block.timestamp_ns);
  if (capsule.capsule_id !== p.capsule_id || capsule.owner_id !== target.operator_id || capsule.policy_schema_version !== 2
    || policy.project_id !== p.project_id || projectInput.project_id !== p.project_id || project.owner_id !== target.operator_id
    || !list(project.capsule_ids, 64).map(id).includes(p.capsule_id)) return fail("ACTION_CONTEXT_BINDING_MISMATCH");
  const policyHash = hash(capsule.policy_hash);
  if (project.status !== "ACTIVE" || capsule.status !== "ACTIVE") return fail("ACTION_AUTHORITY_INACTIVE");
  if (time(project.revision) !== p.project_revision || time(policy.project_revision) !== p.project_revision) return fail("ACTION_PROJECT_REVISION_CHANGED");
  const authorityExpiry = [time(projectInput.expires_at_ns), time(policy.expires_at_ns)];
  if (authorityExpiry.some(v => BigInt(v) <= now)) return fail("ACTION_AUTHORITY_EXPIRED");
  const provider = parseProvider(context.provider), quote = await parseQuote(context.quote, target.contract_id, [provider]);
  if (quote.terms.input.quote_id !== p.quote_id || quote.quote_hash !== p.expected_quote_hash || BigInt(quote.published_at_ns) > now) return fail("ACTION_CANONICAL_QUOTE_MISMATCH");
  if (!provider.active || quote.consumed) return fail("ACTION_QUOTE_NOT_AVAILABLE");
  const expiry = BigInt(quote.terms.input.expires_at_ns);
  if (expiry <= now) return fail("ACTION_QUOTE_EXPIRED");
  const exposure = calculateCommitment(quote.terms.input);
  if (!exposure.bounded || BigInt(amount(quote.terms.input.price)) === 0n) return fail("ACTION_COMMITMENT_NOT_REVIEWABLE");
  const records = list(snapshot.purchases, 32).map(parsePurchase), original = records.find(r => r.proposal.request_id === p.request_id) ?? null;
  let approvalExpiry: string | null = null;
  if (action.method === "submit_purchase") {
    if (action.signer_id !== policy.agent_id || action.public_key !== policy.agent_public_key || action.signer_id === provider.publisher_id
      || action.signer_id === provider.recipient_id || action.signer_id === target.operator_id || action.signer_id === target.contract_id) return fail("ACTION_AGENT_BINDING_MISMATCH");
    if (original) return fail("ACTION_REQUEST_ALREADY_EXISTS");
    if (!access || access.agent_id !== action.signer_id || access.public_key !== action.public_key
      || access.receiver_id !== target.contract_id || access.method_names.length !== 1 || access.method_names[0] !== "submit_purchase"
      || !access.recovery_access_observed || BigInt(amount(access.allowance)) === 0n || BigInt(access.allowance) > BigInt(amount(access.allowance_cap))) return fail("ACTION_RESTRICTED_ACCESS_REQUIRED");
  } else {
    if (action.signer_id !== target.operator_id || access !== null) return fail("ACTION_OWNER_BINDING_MISMATCH");
    if (!original || original.status !== "APPROVAL_PENDING" || original.decision !== "APPROVAL_REQUIRED"
      || original.request_hash !== action.expected_request_hash || original.policy_hash !== policyHash
      || canonical(original.proposal) !== canonical(p) || canonical(original.canonical_quote) !== canonical(quote.terms)
      || original.reserved_amount !== "0" || original.committed_future_amount !== "0" || original.approved_by !== null) return fail("ACTION_APPROVAL_NOT_EXACT_PENDING");
    approvalExpiry = original.approval_expires_at_ns;
    if (BigInt(approvalExpiry) <= now) return fail("ACTION_APPROVAL_EXPIRED");
  }
  // 60 seconds is a local review bound, not a lease on mutable chain state. Rust rechecks during execution.
  const expires = [now + 60_000_000_000n, expiry, ...authorityExpiry.map(BigInt), ...(approvalExpiry === null ? [] : [BigInt(approvalExpiry)])]
    .reduce((a, b) => a < b ? a : b).toString();
  const args = action.method === "submit_purchase" ? { proposal: p }
    : { capsule_id: p.capsule_id, request_id: p.request_id, expected_request_hash: action.expected_request_hash };
  const call = Object.freeze({ network: "testnet" as const, signer_id: action.signer_id, public_key: action.public_key,
    receiver_id: target.contract_id, method: action.method, args: Object.freeze(args), gas: action.gas,
    attached_deposit: action.method === "submit_purchase" ? "0" : "1" });
  const transportSource = enumValue(context.transport_source, ["INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE", "EXPLICIT_TESTNET_HTTP_READBACK"]);
  const stateHash = await digest({ target, snapshot, provider, quote, access });
  const reviewHash = await digest({ domain: "runlatch.exact-purchase-review.v1", call, state_hash: stateHash, expires_at_ns: expires,
    transport_source: transportSource });
  const review = Object.freeze({ call, action, target, reviewed_block: block, reviewed_at_ns: now.toString(), expires_at_ns: expires,
    state_hash: stateHash, review_hash: reviewHash, canonical_quote: quote, policy_hash: policyHash, access,
    exposure: Object.freeze({ asset: "near-native" as const, recipient_id: quote.terms.input.recipient_id,
      amount_due_now: quote.terms.input.price, future_commitment: exposure.committed_future, total_commitment: exposure.known_minimum_commitment,
      attached_deposit: call.attached_deposit, gas: call.gas }),
    source: "UNSIGNED_EXACT_PURCHASE_REVIEW" as const, transport_source: transportSource,
    financials: context.financials ? Object.freeze({ ...context.financials }) : null,
    grants_payment_authority: false as const, independently_verified: false as const,
    limitation: "Not Gate approval or authenticated consent. Re-read immediately before signing; execution may still deny. Native transfer and callbacks need separate observation." });
  issuedReviews.add(review);
  return review;
}
export type PurchaseReview = Awaited<ReturnType<typeof preparePurchaseReview>>;

/** A local exact-content confirmation only; never turns RPC input or a checkbox into owner authority. */
export function confirmFreshPurchaseReview(review: PurchaseReview, fresh: PurchaseReview, inputConfirmation: unknown) {
  if (!issuedReviews.has(review) || !issuedReviews.has(fresh)) return fail("UNISSUED_ACTION_REVIEW");
  const c = object(inputConfirmation, ["review_hash", "consent"]);
  if (c.consent !== true || hash(c.review_hash) !== review.review_hash) return fail("EXACT_ACTION_CONFIRMATION_REQUIRED");
  if (fresh.transport_source !== review.transport_source || canonical(fresh.call) !== canonical(review.call) || fresh.state_hash !== review.state_hash) return fail("ACTION_REVIEW_CHANGED");
  if (BigInt(fresh.reviewed_at_ns) < BigInt(review.reviewed_at_ns) || BigInt(fresh.reviewed_at_ns) >= BigInt(review.expires_at_ns)
    || fresh.reviewed_block.height < review.reviewed_block.height) return fail("ACTION_REVIEW_STALE");
  return Object.freeze({ call: review.call, review_hash: review.review_hash, status: "LOCAL_EXACT_CONTENT_CONFIRMED" as const,
    grants_payment_authority: false as const, limitation: "External signing still requires separately scoped human consent and an admitted wallet/runner." });
}
