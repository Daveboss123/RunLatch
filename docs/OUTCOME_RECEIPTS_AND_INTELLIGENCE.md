# Outcome Receipts and Run Intelligence

## Local, read-only implementation

Open `/intelligence` in the loopback app. Select generated `.local/projects/<project-id>/observation.json` files, or explicitly choose **Illustrative browser fixtures** and load the sample. These sources are never mixed automatically. Files stay in browser memory; there is no upload, persistence, RPC, signing, public explorer link or payment action.

Up to 16 files of 1 MiB each are accepted atomically. Invalid replacement clears old results. Clear/source changes invalidate outstanding reads. Identical snapshots do not double-count; conflicting snapshots are rejected rather than silently choosing one. Project selection and inclusive integer-nanosecond bounds recompute results from selected records. Finished runs use report-recorded time; unfinished runs use observation time. Empty or unavailable evidence is not a zero-cost success.

The LOCAL adapter checks internal consistency. Imported source/owner labels and hashes remain claims—not independent chain verification, authenticated provider evidence or proof of honest validator execution. The contract's `testnet` hash-domain tag is distinct from the isolated LOCAL execution network.

## Five lifecycle axes, plus acceptance

Each purchase receipt separates:

1. **Authorization:** recorded Gate decision and reason codes.
2. **Transfer submission:** matching native transfer receipt, scheduling without evidence, or not submitted.
3. **Settlement:** matched transfer outcome plus successful private callback, pending, failed, unverified, or not attempted. Inclusion/transaction IDs alone are insufficient.
4. **Task completion:** a final capsule-level task report was recorded, or no final report. Finished reporting does not mean passing.
5. **Task validation:** recorded PASS/FAIL/ERROR, exact validator/version/criteria and request/resource scope. Resource checks never silently apply to unrelated purchases.

Provisioning and explicit owner acceptance stay separate. Acceptance can be absent, rejected, accepted with matching evidence, or accepted against stale evidence. None is real client acceptance. Receipts retain capsule/project/quote/request IDs, policy version/hash, expected and canonical quote hashes, amount/provider, transaction/settlement/callback references, validator result/reasons/hashes, and relevant observation/recording timestamps. Missing submission timestamps are not synthesized from resolution time.

No browser control can release or resend a pending transfer, override DENIED, revise policy, reverse poor-quality payments or sign for the owner.

## Exact calculations and availability

- **Provider spend:** selected purchases with matching successful transfer and private-callback records, including unfinished runs. Ledger-reported spend without those records is excluded. This remains derived input evidence, not independently proven settlement.
- **Cost per successful run:** all eligible finished-run purchase spend—including failed/error costs—divided by passed finished runs. Shows exact integer numerator/denominator and whole-yocto floor. No passed run means unavailable, never infinity or zero.
- **Failed-run cost:** settled purchase spend from eligible FAIL and ERROR runs. Not reservations, gas, storage credit, commitments or owner returns; not a task-quality refund.
- **Eligibility:** owner-labelled, bound final report; stopped authority; no purchase/refund reservation or closing state; matched settlement evidence. Exclusions are shown. Source/network/contract/workflow/criteria/validator/version/asset separate cost cohorts.
- **Blocked attempts:** unique recorded transaction attempts by reason, including replay denials. One attempt may have multiple reasons; totals do not equal unique purchases. Missing attempt evidence is not invented.
- **Quote changes:** only a selected canonical `previous_quote_id` with comparable provider/recipient/service/category/resource/quantity/asset/recurring/commercial terms. Changed terms, absent predecessors or invalid chronology remain unavailable. No fictional history, trend, vendor reputation or causal quality claim.

All money uses checked decimal strings/BigInt and integer yoctoNEAR. Bar geometry uses exact bounded integer basis points separately. Illustrative samples have fabricated references and explicitly SIMULATED cost cohorts; they are not product results or execution evidence.

## Repeat the objective validator

With a selected bundle, expand **Repeat the objective fixture checks locally**, choose a canonical project/resource binding, and explicitly select the generated resource manifest (at most 16 KiB). The existing shared validator checks strict JSON fields, project/resource binding, fixture health 200/HTTPS flag, and `/health`/`ok` fixture values. Invalid UTF-8/JSON, duplicate keys, missing fields or failed checks cannot become a pass. Identical bytes, binding and selected observation time yield an identical evidence report.

This manual result is **UNATTESTED** and cannot overwrite the imported outcome, mark a run successful or change analytics. No website, database or provider URL is contacted. These checks do not establish external factual truth or guarantee a provider's work. Missing artifacts are ERROR; paid but invalid artifacts can be FAIL without reversing settlement. The research schema/count/URL-syntax validator remains a separate regression workflow.

## Reproduce and test

```powershell
npm.cmd run build
npm.cmd start
# Open http://127.0.0.1:3000/intelligence
# Select actual generated LOCAL observation files, or explicitly load illustrative fixtures.
npm.cmd run test:frontend
npm.cmd test
npm.cmd run test:browser -- tests/frontend/browser/intelligence.spec.ts
```

Do X → see Y: select the three existing agency bundles → one passed, one failed and one error run with source/time/sample labels; unselect the paid-failure project → its cost disappears from the numerator and its receipts disappear. Replace a canonical amount in a controlled test fixture with consistently recalculated terms/hash/ledger/transfer → provider spend and cost change. Omit callback evidence → unverified receipt and excluded cohort, not a fabricated success. The browser tests perform these checks; exact results and retained initial failures are in BUILD_LOG.md section44.

Without JavaScript, use the explicit [LOCAL contract read-back and project report commands](CONTRACT_OBSERVATION_DEMO.md); `npm.cmd run analyze:local` refers to the separate completed research-regression facts. No-JS does not activate a wallet. Actual-file browser cases skip honestly in clean checkouts without private artifacts.

No new package or contract authority was added. Desktop/mobile light/dark, keyboard, mask fallback and automated axe checks are bounded test evidence, not manual screen-reader, Safari/iOS, hardware performance, security-audit or full human visual approval. Public deployment/signing/publishing remain separately approval-gated.
