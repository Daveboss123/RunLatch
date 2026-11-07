# Direction-change implementation plan — 7 November 2026

Authority: [direction brief](RUNLATCH_PRODUCT_DIRECTION_CHANGE_BRIEF.md), read all1809 lines. This is an execution checklist, not another product specification. BUILD_LOG.md records verification.

## Audit finding

Existing tested foundation: immutable funded capsules/provider quotes, direct restricted identity, exact approval re-checks, checked native transfers/private callbacks, failure quarantine/unused return, bounded outcome attestation, research fixtures and exact cost cohorts. No frontend/deployed testnet contract. Git main has no commits/remotes; preserve all existing files.

Missing for the revised product: explicit project/revision binding; full commercial commitments; resource duplicates across different quote IDs; provisioning/check/acceptance axes; selected-scope project expense export; primary website/database fixture workflow.

## Ordered changes

1. Reconcile active product/architecture/design/acceptance/instructions/README/compliance. Retain original brief and dated results. Recheck live rules/APIs. No public action.
2. Extend contract security with bounded projects/revisions and project-bound policies/proposals. Add focused adverse tests before UI. Preserve account/key/quote/policy/settlement invariants.
3. Use one operator/organisation, opaque client references, immutable project ceiling and owner state updates. Keep sensitive labels/tasks off-chain. Allocate disjoint funded capsule budgets under one project ceiling; no recursive delegation or revolving returned-fund allocation.
4. Extend canonical quotes with explicit versioned commercial terms. Checked fixed-term calculation; unknown/unbounded terms denied; recurring requires exact approval by default. Immediate R and future C separate; per-purchase and commitment ceilings apply to the full exposure. Stable canonical resource identity, not AI similarity.
5. Preserve the tested native-transfer lifecycle. Add future commitment release only on confirmed failed initial transfer (fixture contract explicitly makes the obligation contingent on that transfer); successful/unknown transfers retain it. No automatic renewals or cancellation. Safe owner returns cannot withdraw retained commitment collateral.
6. Add bounded owner-recorded provisioning evidence and explicit human acceptance, independently of settlement and task-check report. Fixed local website/resource checker; no arbitrary URL execution. Owner anchors evidence, not an independent oracle.
7. Build primary fictional agency/database workflow and canonical read-only project report with explicit disclosure selection; research remains regression coverage. Add Replay Lab cases for stale project, full-term overspend, recurring approval and resource duplicate.
8. Only after foundations pass **and the human supplies the requested UI prompt**, deliver a fresh UI heads-up and implement the core interface under preserved Roster/dithercn identity. No reference/layout/scaffold work before that prompt. Re-run browser/accessibility/responsive/type/build tests. No empty module expansion.
9. Prepare repeatable public-testnet setup/run/release instructions. Request exact approval for public contract/accounts/signing/deployment/publication before executing them. No mainnet, secret files, public signer or fabricated evidence.

## Scope and migration

Version2 contract state/DTOs are a development change: no public deployment or live state exists. Rebuild and run fresh ephemeral Sandbox instances; never silently upgrade deployed state. Legacy research validators and evidence domains remain version1, with fixtures updated only for new authority fields. Native NEAR amounts, not fabricated dollar equivalents. AP2 mapping is deferred and unclaimed.

## Backend checkpoint

Steps1–7 implemented locally;140 Rust/SDK and114 Node tests plus final current-artifact all-mode LOCAL Sandbox/strict lint/format pass. Expanded max/bounds evidence is sampled, not exhaustive; older clean-source staging139/114 predates the last bounds fix and is not a Git clean-checkout proof. Not a full product/testnet/UI acceptance claim. The requested pre-UI compatibility audit found no installed frontend stack; global dithercn skill loads, engine installation is deferred (DESIGN.md section8). Steps8–9 remain governed by UI prompt and public/signing approval gates.
