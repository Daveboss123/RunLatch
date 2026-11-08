# Exact purchase review and restricted-access readback

**8 November2026 — local foundation only.** Part of the first [Working testnet MVP](WORKING_TESTNET_MVP_PLAN.md), not the deferred Replay Lab. No wallet, signing runner, public account or public execution is enabled by this milestone.

## Implemented

`createTestnetReader(target).readPurchaseReview(action, agentScopeOrNull)` returns a **strictly unsigned** purchasing review. Only `submit_purchase` and `approve_purchase` are supported. Arbitrary methods/actions, recipients, prices, attached deposits, policy overrides and secret fields are not accepted.

- The call shows named testnet signer/public key, exact contract receiver/method/args, decimal-string gas and deposit. Deposit is fixed at **0** for the agent and **1yoctoNEAR** for owner approval. It is not the canonical purchase price, storage credit or gas cost.
- One final-block preflight pins chain/code/operator/schema/network. The capsule snapshot and project view are checked together; the existing report reducer checks bounded indexes and integer ledger sums. The provider is selected from the registered quote, not agent-supplied identity/recipient fields. Canonical quote hash and provider binding are checked with the existing parsers.
- Review requires current active project/capsule authority, matching revisions, available unconsumed quote and unexpired authority/quote. Agent review requires the bound separate agent/key and restricted-key readback. Owner review requires exactly the existing `APPROVAL_PENDING` request/hash/policy/proposal/canonical terms, with no reservation or prior approver and unexpired approval.
- The display separates due-now, retained future authority and full bounded commitment using the existing integer commitment helper. **It does not evaluate the Gate's provider/service/price/quantity/budget/resource rules or grant approval.** Rust still rechecks and can deny at execution. No second policy engine was added.
- A local review hashes the exact call, target, canonical state, access readback and transport label. Its lifetime is at most60seconds and is shortened by authority/quote/approval expiry. This is not a lease on chain state.

`confirmFreshPurchaseReview(review, fresh, {review_hash, consent:true})` requires another immediate explicit read before a future signer uses the call. Same canonical state on a newer final block is allowed within the original lifetime; changed call/target/policy/project/request/quote/ledger/evidence/key nonce/allowance or transport label invalidates review. Expiry and backwards block/time fail closed. Reviews must be issued in this module's current in-memory lifetime; imported JSON/spread reconstructions are not accepted. Inputs/returned call, quote, key methods and block are copied/frozen. A WeakSet tracks issuance without retaining/exporting private runtime state.

This is **local exact-content confirmation**, not wallet authentication or a credential. Hashes are consistency markers, not proof of truth. A future wallet/runner must additionally enforce human external-action consent, issuer/role restrictions and single-call/no-retry semantics. The pure `preparePurchaseReview` helper is not a chain reader; only the reader combines it with pinned ledger readback.

## Restricted-agent access

`readRestrictedAgent(scope)` and agent purchase review check ordinary `view_access_key` and `view_access_key_list` at the same final block. Public scope contains separate named agent account, restricted Ed25519 public key, a distinct owner-selected recovery public key and decimal-string positive allowance cap. It contains no secret.

The exact key must match its listed record and allow **only `submit_purchase` on the selected contract**, with finite remaining allowance greater than0 and no greater than the supplied cap. An explicitly selected distinct `FullAccess` recovery key must remain present. Full-access agent keys, unlimited/null/zero/excess allowance, empty wildcard/extra/admin methods, wrong receiver, duplicate/missing/inconsistent records and unsupported gas-key lanes are rejected. The narrow fixture account is limited to8returned keys; a ninth row or continuation marker fails closed instead of walking an incomplete/unbounded list. Unsafe JSON-number nonces are rejected rather than rounded; accepted nonces are converted to strings.

This observes **RPC-reported key permission and recovery-key presence**. It does not prove who controls the recovery secret, guarantee gas sufficiency, install/remove a key or grant business spending authority. A key's allowance is gas allowance; Rust's purchasing rules remain mandatory. There is no fallback to an owner key, provider key, browser keystore or unlimited key.

## Current tests and limits

`node --test tests/frontend/action-review.test.ts` →20synthetic cases. `npm.cmd run test:frontend` →136passes; `npm.cmd test` →115passes; typecheck/lint pass. Key readback uses9bounded calls; agent review13; owner approval review11. Existing reader response/time/byte/cancellation limits remain. Source target parsing was moved unchanged into `testnet-target.ts` to avoid circular imports; existing RPC exports stay compatible.

Coverage includes wrong/unlimited/full/gas permissions, missing recovery, nonce/list bounds, mixed blocks, unsigned exact calls, separate deposit/price/future commitment, revisions/expiry/revocation, denial not becoming approval, fresh confirmation/stale context, changed nonce/allowance/gas/evidence, reconstruction/transport relabelling, getters/cycles/size bounds, cancellation and sanitized errors. All injected transport results are explicitly **not chain evidence**.

No dependency/lockfile, Rust, UI/layout, `.next` output, browser, SDK/Sandbox or clean-checkout execution changed. No public RPC-state query, wallet connection, signature or transfer was run. Remaining first-task work includes human-controlled project/capsule/provider/quote/attestation/acceptance action review, admitted wallet integration, the process-injected restricted signer and one-shot transaction identity handling, fixture vertical slice, browser/release tests and separately approved public execution/readback. Replay Lab has not started.
