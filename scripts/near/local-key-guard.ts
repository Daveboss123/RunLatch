/** Shared one-shot anchor. LOCAL default; testnet opt-in requires an exact issued confirmation.
 * No secrets/network, release, stale-lock deletion or nonce retry. Sequential callers retain this anchor.
 */
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { lstat, mkdir, open, realpath } from "node:fs/promises";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { confirmFreshPurchaseReview, type PurchaseReview } from "../../src/lib/near/action-review.ts";
import { fail, id, time } from "../../src/lib/near/records.ts";
import { decodeBase58_32 } from "./base58.ts";
import { inspectSignedAgentEnvelope } from "./signature-envelope.ts";
import { assertSignedReview } from "./local-signed-review.ts";
import { assertRunnerNamespace, assertRunnerReview, type TestnetRunAdmission } from "./runner-admission.ts";

export interface LocalKeyLease { readonly key_guard_id: string; readonly nonce: string }
interface State { readonly review: PurchaseReview; readonly path: string; stage: number }
const samePath = (a: string, b: string) => process.platform === "win32" ? normalize(a).toLowerCase() === normalize(b).toLowerCase() : normalize(a) === normalize(b);

/** Namespace isolates tests only. It must never be changed to evade a previous marker. */
export async function createLocalKeyGuard(namespace = "working-mvp", admission?: TestnetRunAdmission) {
  id(namespace); assertRunnerNamespace(namespace, admission);
  const source = admission ? "RESTRICTED_TESTNET_ONE_SHOT_KEY_GUARD" as const : "LOCAL_ONE_SHOT_KEY_GUARD" as const;
  const publicExecution = admission ? "NOT_PROVEN" as const : false as const;
  const root = await realpath(fileURLToPath(new URL("../../", import.meta.url)));
  async function directory() {
    let path = root;
    for (const part of [".local", "testnet-mvp", "key-guard", namespace]) {
      path = join(path, part);
      try { await mkdir(path); } catch (error) {
        if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") return fail("KEY_GUARD_UNAVAILABLE");
      }
      const stat = await lstat(path);
      if (!stat.isDirectory() || stat.isSymbolicLink() || !samePath(await realpath(path), path)) return fail("UNSAFE_KEY_GUARD_PATH");
    }
    return path;
  }
  const base = await directory(), states = new WeakMap<LocalKeyLease, State>();
  async function write(path: string, data: unknown) {
    if (!samePath(await directory(), base)) return fail("UNSAFE_KEY_GUARD_PATH");
    const bytes = Buffer.from(`${JSON.stringify(data)}\n`, "utf8");
    if (bytes.byteLength > 16_384) return fail("KEY_GUARD_BYTE_LIMIT");
    const handle = await open(path, "wx", 0o600);
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  }
  return Object.freeze({
    async claim(review: PurchaseReview, confirmation: unknown, nowNs: bigint): Promise<LocalKeyLease> {
      assertRunnerReview(review, admission, "PUBLIC_KEY_COORDINATION_NOT_ADMITTED");
      confirmFreshPurchaseReview(review, review, confirmation);
      if (typeof nowNs !== "bigint" || nowNs < BigInt(review.reviewed_at_ns) || nowNs >= BigInt(review.expires_at_ns)) return fail("KEY_GUARD_REVIEW_EXPIRED");
      decodeBase58_32(review.action.public_key.slice(8)); decodeBase58_32(review.reviewed_block.hash);
      const nonce = time((BigInt(time(review.access!.nonce)) + 1n).toString());
      // Contract/request/revision/code/quote/endpoint changes cannot create a fresh slot for the SAME account key.
      const keyId = createHash("sha256").update(JSON.stringify(["runlatch.local-key-guard.v1", "testnet", review.action.signer_id,
        review.action.public_key])).digest("hex"), path = join(base, keyId);
      try {
        await write(`${path}.0.json`, { source, event: "KEY_CLAIMED", key_guard_id: keyId,
          nonce, reviewed_block: review.reviewed_block, target: review.target, action: review.action, review_hash: review.review_hash,
          public_execution: publicExecution, payment_evidence: "NOT_OBSERVED" });
      } catch { return fail("KEY_ALREADY_CLAIMED_OR_GUARD_UNAVAILABLE"); }
      const lease = Object.freeze({ key_guard_id: keyId, nonce });
      states.set(lease, { review, path, stage: 0 });
      return lease;
    },
    async capture(lease: LocalKeyLease, signedBytes: Uint8Array) {
      const state = states.get(lease) ?? fail("UNISSUED_KEY_GUARD_LEASE");
      if (state.stage !== 0) return fail("KEY_GUARD_STAGE_MISMATCH");
      const signed = inspectSignedAgentEnvelope(signedBytes);
      assertSignedReview(state.review, signed, admission);
      if (signed.transaction.nonce !== lease.nonce) return fail("KEY_GUARD_NONCE_MISMATCH");
      state.stage = -1; // Never reopen after I/O failure or concurrent capture.
      await write(`${state.path}.1.json`, { source, event: "SIGNED_IDENTITY_CAPTURED",
        key_guard_id: lease.key_guard_id, nonce: lease.nonce, transaction_hash: signed.transaction_hash,
        public_execution: publicExecution, payment_evidence: "NOT_OBSERVED" });
      state.stage = 1;
      return Object.freeze({ key_guard_id: lease.key_guard_id, nonce: lease.nonce, transaction_hash: signed.transaction_hash });
    },
  });
}
export type LocalKeyGuard = Awaited<ReturnType<typeof createLocalKeyGuard>>;
