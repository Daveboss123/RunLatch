# RunLatch

**Project-bound purchasing authority and outcome accountability for AI-powered businesses.** Give an agent a job, not a blank cheque.

RunLatch is a prototype for small AI-native agencies that let software agents buy project resources. A **Client Work Capsule** gives one project task a bounded budget, one agent, an approved provider/service scope and an expiry. The project-bound **Gate** checks a canonical, provider-published quote and the full commitment in Rust before reserving anything. **Outcome Receipts** keep approval, settlement, provisioning, objective checks and explicit human acceptance separate.

**Status: local prototype with four FINAL NEAR testnet setup transactions; one signed purchase is unresolved, so no public testnet settlement, provisioning or acceptance is claimed.** Product previews use `BROWSER_FIXTURE` and never sign, reserve or transfer. The optional `/testnet` owner workspace routes exact human-reviewed actions to an external wallet; it holds no private key and is not needed for the recorded demo. Real-extension approval remains unverified and further wallet work is deferred. The LOCAL Sandbox agency workflow is reproducible. On testnet a human completed four separately reviewed setup transactions: a 0.30 NEAR work order, one task Capsule, one one-use 0.05 NEAR quote and a submit-only restricted key. One purchase was then signed exactly once by that restricted key and had no on-chain record in three independent read-only checks recorded on 11 November; it stays fail-closed and is never resent, re-signed or released. Read [the exact remaining testnet plan and approval gate](docs/TESTNET_VERTICAL_SLICE_PLAN.md).

NEAR HACKATHON 2026 project. Tracks this fits: **security** (primary) and **agents** (the workflow it actually supports). `business` is a possible secondary track if procurement for AI-native studios is accepted as a business use case.

## Problem and target user

A small AI studio wants an agent to buy a database, hosting or API credit for one client project. The studio does not want to hand the agent an unrestricted wallet. A normal payment API checks a balance; it does not enforce which project, provider, recipient, price, quantity, expiry, recurrence or future obligation the agent is allowed to commit to. RunLatch makes that authority explicit and machine-checkable, then records what happened without pretending payment proves delivery.

Target user: a 2-10 person AI-native software/automation agency that delegates recurring infrastructure purchases for client work. The demo operator is fictional ("Northstar Studio") and the client project is a fictional booking website. This is an unvalidated beachhead hypothesis, not a customer claim.

## Architecture

```text
Human owner / operator                     Restricted agent
        |                                        |
        | creates project + capsule              | submits one purchase
        | approves above threshold               | (no deposit, no owner methods)
        v                                        v
+-----------------------------------------------------------------------+
|  Rust Gate contract (NEAR, schema 2)                                  |
|  project revision -> capsule + immutable policy                       |
|  provider registry -> canonical quote (publisher/recipient/terms)     |
|  identity -> budget -> full commitment -> reservation -> transfer     |
|  private callback -> settlement -> Outcome Receipt                    |
+-----------------------------------------------------------------------+
        |                    |                         |
        | native NEAR        | private callback        | read-only views
        v                    v                         v
  canonical recipient   resolve once, fail closed   LOCAL observation JSON
                                                         |
                                    +--------------------+--------------------+
                                    |                                         |
                              Browser preview                         Run Intelligence
                              BROWSER_FIXTURE                         imported records
```

- **On-chain (Rust):** project and revision, capsule and immutable policy, provider registry, canonical quotes, purchase decisions, reservation/future commitment, native transfer scheduling, private callback result, Outcome Receipt, provisioning/check/acceptance attestations and bounded message records.
- **Off-chain:** the model prompt, full task artifacts, provider service data, report rendering and the human's acceptance decision input. Only bounded hashes/attestations are recorded. A hash detects change; it does not prove truth or confidentiality.

## Execution modes

Every money or policy surface uses one canonical label:

| Mode | Meaning | Allowed claim |
| --- | --- | --- |
| `BROWSER_FIXTURE` | Seeded values and TypeScript preview. No contract call, signer, transfer or payment. | Illustrative UI and policy paths only |
| `LOCAL_SDK_TEST` | Rust contract tests with mocked host promise outcomes. | Contract logic under documented test-harness assumptions |
| `LOCAL_SANDBOX` | Isolated Local NEAR Sandbox execution. Not public testnet. | Local runtime behaviour under the recorded test setup |
| `NEAR_TESTNET` | Observed public testnet account/transaction reference. | Only the exact observed public references |

Product previews use **BROWSER_FIXTURE**; explicitly imported backend records use **LOCAL_SANDBOX**, not that fixture label. `/testnet` separately displays recorded **NEAR_TESTNET** setup references and a retained signed-attempt identity. The four setup transactions are FINAL; the purchase has no observed on-chain record. Neither its hash nor the source label proves settlement, provisioning, an objective check, acceptance or a report.

## Prerequisites and clean checkout

- Node.js **24.20.0 or newer** and npm 11 (the repository was tested with Node 24.20.0 / npm 11.19.0).
- A browser for the Next.js app.
- Rust **1.95+** for the contract tests. On Windows the recorded path uses WSL Ubuntu-24.04; on Linux/macOS a normal Rust toolchain works.
- No wallet, private key, `.env` file, RPC credential or paid service is needed for the local demo.
- Playwright browsers for the browser suite: `npx.cmd playwright install chromium` (Windows) or `npx playwright install chromium`.

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run test:frontend
npm.cmd run test:near
```

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run test:frontend
npm run test:near
```

Observed 11 November 2026 with the current source:

```text
typecheck   exit 0
lint        exit 0
npm test                 115 tests, 115 pass, 0 fail
npm run test:frontend    216 tests, 216 pass, 0 fail
npm run test:near        306 tests, 306 pass, 0 fail
npx playwright test      108 tests, 108 pass, 0 fail
```

Run the app:

```powershell
npm.cmd run dev
```

Open `http://127.0.0.1:3000`. The demo server binds to `127.0.0.1` only and needs no environment variables.

Browser suite (the dev server must be running):

```powershell
npx.cmd playwright test
```

Observed 11 November: **108 Playwright tests pass**, including axe accessibility checks, keyboard paths, reduced motion, no-JavaScript fallback, responsive layouts at 320-1440 px, printable-report isolation and pre-hydration input protection. Wallet tests use synthetic extension/RPC replies, not real wallet approval. These checks are Chromium evidence, not a universal accessibility or real-device certification.

### Rust contract tests

The repository records both a direct Cargo path and the Windows/WSL helper:

```bash
cargo test --locked --manifest-path contracts/runlatch/Cargo.toml
cargo clippy --locked --all-targets --manifest-path contracts/runlatch/Cargo.toml -- -D warnings
cargo fmt --manifest-path contracts/runlatch/Cargo.toml -- --check
```

```powershell
wsl --distribution Ubuntu-24.04 --user runlatch --exec sh /mnt/c/Users/David/RunLatch/scripts/setup/test-contract-linux.sh
```

Re-run 11 November: **147 Rust tests pass**; strict Clippy and format pass, all exit 0 in the approved WSL environment. These are SDK/unit tests with mocked host outcomes. They are not Sandbox or testnet execution. The agency Sandbox result below is the separately recorded 9 November run, not a new run inferred from the Rust tests.

### LOCAL Sandbox golden path

```powershell
npm.cmd run prepare:sandbox-reports
wsl --distribution Ubuntu-24.04 --user runlatch --exec sh /mnt/c/Users/David/RunLatch/scripts/setup/test-sandbox-linux.sh agency
```

Observed 9 November 2026:

```json
{"result":"AGENCY_WORKFLOW_CHECKS_PASSED","public_testnet":false,"source":"LOCAL_NEAR_SANDBOX_SCRIPTED_AGENCY_WORKFLOW","runs":[
{"scenario":"pass","payment_status":"SETTLED","settled_spend":"70","task_check_status":"VALIDATION_PASSED","human_decision":"ACCEPTED","fixture_service_calls":1},
{"scenario":"provision-fail","payment_status":"SETTLED","settled_spend":"50","task_check_status":"VALIDATION_FAILED","human_decision":"REJECTED","fixture_service_calls":1},
{"scenario":"payment-fail","payment_status":"SETTLEMENT_FAILED","settled_spend":"0","task_check_status":"VALIDATION_ERROR","human_decision":"REJECTED","fixture_service_calls":0}]}
```

Evidence is written to `.local/projects/latest.json` and per-project observation files. This is isolated local runtime evidence, not public testnet proof.

## Do X -> see Y

### 0. Read the recorded testnet setup (`NEAR_TESTNET`)

1. Open `https://runlatch.vercel.app/testnet` or local `/testnet`. The first section lists five rows: work order, Capsule, canonical quote and restricted key as **FINAL**, and the purchase attempt as **UNRESOLVED**, each with the recorded transaction hash and FINAL block height (or "none observed").
2. Verify any hash independently through a public testnet RPC or explorer. The page and this README repeat recorded observations; they are not a light-client proof.
3. In the original operator checkout with its retained local journals, run `node scripts/setup/human-db-purchase.ts --check`. The 11 November check returned the same intent/transaction identity, `submission UNAVAILABLE` and `payment_evidence SETTLEMENT_UNVERIFIED`. Later output depends on actual readback; the command loads no key, signs nothing and sends nothing. A clean checkout has no private journals and must not fabricate them or run the default signing command to reconstruct this attempt.

The same page also hosts an optional owner workspace for wallet-held testnet accounts: explicitly load the target, connect a compatible extension, prepare one exact action, and review signer/key, receiver, method, arguments, gas and deposit. A matching account/key and confirmation are required, with a fresh final-block reread before the external wallet prompt. No real-extension approval is claimed. The recorded purchase used the human's own terminal and restricted agent key; no browser wallet is required to read the ledger.

An external wallet prompt is a human action. A returned transaction hash is not settlement or Outcome Receipt evidence. The connected account/key must already be held by the wallet. Existing demo accounts held only in Windows Credential Manager use `scripts/setup/human-demo-operation.ts` instead; never paste or import those credentials into the app.

Creating a new exact owner action still needs separate approval and a human signature. The earlier `project_demo_1108` expired on 10 November without allocation or purchases; the follow-up `project_demo_1110` is the work order recorded above. All four recorded setup defaults and the purchase default are permanently consumed/readback-only. Do not repeat creation, install another key, replace IDs or use an owner/recovery purchase to bypass the unresolved attempt.

### 1. One eligible request (`BROWSER_FIXTURE`)

1. Run `npm.cmd run dev` and open `http://127.0.0.1:3000/gate`.
2. Leave **Database - one-time** selected and click **Valid request**.
3. See **Eligible in simulation** / **Inside the boundary.**, **Passed checks 29 of 29**, **Reservation attempted: No**, **Transfer attempted: No**, **Outcome Receipt created: No**, and `BROWSER_FIXTURE` provenance.
4. The panel states that a real Rust approval would reserve 0.50 NEAR before scheduling a transfer. The browser does neither.

### 2. One tampered request (`BROWSER_FIXTURE`)

1. On `/gate`, click **Alter recipient**.
2. See **Request denied**, the failed rule `QUOTE_TERMS_MISMATCH`, **No new reservation or commitment**, and no transfer or receipt.
3. Click **Over budget** to see `INSUFFICIENT_AVAILABLE_BUDGET`, or **Concurrent request** to inspect an illustrative interleaving: two 1.30 NEAR requests each fit 2.30 NEAR alone; after the first reservation, the later request sees 1.00 and is denied. This browser fixture does not send two requests. Rust tests enforce atomic reservation.

### 3. The same boundary in Rust (`LOCAL_SDK_TEST`)

```powershell
wsl --distribution Ubuntu-24.04 --user runlatch --exec sh /mnt/c/Users/David/RunLatch/scripts/setup/test-contract-linux.sh
```

Look for these passing tests:

- `g02_proposed_wrong_identity_or_key_is_denied`
- `g02_actual_submit_requires_exact_runtime_account_key_and_zero_deposit`
- `a05_only_owner_deposit_capable_action_can_approve_reject_or_cancel`
- `a09_hard_denial_cannot_be_overridden_by_exact_owner_hash`
- `s05_external_caller_cannot_forge_callback_success`
- `p16_p18_agent_cannot_record_provisioning_task_check_or_human_acceptance`
- `c05_owner_or_provider_account_cannot_be_the_agent`

See [docs/AGENT_BOUNDARY_PROOF.md](docs/AGENT_BOUNDARY_PROOF.md) for the full code-to-test map.

### 4. Inspect an Outcome Receipt (`LOCAL_SANDBOX` records)

1. Run the LOCAL Sandbox agency workflow above.
2. Open `http://127.0.0.1:3000/demo` and choose a generated file such as `.local/projects/<project-id>/observation.json`.
3. Select a purchase in the local contract inspector. Approval, payment, provisioning, objective check and human acceptance are shown as separate states.
4. Open `http://127.0.0.1:3000/intelligence` and choose **Choose LOCAL files**, then select one or more `observation.json` files. The page shows provider spend, cost per successful run where a denominator exists, failed-run cost, blocked reasons, quote history, selected-snapshot ledger position and Outcome Receipts. Ledger totals are unfiltered snapshot sums after duplicate/conflict checks, not necessarily the whole project.
5. Missing evidence stays **Unavailable** or **Not recorded**; it is never shown as zero, passed or accepted.

Imported records are read in memory only. Nothing is uploaded, saved or authenticated by the browser.

## Testnet status

| Item | Status |
| --- | --- |
| Network | NEAR testnet only |
| Gate contract | Deployed and initialized: `gate.runlatch-demo-1108.testnet`, schema 2, code hash `F1pev22VSu86qxxWicXpCixtzzNoQxEi1FHRF2eGXjGP`, deployment transaction `23jZ77SEAK3b4YwW6EjanToSSt1XtbCvvgTPxFXYJqg6` |
| Original Project | `project_demo_1108`, stored ACTIVE revision 1, **expired 10 November 18:35 UTC**, allocation 0 and no Capsules; transaction `BU2DMrx9gi3zTTzcybvjuCp5Zm9HQdpoP96SLafjvTnB`, retained and never repeated |
| Current Project | Recorded 11 November: `project_demo_1110`, stored ACTIVE revision 1, 0.30 NEAR ceiling, allocated authority 0.30 NEAR, one Capsule; FINAL transaction `FMKZhn3JU6k7KxEE9BLezanQoZmHufCHrrqHwSZudBza`, block 277134275. Fixed expiry: 12 November 18:00 UTC; stored ACTIVE is not authority after expiry |
| Funded Capsule | `capsule_demo_1110`, ACTIVE, allocated 0.30 NEAR, spent/reserved/future commitments 0, separate 2.62144 NEAR storage. FINAL creation transaction `AeNBkfXrftqN85JEFgJAwXdnHnbr4Nb8A65ysi4drKKj`, block 277134741; funding is not a database purchase |
| Database provider | `db_demo_1108`, active, immutable publisher/recipient `db.runlatch-demo-1108.testnet`, quote count 1; registration `5DnrDArTCEN8rGaDCAqacX2CmxvCymYozNam7iys4DLu` |
| Canonical quote | `db_quote_demo_1110`, 0.05 native NEAR all-inclusive one-time, quantity 1, hash `ae846302dbae490ba2352bbce89162821b8882a9c237903f97692ad9007231a3`, unconsumed; FINAL publication `2TYs5yEFkjFRWiAMTuMqETQ2FosvoaLZnKhjRZEWF1Pn`, block 277136000. Publication is not purchase approval or payment |
| Restricted key | Ordinary function-call key installed and independently FINAL: `H4cqJTWvx2GvSAaFMPt4JUjPk2EvrjsbpoYUuLfWufMK`, block 277138478; `agent.runlatch-demo-1108.testnet`, Gate-only `submit_purchase`, finite 0.05 NEAR gas allowance; human recovery retained. No purchase authority outside Rust |
| Purchase attempt | Signed exactly once by the restricted key: transaction `3N98awqyrxUbGqA7zGVsZtpT28pmdJf5j2cdXR8c3GkP`, nonce `277138475000001`, 100 Tgas, zero deposit, signed block height 277143147, last valid 277229547. Three independent checks recorded 11 November (FastNEAR, official NEAR RPC, NEAR Blocks v3) found **no on-chain record**; the recorded contract snapshot showed 0.30 NEAR available with no spend, reservation, request or consumed quote. **Unresolved, not failed and not settled**; validity expiry releases no local claim |
| Settlement, callback, provisioning, check, acceptance, report | **NOT_RECORDED** - each needs observed settlement evidence, which does not exist |

The recorded ledger supports four RPC-reported setup transactions, not a completed purchase, delivery or acceptance. Do not read deployment or recorded zero-spend state as proof the unresolved transaction can never execute. Verify any reference through a public testnet RPC; this README does not assert a light-client proof.

The human separately approved one exact 0.05 native purchase after setup. [Restricted-only human terminal scope](docs/DEMO_DB_PURCHASE_SCOPE.md) uses `human-db-purchase.ts`, one fixed request/quote/hash/100 Tgas/zero deposit, a short-lived in-memory restricted key and durable one-send journals. That one attempt was made and remains unresolved. It is never resent, re-signed, moved to a recovery or owner key, or released on timeout; `node scripts/setup/human-db-purchase.ts --check` only re-reads the retained record. Owner full-access keys never buy the resource.

## Known limitations

- **Public testnet purchase unresolved; vertical slice incomplete.** Option C is the chosen demo: four FINAL setup steps plus the retained unresolved purchase, with LOCAL Sandbox providing end-to-end purchase/receipt evidence. Public provisioning/check/acceptance/report stay blocked on real settlement evidence. No second send or timeout release; see [the retained plan and current decision](docs/TESTNET_VERTICAL_SLICE_PLAN.md).
- **Narrow browser wallet, no hosted signer.** Meteor extension-v2 and the admitted injected interface can prompt one exact reviewed transaction for a wallet-held testnet account. The site has no shared key, generated access key, stored session, web-wallet fallback or automatic authority. A returned hash is unverified until FINAL readback.
- **Callback recovery:** a missing, failed or unproven callback keeps the reservation pending. There is no timer-based release, blind retry, public settlement setter or implemented reconciliation release procedure. An unknown result is never treated as success.
- **Imported records are claims.** LOCAL observation validation checks internal consistency and bindings, not chain truth or provider delivery.
- **Owner acceptance is not verified client satisfaction.** It is the operator's explicit recorded decision.
- **No security audit or formal verification.** Rust enforces authorization under tested assumptions; this is not production custody or a security certification.
- **Native NEAR only.** No fiat peg, exchange rate, stablecoin, cross-chain settlement, mainnet action or real funds.
- **Single operator and project-bound demo.** No multi-tenant service, marketplace, agent swarm, production identity system or client share link.
- **No Replay Lab yet.** The tested research/fixture workflow remains regression evidence, not the primary product story.
- **Website is a hosted preview, not a completed testnet purchase.** The existing site is https://runlatch.vercel.app/, connected to the private repository's `main` branch. Updates to that site/private source are approved; [BUILD_LOG.md](BUILD_LOG.md) records the exact verified deployed revision and publication outcome. Local changes are not live until deployment is verified. Public repository visibility, demo post and submission remain separate human gates.

## Repository and dependency disclosure

- Original RunLatch source was checkpointed into this repository on 7 November 2026, within the NEAR HACKATHON development window. Any earlier local work is baseline and is not re-dated or claimed as new.
- Development used OpenCode and GPT-6.1 Sol for AI-assisted planning, implementation, testing and copy, with human steering and human-only administrative signing. The reproducible agent workflow is scripted, not a paid LLM integration or autonomous claim of human acceptance.
- Reused libraries and tools are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `docs/release/DEPENDENCY_INVENTORY.json`.
- Engine: Next.js 16.4.5, React 19.3.1, Tailwind CSS 4.3.5, TypeScript 5.9.3, Playwright 1.64.1 and axe-core 4.14.0. Licences are recorded in the generated notices.
- Dither engine: the `dithercn` implementation vendored under `src/lib/dither` is MIT-licensed; see `licenses/dithercn-MIT.txt`.
- Fonts: Space Grotesk, Inter and IBM Plex Mono are self-hosted through Fontsource; their OFL licences are in the package notices and `licenses/npm-transitive-NOTICES.txt`.
- Icons: Simple Icons where used, CC0; see `licenses/simple-icons-CC0.md`.
- NEAR tooling: `near-cli-rs` MIT notice and Cargo transitive notices are retained under `licenses/`.
- Project licence: [MIT](LICENSE).

## Hackathon references

- Rules: https://nearhackathon.com/HACKATHON.md (re-checked 11 November 2026).
- NEAR documentation: https://docs.near.org/
- Submission deadline: 2026-11-14T23:59:00Z. Public repository, public X demo post and the single submission are human actions and are not performed by this repository.
- Submission fields, the demo post and the final payload must be supplied and approved by the human. No example or duplicate identity is used.

## Further reading

- [PRODUCT.md](PRODUCT.md) - product boundary and customer.
- [ARCHITECTURE.md](ARCHITECTURE.md) - accounting, state and security model.
- [ACCEPTANCE_TESTS.md](ACCEPTANCE_TESTS.md) - adversarial cases and expected results.
- [DESIGN.md](DESIGN.md) - visual system and dither rules.
- [BUILD_LOG.md](BUILD_LOG.md) - chronological implementation and test evidence.
- [docs/REMEDIATION_STATUS.md](docs/REMEDIATION_STATUS.md) - nine-prompt delivery scope, actual QA and remaining external gates.
