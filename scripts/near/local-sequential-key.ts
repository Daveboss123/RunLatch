/** Bounded LOCAL sequential demo coordinator. Original one-shot key guard is the permanent anchor.
 * No adoption of old claims, reset/release, stale-lock timeout, automatic reconciliation or network.
 */
import { Buffer } from "node:buffer";
import { lstat, open, realpath } from "node:fs/promises";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { confirmFreshPurchaseReview, type PurchaseReview } from "../../src/lib/near/action-review.ts";
import { fail, id, object, parseBoundedJson, time } from "../../src/lib/near/records.ts";
import { canonicalReviewContent as canonical } from "../../src/lib/near/review-content.ts";
import { createLocalKeyGuard, type LocalKeyLease } from "./local-key-guard.ts";
import { assertLocalSignedReview } from "./local-signed-review.ts";
import { inspectSignedAgentEnvelope } from "./signature-envelope.ts";
import { encodeUnsignedAgentTransaction } from "./transaction-codec.ts";
import { assertIssuedLocalReconciliation, localIdentityHash, parseLocalSignedIdentity, type LocalNonceReconciliation } from "./local-nonce-reconciliation.ts";

const MAX_RUNS = 3, SOURCE = "LOCAL_SEQUENTIAL_KEY_EXERCISE";
const samePath = (a: string, b: string) => process.platform === "win32" ? normalize(a).toLowerCase() === normalize(b).toLowerCase() : normalize(a) === normalize(b);
const digest = localIdentityHash;
interface LeaseState { stage: number; readonly review: PurchaseReview; readonly slot: number; readonly claimHash: string; readonly anchor: LocalKeyLease | null }

export async function createLocalSequentialKey(namespace = "working-mvp") {
  id(namespace);
  // Same directory/domain as legacy guard: a legacy one-shot caller and this coordinator cannot both bootstrap.
  const anchor = await createLocalKeyGuard(namespace);
  const root = await realpath(fileURLToPath(new URL("../../", import.meta.url)));
  const directory = join(root, ".local", "testnet-mvp", "key-guard", namespace);
  async function safe() {
    let path = root;
    for (const part of [".local", "testnet-mvp", "key-guard", namespace]) {
      path = join(path, part); const stat = await lstat(path);
      if (!stat.isDirectory() || stat.isSymbolicLink() || !samePath(await realpath(path), path)) return fail("UNSAFE_SEQUENTIAL_KEY_PATH");
    }
  }
  const path = (key: string, slot: number, stage: string) => join(directory, `${key}.seq.${slot}.${stage}.json`);
  async function read(filename: string): Promise<Record<string, unknown> | null> {
    await safe();
    let stat;
    try { stat = await lstat(filename); } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
      return fail("SEQUENTIAL_MARKER_UNAVAILABLE");
    }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16_384 || !samePath(await realpath(filename), filename)) return fail("UNSAFE_SEQUENTIAL_MARKER");
    const handle = await open(filename, "r");
    try {
      const opened = await handle.stat();
      if (!opened.isFile() || opened.size > 16_384 || opened.dev !== stat.dev || opened.ino !== stat.ino) return fail("UNSAFE_SEQUENTIAL_MARKER");
      const bytes = Buffer.alloc(16_385); let size = 0;
      while (size < bytes.length) {
        const next = await handle.read(bytes, size, bytes.length - size, size); if (!next.bytesRead) break; size += next.bytesRead;
      }
      if (size > 16_384) return fail("SEQUENTIAL_MARKER_LIMIT");
      return object(parseBoundedJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size)), 16_384));
    } finally { await handle.close(); }
  }
  async function write(filename: string, value: unknown) {
    await safe(); const bytes = Buffer.from(`${canonical(value)}\n`);
    if (bytes.length > 16_384) return fail("SEQUENTIAL_MARKER_LIMIT");
    const handle = await open(filename, "wx", 0o600);
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  }
  function keyId(review: PurchaseReview) {
    return digest(["runlatch.local-key-guard.v1", "testnet", review.action.signer_id, review.action.public_key]);
  }
  function reviewValid(review: PurchaseReview, confirmation: unknown, nowNs?: bigint) {
    if (review.transport_source !== "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE" || review.action.method !== "submit_purchase"
      || !review.access || !review.financials) return fail("PUBLIC_SEQUENTIAL_KEY_NOT_ADMITTED");
    confirmFreshPurchaseReview(review, review, confirmation);
    if (nowNs !== undefined && (typeof nowNs !== "bigint" || nowNs < BigInt(review.reviewed_at_ns) || nowNs >= BigInt(review.expires_at_ns))) return fail("SEQUENTIAL_REVIEW_EXPIRED");
  }
  async function chain(key: string) {
    const rows: { claim: Record<string, unknown>; signed: Record<string, unknown> | null; identity: ReturnType<typeof parseLocalSignedIdentity> | null }[] = [];
    let gap = false;
    for (let slot = 0; slot < MAX_RUNS; slot++) {
      const claim = await read(path(key, slot, "claim")), signed = await read(path(key, slot, "signed"));
      if (claim === null) { if (signed) return fail("ORPHAN_SEQUENTIAL_MARKER"); gap = true; continue; }
      if (gap || slot > 0 && !rows[slot - 1].signed) return fail("SEQUENTIAL_CHAIN_GAP");
      object(claim, ["source", "event", "key_guard_id", "slot", "transaction", "previous_signed_hash", "reconciliation"]);
      if (claim.source !== SOURCE || claim.event !== "CLAIMED" || claim.key_guard_id !== key || claim.slot !== slot) return fail("SEQUENTIAL_CLAIM_MISMATCH");
      const transaction = encodeUnsignedAgentTransaction(claim.transaction).transaction;
      if (digest(["runlatch.local-key-guard.v1", "testnet", transaction.signer_id, transaction.public_key]) !== key) return fail("SEQUENTIAL_CLAIM_MISMATCH");
      if (slot === 0 ? claim.previous_signed_hash !== null || claim.reconciliation !== null
        : claim.previous_signed_hash !== digest(rows[slot - 1].signed) || !claim.reconciliation
          || BigInt(transaction.nonce) !== BigInt(rows[slot - 1].identity!.transaction.nonce) + 1n) return fail("SEQUENTIAL_CHAIN_MISMATCH");
      let identity = null;
      if (signed) {
        object(signed, ["source", "event", "key_guard_id", "slot", "claim_hash", "identity"]);
        if (signed.source !== SOURCE || signed.event !== "SIGNED_IDENTITY_CAPTURED" || signed.key_guard_id !== key || signed.slot !== slot
          || signed.claim_hash !== digest(claim)) return fail("SEQUENTIAL_SIGNED_MISMATCH");
        identity = parseLocalSignedIdentity(signed.identity);
        if (canonical(identity.transaction) !== canonical(transaction)) return fail("SEQUENTIAL_SIGNED_MISMATCH");
      }
      rows.push({ claim, signed, identity });
    }
    if (rows.length) {
      const anchored = await read(join(directory, `${key}.0.json`));
      if (!anchored || anchored.source !== "LOCAL_ONE_SHOT_KEY_GUARD" || anchored.event !== "KEY_CLAIMED"
        || anchored.key_guard_id !== key || anchored.nonce !== object(rows[0].claim.transaction).nonce) return fail("SEQUENTIAL_ANCHOR_MISMATCH");
      if (rows[0].identity) {
        const captured = await read(join(directory, `${key}.1.json`));
        if (!captured || captured.event !== "SIGNED_IDENTITY_CAPTURED" || captured.key_guard_id !== key
          || captured.transaction_hash !== rows[0].identity.transaction_hash) return fail("SEQUENTIAL_ANCHOR_MISMATCH");
      }
    }
    return rows;
  }
  return Object.freeze({
    async lastIdentity(review: PurchaseReview) {
      reviewValid(review, { consent: true, review_hash: review.review_hash });
      const rows = await chain(keyId(review));
      if (!rows.length) return null;
      return rows.at(-1)!.identity ?? fail("PRIOR_KEY_ATTEMPT_UNRESOLVED");
    },
    /** An issued fresh reconciliation is supplied explicitly for EVERY advancement, including after restart.
     * Old files are an audit trail, never a persisted boolean that grants a new nonce.
     */
    forRun(prior: LocalNonceReconciliation | null = null) {
      if (prior !== null) assertIssuedLocalReconciliation(prior);
      const leases = new WeakMap<LocalKeyLease, LeaseState>();
      return Object.freeze({
        async claim(review: PurchaseReview, confirmation: unknown, nowNs: bigint): Promise<LocalKeyLease> {
          reviewValid(review, confirmation, nowNs);
          const key = keyId(review), rows = await chain(key), slot = rows.length;
          if (slot >= MAX_RUNS) return fail("LOCAL_SEQUENTIAL_RUN_LIMIT");
          const transaction = encodeUnsignedAgentTransaction({ ...review.call, nonce: time((BigInt(review.access!.nonce) + 1n).toString()), block_hash: review.reviewed_block.hash }).transaction;
          let anchorLease = null;
          if (slot === 0) {
            if (prior !== null) return fail("UNEXPECTED_PRIOR_RECONCILIATION");
            anchorLease = await anchor.claim(review, confirmation, nowNs);
            if (anchorLease.key_guard_id !== key) return fail("SEQUENTIAL_ANCHOR_DOMAIN_MISMATCH");
          } else {
            const last = rows.at(-1)!;
            if (!last.identity || !last.signed || prior === null) return fail("PRIOR_KEY_ATTEMPT_UNRESOLVED");
            assertIssuedLocalReconciliation(prior);
            if (prior.identity_hash !== digest(last.identity) || prior.access.nonce !== review.access!.nonce
              || canonical(prior.access) !== canonical(review.access) || canonical(prior.target) !== canonical(review.target)
              || prior.block.height > review.reviewed_block.height || BigInt(prior.block.timestamp_ns) > BigInt(review.reviewed_at_ns)
              || prior.block.height === review.reviewed_block.height && prior.block.hash !== review.reviewed_block.hash
              || prior.identity.transaction.receiver_id !== review.target.contract_id
              || prior.identity.transaction.args.proposal.capsule_id === transaction.args.proposal.capsule_id
                && prior.identity.transaction.args.proposal.request_id === transaction.args.proposal.request_id) return fail("SEQUENTIAL_RECONCILIATION_MISMATCH");
          }
          const claim = { source: SOURCE, event: "CLAIMED", key_guard_id: key, slot, transaction,
            previous_signed_hash: slot === 0 ? null : digest(rows.at(-1)!.signed), reconciliation: prior };
          try { await write(path(key, slot, "claim"), claim); } catch { return fail("SEQUENTIAL_SLOT_CLAIMED_OR_UNAVAILABLE"); }
          const lease = Object.freeze({ key_guard_id: key, nonce: transaction.nonce });
          leases.set(lease, { stage: 0, review, slot, claimHash: digest(claim), anchor: anchorLease });
          return lease;
        },
        async capture(lease: LocalKeyLease, bytes: Uint8Array) {
          const state = leases.get(lease) ?? fail("UNISSUED_SEQUENTIAL_LEASE");
          if (state.stage !== 0) return fail("SEQUENTIAL_STAGE_MISMATCH");
          const signed = inspectSignedAgentEnvelope(bytes); assertLocalSignedReview(state.review, signed);
          if (signed.transaction.nonce !== lease.nonce) return fail("SEQUENTIAL_NONCE_MISMATCH");
          state.stage = -1;
          if (state.anchor) await anchor.capture(state.anchor, bytes);
          const identity = parseLocalSignedIdentity({ transaction_hash: signed.transaction_hash, transaction: signed.transaction });
          await write(path(lease.key_guard_id, state.slot, "signed"), { source: SOURCE, event: "SIGNED_IDENTITY_CAPTURED",
            key_guard_id: lease.key_guard_id, slot: state.slot, claim_hash: state.claimHash, identity });
          state.stage = 1;
          return Object.freeze({ key_guard_id: lease.key_guard_id, nonce: lease.nonce, transaction_hash: signed.transaction_hash });
        },
      });
    },
  });
}
