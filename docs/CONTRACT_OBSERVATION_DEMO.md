# Contract-connected agent observation demo

## Implemented local boundary

The existing Rust Gate remains the authority. The scripted LOCAL agency harness registers database and hosting fixtures plus a separately labelled failed-payment fixture. Its scoped agent reads a registered quote and submits only project/revision, capsule, request, quote and expected quote hash. There is no arbitrary purchase receiver or amount argument.

The new `src/lib/near/` file adapter parses canonical quote/purchase DTOs, checks registry/quote hashes, verifies snapshot accounting through the existing project-report reducer, and joins recorded request identities to exported native-action outcomes. It does not contact a network, sign, upload, persist browser data, or independently certify an imported file. New harness/adapter verification is recorded in BUILD_LOG.md; this document alone is not execution evidence.

## Reproduction

Run the approved isolated LOCAL agency mode from the repository root, after the documented Sandbox prerequisites:

```powershell
wsl --distribution Ubuntu-24.04 --user runlatch --exec sh /mnt/c/Users/David/RunLatch/scripts/setup/test-sandbox-linux.sh agency
```

Each newly generated `.local/projects/<project-id>/observation.json` contains:

- The selected project's canonical capsule/report snapshot and registered quote/provider records, all pinned to one finalized block.
- Actual FINAL submit responses and inspected initiating, native transfer and private callback receipt IDs/outcomes, including replay responses that reference the original request.
- Explicit `LOCAL_NEAR_SANDBOX_OBSERVATION` and `public_testnet:false` labels. The contract's `testnet` hash-domain tag does **not** make the isolated node public testnet.

The harness runs the same frontend-safe parser against each new bundle. For an explicit local read-back:

```powershell
node scripts/web/inspect-local-observation.ts <actual-generated-project-id>
```

This emits a bounded summary, not keys, prompts or raw provider content. Generated files remain Git-ignored and are never served by Next.js.

In the local web preview, open `/demo#contract-observation` → select the generated `observation.json` → see canonical records, input-derived ledger amounts and separate payment/outcome evidence. The file is read only after explicit selection and stays in browser memory. Maximum size is1MiB; invalid replacements clear stale records. Clear discards pending read results and does not touch contract money or authority; it does not abort the browser's bounded file I/O. No upload, storage, automatic export, signer or RPC is present. Existing browser fixtures and callback walkthrough remain separate below this inspector.

Expand the provider catalogue for canonical commercial terms and hashes. Expand purchase records for recorded milestones, payment evidence, fixture provisioning, exact task checks and explicit owner outcome actions (not real client acceptance). Execution attempts retain replay denials separately from original purchases. The agent-draft helper supplies IDs and quote hash only; even a prepared draft is unsigned/unsubmitted and does not recheck current contract authority. Historical owner approval review always leaves signing disabled.

## Lifecycle and evidence rules

- `REQUESTED`, `AUTHORIZED`, `RESERVED` and scheduling are event milestones, not artificial timed durable states. Authorization/reservation/scheduling happen atomically in the initiating contract receipt.
- Approval-pending holds no money/quote/resource. Rejection, cancellation and stored expiry release nothing there. A read does not secretly write an expired record.
- `SETTLED` or `SETTLEMENT_FAILED` in the adapter's payment-evidence axis requires both the matching initial transfer outcome and a successful private callback, consistent with the canonical record. Missing callback evidence leaves `SETTLEMENT_UNVERIFIED`; reported ledger totals remain explicitly input-derived, not independently proven totals.
- Replay DENIED is an attempted execution referencing the unchanged original request, not a second settled/denied purchase or a second spend.
- Revoked is capsule authority, not a claim that an already scheduled payment was recalled. Timeout, expiry, revocation and browser error cannot release pending reservations or authorize a resend.
- Settlement, provisioning, task checks and explicit owner acceptance remain distinct. Controlled provider fixtures are not real commercial API vendors. Owner test-controller actions are not real client acceptance.

## Owner review and protected gates

`approvalReview` prepares exact request/hash, contract, owner, one-yocto deposit and canonical commercial exposure for a historical LOCAL observation. It rejects stale/revoked/expired/consumed bindings and **always** reports `signing_enabled:false`. This is not a wallet transaction or fresh authorization preview; the Rust contract must recheck at execution.

The official NEAR Connect owner-wallet pattern is the intended public-testnet boundary, subject to compatible package/API/CSP tests and exact human approval. It is not installed or connected in this checkpoint. No browser-generated agent key, full-access key import, hosted signer, owner-signature fallback, mainnet action or public deployment is enabled. Ask before any deployment or signature; no exact public target/run consent exists.

## Tests and remaining work

Frontend tests cover recipient/transfer tampering, expired quote review, duplicate transaction/replay preservation, cumulative accounting, revoked authority with retained payment, exact approval binding, confirmed failure versus missing callback, and strict bounded nested JSON/network labels. Seven additional contract SDK regression tests exercise the canonical mutating boundary. SDK mocks and synthetic parser fixtures are not Sandbox or public-testnet evidence.

Implemented browser tests cover adverse imports, exact unsigned review, stale/expired authority, memory-only clearing/replacement races, responsive light/dark/keyboard/axe and no-JS fallback. A separate actual-file case explicitly reads completed `.local/projects/latest.json` bundles and skips in clean checkouts without those execution artifacts. Actual commands, results and unrun checks are recorded in BUILD_LOG.md; test source alone is not proof of a pass. Full human visual review, public-testnet connector/deployment/signature consent and release gates remain unresolved.
