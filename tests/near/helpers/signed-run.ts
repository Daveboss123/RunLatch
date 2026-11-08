/** Synthetic project + ephemeral signing only. No secret export, HTTP read or registered account. */
import { createLocalSigningExercise } from "../../../scripts/near/local-signing-exercise.ts";
import type { LocalReviewSigner } from "../../../scripts/near/local-review-signer.ts";
import { preparePurchaseReview } from "../../../src/lib/near/action-review.ts";
import { inspectRestrictedAccess } from "../../../src/lib/near/agent-access.ts";
import { parseTestnetTarget } from "../../../src/lib/near/testnet-target.ts";
import { buildProjectReport } from "../../../src/lib/reporting/project.ts";
import { encodeBase58_32 } from "../../../scripts/near/base58.ts";
import { reviewFixture, scope } from "../../frontend/helpers/action-review.ts";
import { target } from "../../frontend/helpers/testnet-evidence.ts";

export async function signedRunFixture(signer: LocalReviewSigner & { readonly public_key: string } = createLocalSigningExercise(), requestId = "database") {
  const data = await reviewFixture();
  const action = { ...data.action, public_key: signer.public_key, proposal: { ...data.action.proposal, request_id: requestId } };
  const access = inspectRestrictedAccess({ ...scope, public_key: signer.public_key }, parseTestnetTarget(target), data.key,
    { keys: [{ public_key: signer.public_key, access_key: data.key }, data.keys[1]] });
  const snapshot = { ...data.f.snapshot, capsule: { ...data.f.snapshot.capsule,
    policy: { ...data.f.snapshot.capsule.policy, agent_public_key: signer.public_key } } };
  const block = { ...data.f.context.block, hash: encodeBase58_32(new Uint8Array(32).fill(7)) };
  const report = await buildProjectReport(JSON.stringify({ source: "NEAR_TESTNET_OBSERVATION", contract_id: target.contract_id,
    network_tag: "testnet", block_hash: block.hash, project_id: snapshot.project.input.project_id, snapshots: [snapshot] }),
    { project_id: snapshot.project.input.project_id, budget: true, expenses: false, evidence: false });
  const context = { block, snapshot, quote: data.f.quote, provider: data.f.provider, access, financials: report.financials,
    transport_source: "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE" as const };
  const review = await preparePurchaseReview(target, action, context), confirmation = { consent: true, review_hash: review.review_hash };
  return { signer, data, action, context, review, confirmation, target: parseTestnetTarget(target) };
}
export function acknowledgeTransport(counter?: () => void): typeof fetch {
  return async (_url, init) => {
    counter?.();
    const request = JSON.parse(String(init?.body));
    // RPC acknowledgement only. The actual bytes/hash are inspected by callers in dedicated tests.
    return Response.json({ jsonrpc: "2.0", id: request.id, result: request.id.replace("runlatch-local-broadcast-", "") });
  };
}
