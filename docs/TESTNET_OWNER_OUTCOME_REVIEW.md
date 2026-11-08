# Owner controls and outcome actions — unsigned local foundation

**8 November 2026. The Working testnet MVP is not complete.** This dependency-free extension reviews eleven existing schema2 Rust calls. It does not sign, execute, broadcast, authenticate a wallet, deploy a contract or create public-network evidence. Replay Lab remains separately gated and unstarted.

## Exact supported actions

`createTestnetReader(target).readOwnerReview(action, artifact?, signal?)` admits only the selected operator/public key and fixed contract receiver. The strict envelope contains `method`, `args`, named testnet `signer_id`, public Ed25519 `public_key` and positive decimal-string `gas` up to 300 Tgas. Every reviewed call attaches exactly **1 yoctoNEAR**, not the purchase price, storage funding, gas cost or owner-return amount.

| Method | Review and effect boundary |
| --- | --- |
| `set_project_status` | Exact project ID/current `expected_revision` and enum status. Actual changes advance revision; same-status no-ops do not. Terminal projects cannot reopen. |
| `advance_project_revision` | Exact current revision; invalidates old mandates without modifying their immutable policies. |
| `set_provider_status` | Registered provider ID plus boolean active status. No publisher/recipient rewrite or quote mutation. |
| `set_capsule_paused` | Existing active/paused unexpired capsule. Resuming capsule status does not revive an old project revision or override Gate denials. |
| `revoke_capsule` | Existing active/paused/revoked capsule; expired revocation remains possible. Retains reservations, records and future commitments; cannot recall outgoing transfers. |
| `reject_purchase`, `cancel_purchase` | Only existing approval-pending request IDs. Stale/revoked authority does not prevent rejecting an unpaid request. No pending transfer is cancelled and no unrelated reservation is released. |
| `close_capsule` | Inactive or expired authority, no unresolved reservations, no already-closing/closed request. Shows **potential** unused owner return using the existing `available_to_commit` reducer. No transfer occurs during review. |
| `record_provisioning` | Exact request hash and previous-record hash/null; resolved payment ledger, bounded two-entry history, declared trust class/source/time and artifact/evidence hashes. A provisioned claim requires a settled ledger and artifact hash. Still an **owner-recorded off-chain attestation**, not a provider signature or settlement proof. |
| `record_task_check` | Exact policy/request hashes and canonical project/resource, supported fixed resource criteria, no prior outcome or pending settlement/refund. Recomputes the report from caller-selected bounded local artifact bytes using the existing validator. |
| `record_human_acceptance` | Existing resource outcome and current evidence-snapshot hashes plus explicit `ACCEPTED`/`REJECTED`. Does not change validation, payment or supplier obligations and is not client acceptance. |

These are the actual Rust method signatures, not illustrative blueprint actions. `close_capsule` is the only reviewed method which **could** schedule a separate unused-fund transfer if a human later signs it and the contract accepts current state. A returned amount, transaction hash or call success is not confirmed owner-return settlement. Unknown refund outcomes remain reserved/closing; no automatic retry, timeout release or new attempt is added.

## Bounded readback and freshness

The existing reader preflight pins allowed testnet RPC, final block, code hash, operator/schema/network and storage requirements. It reads the selected human public key at the same final block; only ordinary `FullAccess` permission with a safe nonce is reviewed. This is capability observation, **not** proof of control, authentication or signature consent. There is no key fallback, key store or secret input.

Project/provider actions take nine read-only RPC calls; capsule/request/outcome actions take ten. All retain the existing 40-call/1 MiB response/15-second request/60-second operation bounds. Capsule snapshots and a separately fetched project must agree. Strict typed IDs/hashes/amounts/times, owner/schema/policy/request/index bindings, evidence sources and refund state are checked. The existing canonical report reducer checks exact allocated/spent/reserved/returned/future sums; it is not replaced with a second payment-policy engine.

Action/context and optional artifact bytes are detached before asynchronous work. The shared bounded unsigned-review encoder rejects getters, non-JSON values, cycles, sparse arrays, extra fields and excessive sizes. Returned state is recursively frozen. Raw artifact bytes never go into RPC calls, returned reviews, URLs or journals.

`confirmFreshOwnerReview(original, fresh, {review_hash, consent:true})` requires two in-memory-issued reviews, matching exact call/state/key nonce/target/source, forward final-block/time and original expiry (at most 60 seconds; pause is also capsule-expiry bounded). Confirmation still returns `signing_enabled:false` and `grants_payment_authority:false`.

**Not every method has an on-chain optimistic state hash.** Project actions enforce `expected_revision`; provisioning/task/acceptance methods enforce their existing hashes. Pause/revoke/provider-status/close/reject/cancel signatures do not gain fabricated hash arguments. Fresh local review is not an atomic state lease; Rust re-checks the actual method predicates at execution, and intervening transactions can invalidate the review. This module adds no signing transaction or retry around that gap.

## Task and evidence honesty

For `record_task_check`, pass `{artifact: Uint8Array}` or explicit `{artifact:null}`. The reader captures at most 16 KiB in memory before its first await. `verifyResourceReport` recomputes exact manifest binding, fixture health/HTTPS flag and fixture route/body checks, artifact/evidence hashes and fixed criteria/version/status. A forged report, swapped file or asserted pass fails local review. A missing artifact can be explicitly `VALIDATION_ERROR`; failed/error checks never become success. Even a verified fixture report does not establish live hosting/database provisioning.

Provisioning reviews inspect declared hashes and canonical bindings but do **not** fetch provider URLs or recompute a provider signature. Acceptance reviews bind stored resource outcome/evidence hashes; accepting a failed objective result remains an independent human decision, not a rewrite of the check. Provisioning may later append one more record, leaving earlier acceptance historical/stale rather than silently updating it.

Ledger `SETTLED` is not independently confirmed by this module. Reviews always retain `UNVERIFIED_WITHOUT_TRANSACTION_TRANSFER_CALLBACK_READBACK`; actual payment claims must use the existing settlement observer and its transfer/private-callback checks. No artifact, owner decision or successful call overrides money facts.

This MVP seam explicitly declines snapshots with the legacy research `outcome` record. Existing research contract/importer/validator tests remain unchanged and pass; they are not silently reinterpreted as resource checks. Public wallet integration, full record-hash provenance verification, owner-return transaction observation and complete public workflow remain unfinished.

## Verification and remaining gate

27 new synthetic owner-review tests pass, included in **186/186 frontend Node** tests. **20/20 offline near Node**, **115/115 backend Node**, typecheck/lint/diff checks pass. The existing approved Linux Rust/SDK test command passes **147/147**, strict all-target Clippy and format; these are host mocks, not new Sandbox/testnet execution. Initial typechecks caught an inappropriate parser map callback and a test fixture's `unknown` refund typing; both were corrected without weakening security assertions. Exact commands and logs are recorded in BUILD_LOG.md section50.

No new package, lockfile, Rust contract, UI/layout, production build, browser/clean-checkout/Sandbox, public RPC-state run, secret, signature, key installation, public deployment, transaction, provisioning, publication or submission occurred. Root preview and `.next` remain untouched.

Next: finish the admitted Node-only restricted signing/execution path and fixture coordinator, then the human-wallet/interface integration with a fresh UI heads-up and its required QA. Present exact account/deployment/key/action/gas/funding scope for separate approval before public actions. The unresolved `near-seed-phrase` notice still blocks root SDK admission; no package was installed to evade it. Only actual separately approved public settlement/provisioning/check/receipt/report evidence can complete the Working testnet MVP.
