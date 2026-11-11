# Remaining build audit — 11 November 2026

## Scope and actual checks

- Full-text scanned **79 tracked Markdown files**: **61 project documents** plus **18 duplicated dithercn skill/reference documents**. Dependency manuals, generated `.next` files and ignored private `.local`/tool records are not product specifications and were not treated as new requirements.
- Reconciled the direction brief, compatible original blueprint, current product/architecture/acceptance requirements, dated plans and latest BUILD_LOG against the actual Rust methods, browser action allowlists, routes, reader/report adapters, fixture coordinator and human purchase entry point.
- Fresh `npm.cmd run typecheck`, `npm.cmd run lint` and `npm.cmd run build`: **exit 0**. Build produces the existing eight app routes plus framework404/icon routes; no Replay Lab route exists.
- Fresh Node suites: **115 backend +216 frontend +306 NEAR-path =637 pass**, no failures/skips. Logs `.local/build-gap-{typecheck,lint,build,backend,frontend,near}.log`.
- The112 Chromium/32-view UI checks, exact21bf836 clean-web clone and147 Rust/SDK run are separately recorded prior results, not new runs by this audit. No public RPC, signature, key access, purchase retry, deployment, post or submission occurred.

**Finding:** the current Option C demo and public website are usable, but the originally specified fully operational owner/testnet application is not finished. Passing compilation or a polished page does not complete its missing workflow wiring.

## What is already built — do not rebuild it

- Rust projects/revisions, immutable Capsules/policies, provider-authenticated quotes, full commitment/resource duplicate checks, approvals, integer accounting, native transfer/private callbacks, owner unused-fund returns, evidence/task/acceptance records and bounded views.
- LOCAL SDK/Sandbox enforcement and fictional agency fixture workflow, validators, canonical report reducers and selected LOCAL exports.
- Testnet readback, purchase receipt/transfer/callback verification, exact owner/provider reviews, restricted key review, restricted one-send runner and durable unknown-attempt guards.
- Browser Gate simulations, LOCAL record import, receipts/intelligence, policy drafting workshop, optional narrow wallet bridge, public-source/site delivery and recent UI fixes.
- Four independently recorded FINAL public setup transactions. The retained purchase is signed-and-unresolved, not settled or confirmed failed.

## Actual implementation workstreams remaining

### 1. Finish owner controls and owner-return evidence

**Existing:** Rust and `src/lib/near/owner-review.ts` support the controls. **Missing:** `HUMAN_WORKSPACE_METHODS` and the external-wallet allowlist expose only setup, approve and three outcome methods. No browser control invokes:

- `set_project_status`
- `advance_project_revision`
- `set_provider_status`
- `set_capsule_paused`
- `revoke_capsule`
- `reject_purchase`
- `cancel_purchase`
- `close_capsule`

Build these as narrowly reviewed owner actions with current-state checks and clear financial consequences. This is frontend/signing wiring, not missing Rust authorization.

Also finish the **owner-return transaction observer**. `testnet-rpc.ts` observes purchases but has no equivalent complete native owner-transfer/private-refund-callback proof path. An unused-return preview or reported refund ledger cannot be called confirmed return. Preserve unknown/CLOSING state and never invent a refund/retry/release setter.

References: `contracts/runlatch/src/{projects,evidence,lib}.rs`, `src/lib/near/{owner-review,human-workspace,injected-wallet,testnet-rpc}.ts`, `docs/TESTNET_OWNER_OUTCOME_REVIEW.md`.

### 2. Complete the public purchase-to-outcome coordinator

**Existing:** `scripts/near/fixture-workflow.ts` prepares read-only provisioning/check/acceptance reviews, with synthetic rehearsal/tests. **Missing:** an admitted human-operated path connecting those reviews to exact signatures, readback and receipt/report completion after proven settlement.

Specific integration gap: the coordinator's settled predicate requires provider **`database-fixture`**, while the actual registered public quote uses **`db_demo_1108`**. It would reject the public demo even if its payment became proven. Rebind the coordinator to the exact registered public terms; do not remove canonical/provider checks or accept arbitrary substituted providers.

The human purchase entry point `demo-purchase-flow.ts` explicitly ends with provisioning/task/acceptance **NOT_RECORDED**. The coordinator is only called by its synthetic rehearsal/test harness, not that entry point.

Finish deliberate handling of the exact off-chain fixture bytes across stage handoff/restart. The current coordinator keeps them only in its closure and has no restart recovery. Do not regenerate different bytes/timestamps and claim they match an already-attested hash; no secrets or automatic sensitive persistence.

This work can be built/tested locally, but actual public outcome signatures still require separate human approval and observed settlement. The current unresolved attempt does not authorize them.

References: `scripts/near/{fixture-workflow,demo-purchase-flow,rehearse-fixture-workflow}.ts`, `src/lib/near/demo-operations.ts`, `docs/CONNECTED_FIXTURE_WORKFLOW.md`.

### 3. Connect verified testnet records to the product and client-report surfaces

**Existing:** `/testnet` can inspect captured purchases and read selected project snapshots. `/demo` and `/intelligence` support explicitly imported LOCAL records; canonical reducers and a LOCAL export CLI exist.

**Missing:** a distinct validated public-testnet source feeding the normal project/receipt/intelligence views. The LOCAL adapter deliberately rejects testnet-labelled records, and the generic testnet report reader always labels settlement unverified without transfer/callback readback. Join actual transaction evidence without relabelling LOCAL files or mapping a stored SETTLED string to proven payment.

The polished printable/downloadable report in `report-preview.tsx` uses `demoDisclosure`, not selected real records. Reuse that presentation/export for owner-selected canonical LOCAL or verified testnet data if delivering the full client-facing app. This is not a missing report reducer, nor a reason to build a client login/share-link service.

References: `src/components/runlatch/{run-intelligence,report-preview,contract-observation,testnet-workspace}.tsx`, `src/lib/near/{observation,testnet-rpc}.ts`, `scripts/workflow/export-project-local.ts`.

### 4. Build the dedicated Replay Lab

The requested separate Lab is not implemented as a route/workspace. Existing `/gate` simulations and Rust/Sandbox adversarial cases do not constitute that dedicated feature.

It should make the existing seven-case brief inspectable: quote/recipient tampering, expiry, replay, cumulative overspend, forbidden recurring terms, revoked authority and failed-transfer reconciliation/quarantine. Reuse the real rules/evidence, with original input, failed rule, whether money was attempted and final state. Keep LOCAL/SIMULATED/public sources explicit.

This remains separately deferred by the agreed ordering. This audit is not approval to start public adversarial sends or reuse the unresolved request.

### 5. Complete wallet hardening and real-extension validation

The wallet interface, one-click discovery/connection and exact transaction construction exist and pass synthetic tests; do not report them absent.

Remaining source-level hardening: the generic event-injected `signIn`, `signOut`, `getAccounts` and `signAndSendTransaction` promises have no local deadline/cancellation boundary. Meteor has its separate bounded exchange, but a never-resolving generic wallet can leave the workspace busy. Add bounded waiting/feedback while preserving any uncertain identity/consumed action and never enabling resend or broader-key fallback.

Real Meteor/compatible-extension account selection and an exact human-approved signing/readback flow remain unverified. Browser attempt guards are memory-only; reload/unknown-result handling is a disclosed limitation, not durable reconciliation. Verify or explicitly retain those limits rather than importing keys or adding a hosted signer.

References: `src/lib/near/{injected-wallet,meteor-wallet}.ts`, `src/components/runlatch/testnet-workspace.tsx`, `docs/CONNECTED_OWNER_APPLICATION_PLAN.md`.

## Public evidence still missing — not fixed by building another page

- Confirmed public purchase/native transfer/private callback.
- Public normal-path adversarial attempts.
- Public provisioning, objective check, explicit owner acceptance, completed Outcome Receipt/report.

Option C deliberately demonstrates four FINAL setup steps plus the unresolved attempt and uses LOCAL Sandbox for end-to-end evidence. It does **not** satisfy the original complete public-testnet vertical-slice definition.

The retained attempt cannot be re-signed/resubmitted/released on expiry. Any genuinely new authority/execution needs separately reviewed scope and human signatures; this audit grants none.

## Documentation consolidation still needed

Some active-looking Markdown is stale despite recent historical banners elsewhere. Examples:

- `contracts/runlatch/README.md` still says the contract/schema is not publicly deployed.
- `docs/WORKING_TESTNET_MVP_PLAN.md` still contains current-looking no-wallet/no-runner/absent-setup statements.
- `docs/CONNECTED_OWNER_APPLICATION_PLAN.md` still lists already-completed setup as remaining.
- `DIRECTION_CHANGE_PLAN.md`, initial PRODUCT/ARCHITECTURE headers and some helper/truth-map documents describe older stages.

Give those documents a current scope/status map while retaining dated results. Do not turn old “missing” statements into duplicate engineering tasks.

**Important correction:** `local-sequential-key.ts` rejects reuse of the same **Capsule/request pair** (`capsule equal AND request equal`), not every next call in the same Capsule. Earlier checkpoint prose overstated a need to change both individually. The coordinator already supports up to three distinct, freshly reconciled calls; it is not an absent allocator. This correction does not unlock the unknown first attempt: FINAL prior evidence is still mandatory.

## Verification/release backlog, not missing product code

- Real-extension approval; fresh complete all-mode Rust/WASM/Sandbox clean-checkout evidence (the latest passing clone is web-only).
- Manual Safari/iOS, physical-device/touch and screen-reader checks; current automated evidence is Chromium/axe, not universal accessibility.
- Existing artifact/platform-specific licence/notice gaps and provisional brand/asset limitations remain disclosed. A passing npm audit is not legal clearance.
- Human final review, actual video, X media post, eligibility/other-entry disclosure, payout/contact consent and exact single submission. These are not additional application features.

## Explicitly not mandatory build tasks

Paid LLM integration/general natural-language policy interpretation, automatic policy activation, real commercial database/hosting adapters, arbitrary live URL verification, client accounts/public share links, a marketplace, multi-tenancy/team RBAC, recursive agents, cross-chain/mainnet/fiat rails, renewals/cancellation, opaque reputation/analytics, catastrophic-recovery bypasses and optional generated imagery remain outside the baseline.

The local policy compiler/workshop is implemented; an optional LLM adapter and draft-to-deployable-Capsule handoff could be future improvements, not grounds to rebuild the existing Gate or claim authority from local approval.

## Suggested implementation order

Owner controls/return observer → exact public fixture/outcome handoff → verified project/receipt/report views → separately authorized Replay Lab → wallet hardening/real-extension verification and release QA. Keep Option C's unresolved attempt isolated throughout. No contract rewrite or new ecosystem integration is needed just because a historical Markdown plan mentions one.
