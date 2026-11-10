/** Exact native AddKey review for the single restricted demo agent key. No signer or key material. */
import { inspectAgentKeyInstallState, parseRestrictedAgentScope } from "./agent-access.ts";
import { count, enumValue, fail, hash, object, reference, time } from "./records.ts";
import { canonicalReviewContent as canonical, reviewContentHash as digest } from "./review-content.ts";
import { parseTestnetTarget, type FinalBlock } from "./testnet-target.ts";

const issued = new WeakSet<object>();
interface Context { readonly block: FinalBlock; readonly access_keys: unknown; readonly transport_source: "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE" | "EXPLICIT_TESTNET_HTTP_READBACK" }
export async function prepareAgentKeyInstallReview(inputTarget: unknown, inputScope: unknown, inputContext: Context) {
  const target = parseTestnetTarget(inputTarget), scope = parseRestrictedAgentScope(inputScope, target);
  const context = object(inputContext, ["block", "access_keys", "transport_source"]), block = object(context.block, ["hash", "height", "timestamp_ns"]);
  const reviewedBlock = Object.freeze({ hash: reference(block.hash), height: count(block.height, Number.MAX_SAFE_INTEGER), timestamp_ns: time(block.timestamp_ns) });
  if (reviewedBlock.height < 1) return fail("AGENT_KEY_REVIEW_BLOCK_INVALID");
  const state = inspectAgentKeyInstallState(scope, target, context.access_keys), expiresAt = time((BigInt(reviewedBlock.timestamp_ns) + 60_000_000_000n).toString());
  const action = Object.freeze({ type: "AddKey" as const, params: Object.freeze({ publicKey: scope.public_key, accessKey: Object.freeze({ nonce: 0,
    permission: Object.freeze({ receiverId: target.contract_id, allowance: scope.max_allowance, methodNames: Object.freeze(["submit_purchase"]) }) }) }) });
  const call = Object.freeze({ network: "testnet" as const, signer_id: scope.agent_id, public_key: scope.recovery_public_key,
    receiver_id: scope.agent_id, contract_id: target.contract_id, action });
  const transport = enumValue(context.transport_source, ["INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE", "EXPLICIT_TESTNET_HTTP_READBACK"]);
  const stateHash = await digest({ target, scope, state }), reviewHash = await digest({ domain: "runlatch.agent-key-install-review.v1", call, state_hash: stateHash, expires_at_ns: expiresAt, transport_source: transport });
  const review = Object.freeze({ source: "UNSIGNED_EXACT_AGENT_KEY_INSTALL_REVIEW" as const, target, scope, call, state,
    reviewed_block: reviewedBlock, reviewed_at_ns: reviewedBlock.timestamp_ns, expires_at_ns: expiresAt, state_hash: stateHash, review_hash: reviewHash,
    transport_source: transport, signing_enabled: false as const, grants_payment_authority: false as const,
    limitation: "Unsigned native AddKey review only. The key pays gas for submit_purchase on one Gate; Rust still enforces every business rule. Wallet signing and final permission readback remain separate." });
  issued.add(review); return review;
}
export type AgentKeyInstallReview = Awaited<ReturnType<typeof prepareAgentKeyInstallReview>>;
export function confirmFreshAgentKeyInstallReview(original: AgentKeyInstallReview, fresh: AgentKeyInstallReview, confirmation: unknown) {
  if (!issued.has(original) || !issued.has(fresh)) return fail("UNISSUED_AGENT_KEY_REVIEW");
  const value = object(confirmation, ["review_hash", "consent"]);
  if (value.consent !== true || hash(value.review_hash) !== original.review_hash) return fail("EXACT_AGENT_KEY_CONFIRMATION_REQUIRED");
  if (canonical(original.call) !== canonical(fresh.call) || original.state_hash !== fresh.state_hash || original.transport_source !== fresh.transport_source)
    return fail("AGENT_KEY_REVIEW_CHANGED");
  if (BigInt(fresh.reviewed_at_ns) < BigInt(original.reviewed_at_ns) || BigInt(fresh.reviewed_at_ns) >= BigInt(original.expires_at_ns)
    || fresh.reviewed_block.height < original.reviewed_block.height) return fail("AGENT_KEY_REVIEW_STALE");
  return Object.freeze({ status: "LOCAL_EXACT_AGENT_KEY_CONTENT_CONFIRMED" as const, call: original.call, review_hash: original.review_hash,
    signing_enabled: false as const, grants_payment_authority: false as const });
}
