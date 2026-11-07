# Contract core — LOCAL, not publicly deployed

Rust `near-sdk = 5.30.0`, one operator, native NEAR only. `src/lib.rs` is the authenticated state/payment boundary; `src/gate.rs` evaluates canonical records; `src/model.rs` contains strict typed inputs and explicit lifecycle state; `src/hashing.rs` binds records with domain-separated Borsh/SHA-256. Unit results and runtime evidence are recorded in [BUILD_LOG.md](../../BUILD_LOG.md), not inferred from this API description.

## Authority and minimal methods

| Method | Caller and deposit | Effect |
| --- | --- | --- |
| `init(operator_id)` | Contract account, once | Fixed operator and binding network tag; tag alone does not prove RPC network |
| `create_project(project)` | Operator; exact project storage credit | Bounded opaque work order, immutable ceiling/expiry/criteria, revision1 |
| `set_project_status` / `advance_project_revision` | Operator;1 yoctoNEAR and exact expected revision | Invalidate prior mandates; never release outgoing payment/commitment |
| `register_provider(provider_id,publisher_id,recipient_id)` | Operator; exact provider storage credit | Pinned provider identity/recipient |
| `set_provider_status(provider_id,active)` | Operator;1 yoctoNEAR | Suspend/reactivate without changing terms |
| `publish_quote(quote)` | Registered publisher; exact quote storage credit | New immutable canonical quote, optional comparable prior-quote link |
| `create_capsule(capsule_id,policy,storage_credit)` | Operator; budget+separate sufficient storage credit, exact sum | Owner is authenticated operator, immutable policy/agent/key/hash |
| `set_capsule_paused(capsule_id,paused)` / `revoke_capsule(capsule_id)` | Operator;1 yoctoNEAR | Block future authorization; never release pending funds |
| `submit_purchase(proposal)` | Direct agent predecessor AND original signer/key;0 deposit | IDs and expected hash only; deny, await approval, or reserve/consume/schedule |
| `approve_purchase(capsule_id,request_id,expected_request_hash)` | Operator;1 yoctoNEAR | Exact eligible pending request; re-check current hard rules before reserving |
| `reject_purchase` / `cancel_purchase` | Operator;1 yoctoNEAR | End pending approval, which held no funds |
| `close_capsule(capsule_id)` | Operator;1 yoctoNEAR | Inactive authority/no pending R; derive unused amount, return only to stored owner |
| `record_validation(capsule_id,expected_policy_hash,report)` | Operator AND stored owner;1 yoctoNEAR | One bounded owner-attested off-chain report; exact policy/criteria, no pending settlement, stop purchases |
| `record_provisioning` | Operator;1 yoctoNEAR, exact request/prior record hash | At most2 source-labelled evidence records per resolved purchase; not a provider signature |
| `record_task_check` | Operator;1 yoctoNEAR, exact policy/request | Immutable fixed resource-fixture check; no payment changes or external-truth claim |
| `record_human_acceptance` | Operator;1 yoctoNEAR, exact outcome/evidence snapshot | Separate immutable owner decision; does not imply real client acceptance |
| `resolve_purchase` / `resolve_owner_refund` | Private contract callback with actual native-transfer promise context | Resolve once; no externally supplied settlement outcome |

Read-only views include bounded projects/records, `get_financials`, `get_provisioning`, `get_task_check`, `get_human_acceptance`, `get_evidence_snapshot_hash` and `get_capsule_report_snapshot`. Pin multiple views to one final block. Receipt separates canonical purchase, provisioning history, task result and explicit acceptance; later evidence can mark historical acceptance stale. RPC transaction/receipt references are joined off-chain, never invented by the contract. Preview grants no authority. No generic pay, policy editor/top-up or public settlement resolver.

Schema2 policy/proposal both bind project ID/revision. Quote includes canonical resource key and optional fixed commercial terms; changed terms need a new quote. Absent commercial terms explicitly means an all-inclusive one-time quote; recurring without bounded terms is denied. Quotes bind vendor/recipient/plan/fees/taxes/setup/cadence/term/source/cancellation references, never free agent-substituted fields. Auto-renew, unknown exposure and unsupported variable/introductory schedules are denied. Fixed recurring always requires exact owner review unless forbidden outright.

## Money and asynchronous state

All money is checked `u128` yoctoNEAR, decimal-string JSON; time is `u64` nanoseconds, decimal-string JSON. Always preserve:

```text
available_now = allocated - spent - reserved
available_to_commit = available_now - committed_future
spent + reserved + committed_future <= allocated <= original budget
allocated + confirmed returned = original budget
reserved = pending purchase amounts + pending owner refund
```

Scheduling produces **SETTLEMENT_PENDING**, not settled spending. Atomically hold due-now in R, future portion in C, claim the project/provider/plan/resource fingerprint and consume the quote. Success moves R to S, retaining C/resource; confirmed initial failure releases only that request's R/C and exact claim (supported fixture obligations are contingent on initial payment). Unknown/failed callback retains all. Timeout/revocation/UI error cannot release/resend. No recurring collector, cancellation or catastrophic recovery.

Owner return derives only A-S-C after no pending transfer; future collateral is not reclaimed. Confirmed return decreases net allocation/increases returned, never provider spend. Confirmed failure permits a fresh authenticated internal attempt; unknown callback retains CLOSING/R. Storage/gas are separate and not returned. Original capsule allocations remain charged to the immutable project ceiling even after funds return; no revolving/recursive delegation.

## Trade-offs

- One operator owns all capsules; not multi-tenant custody. Human-held deployment keys can replace code or move account funds; no immutable-custody promise.
- Policy/quote changes use new IDs and hashes. This deliberately omits in-place updates rather than broadening an already reviewed approval.
- Pending approval holds no money or quote; capacity can disappear before approval. All hard rules are re-checked.
- Quotes remain consumed after failed transfer; explicit retry needs new quote/request IDs.
- `sandbox-callback-starvation` is an explicitly named LOCAL test feature that sets callback gas to0.1TGas to force actual runtime failure. It adds no callable method or spending override. Default builds keep25TGas; **never publicly deploy the fault artifact**. Its code hash/evidence stays separate.
- Bounded pre-funded history:64 projects/capsules,3 providers,32 quotes/provider,32 requests/capsule,20-row pages. Schema2 capsule reserve262144 bytes includes provisioning/check/acceptance, separately from project8192/provider4096/quote8192 storage.25TGas callbacks; expanded measurements/regression status in BUILD_LOG, not a security guarantee.
- Structured business denials may persist. ABI/unauthorized panics roll back that receipt; no surviving denial is invented. Replay references, never overwrites, the original.

## Execute LOCAL tests in approved Ubuntu

From Windows project root:

```powershell
wsl --distribution Ubuntu-24.04 --user runlatch --exec sh /mnt/c/Users/David/RunLatch/scripts/setup/test-contract-linux.sh
```

This runs locked unit tests, strict all-target Clippy and format checking with native Linux caches. It never bypasses Windows Application Control. SDK mocks are not Sandbox or testnet receipts. Actual compiled-WASM runtime checks use the separate [Sandbox harness](../../scripts/sandbox/README.md); public deployment remains approval-gated.

### Negative-test artifact boundary

The non-default `sandbox-callback-starvation` feature deliberately gives callbacks0.1TGas for LOCAL catastrophic-failure tests. It adds no method, caller argument, authority bypass or settlement setter. **Never deploy it publicly or build public code with --all-features.** Normal builds use25TGas; scripts write native Linux outputs under `$HOME/.cache/runlatch-artifacts/production` and `/callback-fault`. Label the modified artifact explicitly; do not claim an external caller starved a default25TGas callback.

Official Linux cargo-near0.22 setup/build commands (from repository root):

```sh
sh scripts/setup/install-linux-cargo-near.sh
sh scripts/setup/build-contract-linux.sh production
sh scripts/setup/build-contract-linux.sh callback-fault
```

Installation checksum-verifies the official native Linux archive and retains licenses user-locally; it does not run the Windows executable or bypass Windows security. Compiler/protocol checks and wasm-opt stay enabled. Fault tests and public deployment remain separate.

## Outcome attestation boundary

The report is a <=4096-byte Borsh summary of the fixed research validator1.0.0: exact criteria hash/ID, artifact/evidence hashes, PASS/FAIL/ERROR, bounded counts and distinct sorted reason codes. Full artifacts, URLs, issue messages and private prompts stay off-chain. Owner identity and chain recording time are supplied by the contract, not report fields.

On-chain state proves **who attested the supplied report**, not that a checker ran honestly or that research is true. Evidence hashes need off-chain verification against the original report/artifact. The owner can attest inaccurate facts; there is no independent oracle. No outcome overwriting, policy/quote/payment mutation or automatic quality refund occurs. Pending reservations block completion; a closed capsule stays closed and historical revocation time survives reporting.

Schema2 uses distinct bounded maps for projects/resource claims/provisioning/checks/acceptance as well as retained research outcomes. This is an undeployed development schema, not a public migration. Tests deploy fresh local instances; production custody guarantees are not claimed.
