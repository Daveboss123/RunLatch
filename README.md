# RunLatch

Project-bound purchasing authority and outcome accountability for AI-powered businesses. **Give an AI agent a job, not a blank cheque.** See the newer [product-direction brief](RUNLATCH_PRODUCT_DIRECTION_CHANGE_BRIEF.md) and [change plan](DIRECTION_CHANGE_PLAN.md).

## Current stage — local release hardening, not deployed

**7 November release-hardening checkpoint:** current application tests pass115 backend Node,36 frontend Node and42 Chromium browser cases, strict type/lint/build and15 Rust/preview parity vectors. Full npm audit now0 after a targeted development-only fix. Recorded140 Rust/SDK and all-mode LOCAL Sandbox checks are separate backend evidence. Agency delivery/check/test-owner acceptance remains controlled LOCAL fixture evidence, not real infrastructure/client acceptance. Six-width captures and16 read-only exports remain preserved. Human visual review is deferred. [Release status, licence/privacy coverage and blockers](docs/release/RELEASE_STATUS.md) separates current checks from actual Git-clone reproduction and public clearance.

- The product/architecture/design/acceptance specifications exist.
- A Rust NEAR SDK contract stores funded capsules, canonical provider quotes, exact approvals, reservations, private native-transfer resolution, and owner unused-fund return state.
- A dependency-free Rust Gate checks exact agent identity/key, capsule state/expiry, quote hash and provider/recipient binding, service/quantity/recurring restrictions, replay, and integer available-budget/approval thresholds.
- **140 LOCAL Linux Rust/SDK tests pass**. SDK promise outcomes are mocked; actual Sandbox checks are separate.
- Gate is wired into submit_purchase; no free recipient/price/denial override. Transfers reserve/consume first. LOCAL scripted research, offline validation, bounded owner review/attestation/receipt views and exact cost cohorts now work. The browser has labelled seeded previews and a deterministic simulator, not wallet/testnet execution.
- Current default WASM **415910 bytes**, SHA-256 `d0397fc992cb8f0624076c59314dbe1339461f38ea4c66980dd3d39720c57964`, passed the final combined Sandbox run. Separate LOCAL callback-fault WASM **415908 bytes**, SHA-256 `3130b4688df40f5fa473117ff202342bf7b81dc965b3d9c32121ed7d7efe5bb2`; **never deploy it publicly**. Prior hashes remain historical in BUILD_LOG.md. Release QA remains pending.

**No public deployed contract address, public repository/demo URL, customer activity, or public settled-payment evidence exists.** LOCAL Sandbox evidence is recorded separately. RunLatch is provisional and is not a production custody service or audited security product.

**Frontend:** this same npm root has pinned Next16.4.5, React19.3.1, Tailwind4.3.5, current source-installed dithercn/loaded project skill and self-hosted Space Grotesk/Inter/IBM Plex Mono. Native NEAR values are seeded, not fiat equivalents. Pure-black dark by default, selectable light, centred hero with one interactive request→capsule→Gate→receipt illustration/SVG fallback, bidirectional opaque heading ink, genuinely scroll-linked reversible budget reveal, a sticky desktop/mobile-sequential story, fixed-term commitment explainer, linked lifecycle/receipt inspection and read-only demo/docs. Hero/Gate/commitment share the selected proposal; seeded receipts and callback fixtures remain separate from it. Pointer/range/pause controls change only the illustration. Stronger hover/press/focus/disabled states, one labelled mobile-menu icon and a tighter copy/action closing layout replace the older presentation; `/gate` omits the redundant closing pitch. No signing service, live RPC, telemetry, third-party chart or paid AI integration.

## Run the local UI

Requirements: Node>=24.20.0 and npm. No wallet, credentials, public account or .env file needed.

```powershell
npm.cmd ci
npm.cmd run dev
# Open http://127.0.0.1:3000
```

- `/`: eleven-section product narrative; the redundant second comparison matrix is consolidated into Docs and the `#capabilities` deep link remains. “Alter recipient” -> quote-hash denial; “Expired quote”, “Unregistered vendor” and “Cancelled project” -> explicit hard denials. “Hidden term” ->2.40 NEAR full commitment rejected against2.30 available; set allocation4 -> exact owner approval required, no money held. “Uncapped exposure” remains denied even with larger allocation. These are TypeScript browser simulations checked against15 actual Rust Gate vectors/all29 check states, not chain calls.
- Primary “Try the Gate” opens `/gate`; “Inspect a project” opens `/demo`, not a landing anchor. On `/gate`, the header offers “Inspect a project” as the next step.
- `/gate`: dedicated adversarial Gate testing workspace using the same exact preview component. No signing, reservation or payment.
- `/demo`: read-only fictional project plus a separate resettable local walkthrough. Evaluate quote -> preview reservation -> apply success/failure/unknown **callback fixture**. It changes only illustrative browser state; it is not a public settlement resolver. Unknown retains the fixture reservation; denied/recurring-review cannot advance. No real provider or transfer is called.
- `/docs`: curated architecture/API/limits/reproduction/privacy/asset credits. It does not expose arbitrary workspace files or `.local` evidence.
- `/policy`: [validated purchasing-policy workshop](docs/POLICY_WORKSHOP.md), linked from `/demo`. Explicit instructions/manual/JSON → typed checks → review every limit/scope/fixture recipient → explicit approval of an immutable **local demo version only**. No LLM key required, no contract activation, no seeded-capsule edit. Unsupported/contradictory instructions fail instead of silently becoming sample policy. Hosted LLM integration is not configured; a tested draft-only adapter seam does not imply real inference.
- First paint -> pure-black dark, including without JavaScript. Theme button -> light/black; footer texture control -> reduced/static treatment. Display preferences are memory-only and never change spending authority or write browser storage.
- “Built with” items show only real logo and name; their tool websites open in a new tab with noopener/noreferrer and an accessible announcement. Global LOCAL/non-partner qualification remains; no unimplemented technology shown as integrated.

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd test
npm.cmd run test:frontend
npm.cmd run test:preview-parity
npx.cmd --no-install playwright install chromium --only-shell --no-remove
# With the loopback app running:
npm.cmd run test:browser
```

Production-mode local preview: `npm.cmd run build`, then `npm.cmd start`; do not start dev and production on the same port. Launchers bind only127.0.0.1 and disable Next telemetry. Browser screenshots/reports are ignored under `.local/ui/`, never uploaded. `node scripts/web/check-clean-source.mjs` stages allowlisted source/packaged assets and runs fresh npm ci/type/lint/Node/build checks; this is not a Git clone or fresh Rust environment. Current results/remaining limits are in BUILD_LOG.md.

Visual reproduction with the production server running: `node scripts/web/capture-reconstruction.mjs` -> dark-first then light section/interaction/reduced screenshots and desktop/mobile video under `.local/ui/reconstruction/`. `node scripts/web/capture-reconstruction.mjs --measure-only` -> bounded1440px headless loopback sample in `isolated-performance.json`; WebGL submissions are not hardware/GPU or real-device measurements. Latest private review: `.local/ui/full-audit/review/REVIEW.md`, with210 PNGs at1440/1364/1024/768/390/360, four homepage light/dark axe checks with0 violations, plus42/42 browser QA. Original37/42 failure and corrections remain in BUILD_LOG sections38–40; older reviews remain historical. Headed Edge/Chrome now verify actual hidden-tab pause/resume and four routes with axe0/pageoverflow0; Safari, real mobile and manual assistive-technology remain unverified. The isolated headless sample LCP328ms/CLS0.000383488/one480×85 canvas/40 submissions over2002ms is not a device guarantee. Current full npm audit reports0, versus preserved13-development-advisory history. Do not force upgrades or call npm audit a security audit.

Release checks: `node scripts/web/check-release-source.mjs` -> bounded candidate pattern/privacy report (not legal clearance or exhaustive secrets scan). `node scripts/web/check-release-checkout.mjs` -> actual local Git clone, fresh npm install and separate loopback browser QA, plus approved Ubuntu SDK/LOCAL Sandbox reproduction with existing host caches. Neither publishes. Exact tested commits/results and unresolved distribution notices are in the release record. Source-installed dithercn, shadcn registry defaults, local fonts, Simple Icons geometry and credited design guidance are reused; see [third-party notices](THIRD_PARTY_NOTICES.md). Original RunLatch code was developed with AI assistance; local baseline history is not re-dated or represented as entirely new hackathon work.

## Run the completed offline validator

No package installation, credentials, tokens, or website requests are needed:

```powershell
node --test tests/validation/research.test.ts
node scripts/validation/check-report.ts fixtures/research/valid-demo.json
node scripts/validation/check-report.ts fixtures/research/invalid-demo.json
```

Do X -> see Y: valid fixture -> LOCAL/UNATTESTED validation passed (exit0); incomplete fixture -> TOO_FEW_SOURCES/failed (exit1). The55-test suite covers success/failure/tamper/bounds/no-network behavior. URL checks mean syntax only; hashes mean integrity, not independent truth or on-chain attestation. See [validator format and limits](src/lib/validation/README.md).

## Planning documents

New primary story: one fictional AI agency/client website work order, canonical database purchase, full financial commitment controls and a source-labelled expense/outcome report. Native NEAR demo ratios are not dollar equivalents. Small agencies are a customer hypothesis, not validated demand. Research workflow/analytics below remain tested regression, not the primary positioning.

- [Product and trust boundaries](PRODUCT.md)
- [Contract/application architecture](ARCHITECTURE.md)
- [Visual system and Roster/dithercn requirements](DESIGN.md)
- [Acceptance requirements and evidence levels](ACCEPTANCE_TESTS.md)
- [Official hackathon compliance](HACKATHON_COMPLIANCE.md)
- [Actual progress, commands, and blockers](BUILD_LOG.md)
- [Persistent coding instructions](AGENTS.md)

## Historical LOCAL Gate tests on Windows

These commands worked historically. This machine's rebuilt native executables are now blocked by Application Control; **do not bypass or keep retrying blocked Windows binaries**. Use the current native Linux test command below. Gate tests need no wallet or credentials.

From the project root, in PowerShell:

```powershell
New-Item -ItemType Directory -Path '.tools/native-tests' -Force | Out-Null
rustc --edition=2024 --test 'contracts/runlatch/src/gate.rs' -o '.tools/native-tests/gate-tests.exe'
& '.tools/native-tests/gate-tests.exe'
```

**Do X -> see Y:** run the test executable -> see the valid canonical purchase eligible, wrong key/recipient/quote hash and stale/replayed/over-budget/recurring cases denied, with unexecuted dependent checks marked not evaluated. The current observed run reported 26 passed, 0 failed. This is a LOCAL unit-test result; it is not proof that money moved or a NEAR transaction was rejected.

## Run the current contract suite in approved Ubuntu

```powershell
wsl --distribution Ubuntu-24.04 --user runlatch --exec sh /mnt/c/Users/David/RunLatch/scripts/setup/test-contract-linux.sh
```

Do X -> see Y: locked SDK tests, strict Clippy and format -> current contract counts in BUILD_LOG. `npm.cmd test` passed115 Node tests, including imported-provenance labels not granting verification/authority; not tsc/browser/chain proof. See [contract API/trade-offs](contracts/runlatch/README.md). Paths/user belong to this setup; on another Linux checkout use `sh scripts/setup/test-contract-linux.sh`.

## WASM build and historical Windows SDK command

The contract manifest pins near-sdk 5.30.0 and Cargo.lock pins resolved dependencies. Current official SDK docs require the on-chain `--cfg near` host path; `.cargo/config.toml` scopes it to WASM. SDK unit-testing features are test-only.

```powershell
$env:AWS_LC_SYS_PREBUILT_NASM = '1' # documented Windows x64 test-dependency fallback
$env:CARGO_TARGET_DIR = Join-Path (Get-Location).Path '.tools/cargo-target/unit'
cargo test --locked --manifest-path 'contracts/runlatch/Cargo.toml'
cargo clippy --locked --all-targets --manifest-path 'contracts/runlatch/Cargo.toml' -- -D warnings
```

The Windows SDK and cargo-near executables are now blocked by Application Control. Use checksum-verified native Linux cargo-near0.22.0, with native filesystem outputs to avoid NTFS artifact-copy errors:

```powershell
wsl --distribution Ubuntu-24.04 --user runlatch --exec sh /mnt/c/Users/David/RunLatch/scripts/setup/build-sandbox-artifacts-linux.sh
npm.cmd run prepare:sandbox-reports
wsl --distribution Ubuntu-24.04 --user runlatch --exec sh /mnt/c/Users/David/RunLatch/scripts/setup/test-sandbox-linux.sh all
```

Do not disable wasm-opt or compiler/protocol checks to force an artifact. The development build skips optional ABI generation only. Approved WSL2 Ubuntu setup is complete; no Windows security-policy change or Docker installation. Actual Sandbox checks are separate from SDK mocks.

Canonical native artifacts: `$HOME/.cache/runlatch-artifacts/production/runlatch_contract.wasm` and `/callback-fault/runlatch_contract.wasm`. The legacy ignored Windows artifact mirror is historical, not automatically refreshed. Never deploy the callback-fault build or use --all-features for a public artifact. See [Sandbox modes/evidence](scripts/sandbox/README.md).

## Planned on-chain / off-chain boundary

**On-chain-capable code, not publicly deployed:** projects/revisions, funded capsules, canonical commercial quotes, exact scoped identity, approvals, integer S/R/C accounting, resource duplicate claims, native callbacks, C-excluding owner return, independent bounded provisioning/check/acceptance and report views. Public accounts/wallet/evidence unfinished. Local runtime proof covers only tested artifacts/cases.

**Off-chain:** JSON/count/URL-syntax validation, fixtures, owner review and exact cost cohorts implemented/tested. LOCAL Sandbox scripted workflow/service adapters and receipts work; reconstructed browser UI is verified with explicitly seeded simulations. Public-network observer/wallet integration remains unfinished. Validator hashes/owner attestation do not prove honest checker execution or research truth.

## LOCAL scripted workflow and costs

Primary agency workflow and explicit disclosure export: [Sandbox guide](scripts/sandbox/README.md#primary-fictional-agency-workflow). It tests a fictional booking-website database purchase and source-separated provisioning/check/acceptance/report, including adverse requests. Read the actual generated IDs in `.local/projects/latest.json`, then `node scripts/workflow/export-project-local.ts <generated-project-id> --budget --expenses --evidence` -> selected canonical-input projection; omit all flags -> no financials or expenses. The current reducer was checked read-only against all three existing generated cases: settled70/pass/accepted, settled50/provision-fail/rejected and spent0/payment-fail/rejected, in integer yoctoNEAR. Export metadata does not independently verify a chain or create new execution evidence. [Judge path and unpublished drafts](docs/JUDGE_QUICKSTART_AND_DRAFTS.md) separate browser, SDK and Sandbox reproduction. Research below remains regression evidence.

After generating fixtures/building as above:

```powershell
wsl --distribution Ubuntu-24.04 --user runlatch --exec sh /mnt/c/Users/David/RunLatch/scripts/setup/test-sandbox-linux.sh workflow
npm.cmd run analyze:local
```

Do X -> see Y: run the three LOCAL cases -> PASS with20 records, paid-incomplete FAIL, and failed extraction payment/ERROR with no extraction delivery. Actual settled costs300+300+100 yoctoNEAR /1 passed run =700 yoctoNEAR per success, including failure/error costs. This is a three-run controlled fixture sample, not customer activity, merchant acceptance, a factual research claim or a savings statistic. Gas/storage/owner returns are separate. No signer enters the browser/Node validator; finite250-millinear agent gas allowance is not the1000-yocto capsule budget.

Generated reports/receipts/facts live under ignored `.local/workflows/`; cost output in `intelligence.json`. Scoped key tests use the `scoped` mode. The SDK's omitted invalid-transaction detail/legacy missing-key response is handled honestly with bounded loopback diagnosis/read-back; no broader-key purchase fallback.

AI never authorizes payment. An off-chain validation report or owner attestation does not prove factual research truth or guarantee delivery. Quotes are controlled demo-provider terms, not a claim that commercial API vendors accept NEAR testnet payments.

## Safety and hackathon gates

- Planned demo: NEAR testnet only. A read-only RPC status query confirmed chain testnet/protocol88; this is environment evidence, not a RunLatch integration.
- No mainnet, real funds, public deployment, source publication, social post, or hackathon submission without explicit human approval.
- `.env.example` has empty/placeholder values only. Never write real private keys to repository/runtime files or logs; approved scoped runner keys are process-injected, not public web configuration.
- Generated builds/tools and private artifacts are ignored/not served. Review evidence and secrets before any publication.
- The live hackathon requires a public repository and human X demo by 14 November 2026 23:59 UTC; it allows testnet-only projects and does not mandate Intents/TEE/Chain Signatures. Public release remains approval-gated.

Original RunLatch source is provisionally MIT-licensed; third-party terms/notices are separate. Name/eligibility/asset/release checks remain before public launch.
