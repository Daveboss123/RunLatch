# Exact run-cost cohorts

`analyzeRunCosts(serializedFacts)` is a bounded, dependency-free reducer, not a blockchain verifier or payment authorizer. It parses private JSON, validates64-or-fewer facts, integer-string money/time, ledger invariants and exact settled-provider breakdowns. It never fetches, signs, executes provider content or changes policy.

Completed cohorts require an owner-attested terminal PASS/FAIL/ERROR report, stopped authority and no pending purchase/refund. Unattested/active/missing/pending runs are excluded with counts/reasons. Source, network, contract, workflow, criteria hash, validator ID/version and asset separate cohorts; local/SIMULATED/testnet observations cannot silently mix. Supplied source/attestation labels still require upstream verification; result explicitly says DERIVED_FROM_INPUT_FACTS_NOT_INDEPENDENT_CHAIN_PROOF.

Cost per success = settled provider-purchase spend from **all completed runs**, including FAIL/ERROR, divided by passed completed runs. Gas, storage credit and owner returns are not purchase costs. No successes means unavailable/null, not zero/infinity. Totals and exact numerator/denominator are decimal strings/BigInt; floor_yocto is presentation-only, not payment authority. Sample, outcome counts, completion-time range and provider breakdown are exposed. No causal provider-quality or statistically conclusive claim.

Identical duplicate snapshots are deduplicated; conflicts fail closed, not silently resolved by arrival order. No database/indexer, charts, reputation or rule-change feature.

`npm.cmd run analyze:local` consumes the verified LOCAL workflow test's generated facts in ignored `.local/workflows/latest.json`, writes `.local/workflows/intelligence.json`, and prints the derived result. Run the actual workflow first; no placeholder output is invented. Unit tests use explicitly SIMULATED input, not chain evidence. tsc/browser checks remain separate.
