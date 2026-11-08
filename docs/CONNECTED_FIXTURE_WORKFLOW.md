# Connected database fixture workflow

**8 November 2026 — unsigned composition, not completed public-testnet execution.**

`scripts/near/fixture-workflow.ts` connects the existing read-only purchase observer, owner-action reviews, fixed resource validator, and selected project report. It does not add another Gate, wallet, signer, broadcaster, dependency, contract method, network transport or filesystem writer.

## What is connected

`createFixtureWorkflow(config, reader)` requires an explicit validated testnet target, original submitted transaction intent, owner public signing identity/gas, and one fixed fixture result (`PROVISIONED`, `FAILED`, or `MISSING`). It supports only the canonical `database-fixture` / `database-plan` / `booking-database` one-time, quantity-one purchase. Configuration is copied and bounded before reads. Injected readers retain their synthetic transport label.

1. **`reviewProvisioning()`** re-observes the original transaction through the existing receipt/actions/historical-code/state inspector. FINAL inclusion or a SETTLED ledger alone is insufficient: successful native-transfer and private-callback evidence are required. Failed, pending, denied, approval-pending and unavailable transactions stop before generating a fixture or owner review.
2. After that observation, generate at most one in-memory controlled manifest (or no artifact for `MISSING`). Bind project/resource/provider and observation time; reuse the exact bytes on later read-only reviews. Run the existing fixed manifest/health/route validator. Return an **unsigned** provisioning review with `DEMO_FIXTURE` trust. No database or HTTP endpoint is contacted.
3. **`reviewTaskCheck()`** re-observes payment and re-reads the owner snapshot. The exact provisioning evidence must already be recorded; a returned review does not count. Use the existing owner review to recompute the same report from the private in-memory bytes. Pending reservations still block final checking through the existing review rules.
4. **`reviewAcceptance(decision)`** requires an explicit `ACCEPTED` or `REJECTED` choice. Read current contract-issued task/outcome/evidence hashes; require the exact recorded fixture/check, then prepare the existing owner review from a fresh snapshot. No default choice, fabricated contract outcome hash, agent acceptance or signing consent is inferred.
5. **`readReceipt(disclosure)`** joins a fresh observed purchase with a later consistent selected snapshot/report. Separate Gate checks, transaction/native-transfer/private-callback references, fixture provisioning, locally recomputed task report and recorded owner acceptance. Preserve acceptance as stale when later evidence changes. A historical passing check can coexist with newer failed provisioning; neither reverses settlement. Budget/expenses/evidence flags are explicit: all false exposes no receipt, expenses or financials.

Each joined snapshot must match the exact observed purchase and transport and must not precede the payment read. Concurrent operations on one coordinator reject rather than race fixture generation. This busy flag coordinates local reads only; it is not a key/nonce/request claim and releases no money or authority.

## Ownership, privacy and limits

- The coordinator never applies owner actions or marks an unsigned review as recorded. An eventual admitted human signer must separately confirm and execute each existing exact action; then fresh contract readback supplies the next stage.
- Rust remains payment/authorization authority. No request, key, nonce, reservation, commitment or settlement record is changed by this module. No resend, re-sign, release or retry loop exists.
- Manifest bytes remain private in memory and are never sent to RPC, returned in the receipt, or written to disk. Only report summaries/hashes enter existing owner review arguments. No real keys, environment slots, provider code/URLs or external secrets are read.
- This coordinator has no restart/persisted-artifact recovery. A future approved run needs deliberate handling of the exact off-chain artifact; this module does not silently regenerate it from a claimed hash after restart.
- Injected RPC consistency tests are **not** contract execution, Sandbox evidence or public-testnet proof. Even HTTP readback is RPC-reported consistency, not a light-client proof or human consent. A fixture PASS is not live infrastructure provisioning, general project quality or client acceptance.
- Failed payment does not run this fixture. `FAILED`/`MISSING` modes describe delivery/check failure **after an evidenced successful payment**, never a refund or release.

## Reproduce without credentials or a network

```powershell
node scripts/near/rehearse-fixture-workflow.ts
node --test tests/near/fixture-workflow.test.ts
npm.cmd run test:near
```

The fixed rehearsal imports only synthetic test helpers, mutates only synthetic owner records, and emits `SYNTHETIC_FIXTURE_WORKFLOW_REHEARSAL`, `public_testnet:false`, `contract_execution:false`, `real_owner_acceptance:false`, and placeholder-reference warnings. Its nested reader is `INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE`. Expected test ledger: spent `50`, reserved `0`, available-to-commit `250` **integer yoctoNEAR**, with no fiat-equivalent claim. Synthetic acceptance is a fixed test choice, not a real human decision.

**Checks:** 13 new connected cases cover successful/failed/missing fixtures, unproven payments, ordering, explicit acceptance/disclosure, exact bytes, unchanged money, cancellation, busy reads, configuration/getter rejection, changed evidence, invalid stored records, and stale/mixed joins. Full near **108/108**, frontend **186/186**, backend **115/115**, typecheck/lint exit0. The first concurrent full run was **107/108**: an unchanged 300ms runner timeout test stopped safely before invocation instead of reaching its expected unknown-send state. The isolated full near rerun passed; this is observed timing sensitivity, not a permanent fix. Initial typecheck exit2 required explicitly parsing the union's optional block DTO; final check passed without casts or guard weakening.

No UI/build/preview/browser/a11y/new Sandbox/public-testnet run is implied. Existing LOCAL agency Sandbox flow remains separate regression evidence. Working testnet MVP still needs admitted public runner/reconciliation, a human signer/interface and exact approved accounts/deployment/key/actions/gas/funding, followed by observed public execution. Replay Lab remains separately gated after that MVP is complete.
