# LOCAL NEAR Sandbox harness

Development-only Rust executable, not an application service or a second contract. Separate dependencies keep node/RPC/signing tooling out of the contract artifact.

It starts near-sandbox2.14 on loopback only, generates unique in-memory test keys, creates funded LOCAL actors, and runs the actual compiled RunLatch WASM. No public RPC/mainnet/testnet endpoint or real credential is accepted. The library's default local genesis fixture is not a funded user wallet.

Checks cover successful native transfer/callback, exact pending approval, immutable quote/hash tamper denial, replay without overwriting, unused allocation return, an explicit missing named-recipient failed-transfer fixture, and expanded gas/failure/limit scenarios. This is tested-case evidence, not full-product acceptance or a security audit.

Final schema2 all-mode core/fault/outcome/maximum/scoped/research/project-commitment/agency regression and strict lint/format passed on7 November. Current default/fault hashes and140 Rust/114 Node results are in BUILD_LOG.md; historical samples below do not prove newer artifacts. Every reference is LOCAL_SANDBOX, not public testnet. Ephemeral actor secrets/signers never printed/saved; node fixture files belong to temporary local test identities.

Generated evidence: ignored `.local/sandbox/latest.json`; stdout summarizes callbacks/storage. Historical v1 full-index sample2.855TGas/51822 bytes does not prove schema2 bounds. Current capsule pre-funding262144 bytes covers additional bounded evidence; expanded tests measure actual growth separately from conservative synthetic unit envelopes.

Run from this approved Windows checkout:

```powershell
wsl --distribution Ubuntu-24.04 --user runlatch --exec sh /mnt/c/Users/David/RunLatch/scripts/setup/test-sandbox-linux.sh
```

Prerequisites: generate the local report fixtures with `npm.cmd run prepare:sandbox-reports`; build both native Linux artifacts with `sh scripts/setup/build-sandbox-artifacts-linux.sh`. On an existing Linux checkout with Node24+/Rust installed, use `npm run prepare:sandbox-reports` and `sh scripts/setup/test-sandbox-linux.sh`. No public signing or real funds. The independent lockfile pins300 development packages; API boundary fixes are recorded in BUILD_LOG.md.

Modes: `all`(default), `core`, `fault`, `maximum`, `outcome`, `scoped`, `workflow`, `projects`, `agency`, `diagnose-scoped`. None accepts public RPC/signers. Expanded `maximum` uses64 projects/capsules,96 commercial quotes, max scopes/IDs/accounts, three full histories including32 settled resources/64 synthetic provisioning events and3 owner decisions. It does not execute2048 histories or prove provider truth. `outcome` covers owner-recorded research PASS/FAIL/ERROR. `projects` covers stale authority, recurring review, commitment collateral, duplicates and failed contingent initial transfer.

Restricted tests use fresh finite0.25 NEAR gas allowance, one receiver/submit_purchase/zero deposit; gas allowance is not business budget. Some SDK pre-execution errors omit the specific protocol cause; no decoder/protocol rejection becomes a fabricated persisted contract denial. Legacy missing-key result.error is verified by bounded raw read-back. No broader-key purchase fallback.

Additional modes: `scoped`, `workflow`, `diagnose-scoped`. Diagnostic uses the same restricted signer and one loopback raw submission to retain a cause hidden by typed SDK errors. It is not a passing test or a broader-key retry. The workflow uses the installed Node runtime for a fixed validator script, no secret injection, provider-supplied command/URL execution or public signer.

Workflow mode runs successful/paid-incomplete/payment-failed cases with distinct provider accounts, service delivery only after final settled purchases, actual produced-byte Node validation, separate owner test-controller attestation/unused return and canonical receipts. It exports verified final-state facts for exact Node cost cohorts; FAIL/ERROR costs included, gas/storage/returns excluded. All three runs are LOCAL/SCRIPTED/controlled fixtures. No paid AI/vendor/independent validator claim.

## Primary fictional agency workflow

```powershell
wsl --distribution Ubuntu-24.04 --user runlatch --exec sh /mnt/c/Users/David/RunLatch/scripts/setup/test-sandbox-linux.sh agency
```

Do X -> see Y: three source-labelled scenarios: database+hosting settled70, resource check PASS/explicit owner ACCEPTED; database settled50 but provisioning/check FAIL/owner REJECTED; database transfer failed0, no fixture service call, check ERROR/owner REJECTED.300/50/20/240 are yoctoNEAR demo ratios, not fiat equivalents. Tamper/replay/duplicate/full-term adverse requests use the same restricted submit path. Scripted operator decisions exercise the owner API; they are not real client acceptance.

Each generated `.local/projects/<project-id>/` contains actual LOCAL canonical snapshots pinned to a final block plus `resource.json` when a service fixture ran, `receipt.json`, and selected `report.json`. These files are ignored, not served/uploaded. `latest.json` lists only current completed local cases; failed runs are not represented as passing.

```powershell
node scripts/workflow/export-project-local.ts <actual-generated-project-id>
node scripts/workflow/export-project-local.ts <actual-generated-project-id> --budget --expenses --evidence
```

Default export discloses neither balances nor rows/evidence. Flags are explicit local owner-test selections, not hosted access control. No account IDs/keys/prompts/private labels/artifact content/URLs are exported. The reducer verifies structured amounts/bindings/status/quote hashes and names its input observation source; it is not a trustless chain verifier. Review before sharing. No SaaS integration, external HTTPS/DB probe, invoice, FX, subscription cancellation or live-provider signature is claimed.
