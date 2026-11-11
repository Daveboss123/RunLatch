# RunLatch — NEAR HACKATHON compliance record

**Checked:** 11 November 2026 (complete live HACKATHON.md re-check; earlier audits below preserved). All event times below are UTC. Latest website-update scope: section 25; Option C decision: section 29.
**Stage:** local Outcome Receipts and Run Intelligence verified on code candidate **eeef5cd**:115backendNode/85frontendNode/86rootChromium/type/lint/build/15parity pass. Genuine236-file clean web checkout passes all15steps,84browser tests/2actual-file skips, audit0 and clean final Git status. Earlier147Rust/SDK, LOCAL agency artifacts/imports,26policy cases across installed Edge/Chrome, headed true-visibility and the historical timed-out all-mode clone retain separate evidence boundaries. [Release record](docs/release/RELEASE_STATUS.md)/BUILD_LOG.md sections41–44 distinguish exact checkout coverage, privacy/licence/platform gaps and pending gates. Full human visual/public release approval remain absent; this status edit is not a new live-rule check.
**Product name:** RunLatch is provisional.  
**Authority:** live organizer rules override the newer product-direction brief and compatible original blueprint.

## 1. Sources checked

| Source | What was checked |
| --- | --- |
| https://nearhackathon.com/ | Timeline, tracks, toolkit, submission form, and FAQ answers in the published page HTML |
| https://nearhackathon.com/HACKATHON.md | Full live rules, Q-000 through Q-017, tracks, judging procedure, submission contract, and ecosystem guidance |
| https://nearbuilders.org/build | Organizer-linked builder resources; integrations remain optional |
| https://docs.near.org/smart-contracts/quickstart | Current Rust contract workflow and testnet guidance |
| https://docs.near.org/tools/near-connect.md | Current wallet connector guidance |
| https://docs.near.org/web3-apps/tutorials/wallet-login.md | NEAR Connect, view calls, wallet-confirmed calls, and function-call-key plugin |
| https://docs.near.org/protocol/accounts-contracts/access-keys.md | Function-call-key restrictions and gas allowances |
| https://docs.near.org/smart-contracts/anatomy/crosscontract.md | Independent asynchronous receipts, callbacks, and gas allocation |
| https://docs.near.org/smart-contracts/security/checklist.md | Caller checks, funds accounting, input bounds, callbacks, storage, and testing |
| https://docs.near.org/smart-contracts/security/storage.md | Storage-funding and unbounded-state risks |
| https://docs.near.org/smart-contracts/security/cross-contract-calls/callback-failures.md | Callback failure, lack of automatic retry, and safe accounting |
| https://docs.near.org/smart-contracts/testing/integration-test.md | Current Sandbox integration-test guidance using near-sandbox and near-api |
| https://docs.near.org/api/rpc/transactions.md | Execution milestones, finality, receipt outcomes, and RPC version compatibility |
| https://docs.near.org/chain-abstraction/chain-signatures.md | What MPC signatures do and do not establish |
| https://docs.near-intents.org/ | Current Intents integration entry points |
| https://docs.near.ai/cloud/private-inference.md | Private-inference architecture, gateway verification, and attestation boundaries |

The official site and HACKATHON.md were accessible. This check does not establish that every organizer message on X, Discord, Telegram, or video channels has been reviewed. Check those channels for relevant clarifications and re-read the live rules before final QA and submission.

## 2. Dates and eligible work

| Event | Official time |
| --- | --- |
| Hackathon and submission window opens | 2026-11-01T00:00:00Z |
| Development ends; repository-public and submission deadline | 2026-11-14T23:59:00Z |
| Judging starts | 2026-11-16T00:00:00Z |
| Results announced by | 2026-11-18T23:59:00Z |

**Organizer clarification Q-001:** code written since the announcement on **19 October 2026** is eligible. This is broader than the blueprint's original 1 November implementation start. Earlier commits are baseline; never re-date or misrepresent them. RunLatch implementation is planned after this audit and explicit human approval.

- No preliminary sign-up is required; solo builders and teams can participate.
- An existing repository or product can be used, but only eligible new work / NEAR integration is judged (Q-002 through Q-004).
- If existing work is reused, separate the baseline with a dedicated branch or pre-hackathon / submission tags and link the exact diff in the README.
- Libraries, templates, boilerplate, and AI-generated code are allowed. List reused material and its origins in the README; own older libraries remain baseline (Q-005).
- One submission per project; a repository can be submitted only once.
- One person can enter at most two independent NEAR HACKATHON projects. If entering two, each README must name the other (Q-015). Existing local ZECATHON projects are not automatically NEAR HACKATHON entries.
- The checked sources do not provide a complete age, jurisdiction, or other eligibility policy. Do not invent restrictions or assume that absent details establish personal eligibility.

## 3. Track recommendation and judging

| Track ID | Live organizer description | RunLatch fit | Decision |
| --- | --- | --- | --- |
| `security` | Spending limits, policy engines, sandboxed wallets, reputation, and scam detection; give AI money without unrestricted keys | Contract-enforced capsules, canonical quotes, replay protection, revocation, and adversarial tests | Strongest primary fit |
| `agents` | Agents earn, spend, negotiate, hire, and pay for APIs, compute, or data, directly with crypto or through Intents | A working workflow purchases services from explicitly identified demo providers and links spend to outcomes | Recommended when the working purchase loop exists; accurately label scripted versus AI proposals |
| `business` | AI-native treasury, sales, procurement, payments, and revenue sharing; humans set constraints | Possible if the delivered workflow genuinely demonstrates constrained procurement | Conditional; not a default claim |

Multiple fitting tracks can be selected in the same submission. Track hints and named protocols are **not mandatory integrations** (Q-011).

Claude Code and Codex screen reproducibility and claimed features; humans make the judging decisions. A low AI score alone cannot reject an entry (Q-017). The website cites technical implementation, design, impact, originality, and sustainability from previous NEAR hackathons as preparation guidance. **No current weighted rubric or separate track scoring formula was found in the checked sources.** Do not invent one.

## 4. Meaningful NEAR integration decision record

This table records the initial integration choices. Contract source now implements the capsule/quote/purchase/approval/reservation/callback/refund boundary and passes LOCAL SDK tests, but no public NEAR deployment or real testnet execution has occurred. Actual key provisioning, off-chain outcome attestation, and UI remain pending; code/compilation is not on-chain evidence.

| Primitive | Requirement solved and boundary | Security implication / required evidence | MVP decision |
| --- | --- | --- | --- |
| Rust NEAR contract and testnet accounts | Hold funded capsule budgets; authenticate providers; store immutable canonical quotes; enforce policy, approval, replay protection, reservations, and native testnet NEAR transfers | Verify contract account, code hash, successful and blocked execution outcomes, receipts, and final state; agent must not hold the contract account's full-access key | Include: minimum meaningful NEAR integration |
| Scoped function-call key on a separate agent account | Let an approved workflow call only the purchase method, with zero attached deposit and a finite gas allowance | Receiver and method restrictions do not constrain function arguments or enforce purchase budgets; contract policy remains authoritative. Demonstrate restricted key permissions and rejected unauthorized calls after explicit setup/signing approval | Include in the bounded-agent milestone; owner retains recovery/control |
| NEAR Connect | Human wallet connection and explicit approval of owner/provider actions | Connector and wallet support must be tested on testnet; never silently fall back from a restricted agent action to broader owner signing | Preferred connector, subject to compatibility gate below |
| NEAR Intents | Cross-chain / asset-agnostic settlement | Organizer Q-007 says no Intents testnet exists or is planned. A dry quote is not payment settlement; mainnet costs are not reimbursed by default | Exclude from the testnet-only MVP |
| Chain Signatures | Outbound signing for foreign-chain accounts | Adds MPC, foreign-chain payload/replay controls, and separate settlement verification; signatures alone do not prove external execution | Exclude: no foreign-chain requirement in the MVP |
| NEAR AI Cloud / TEE | Confidential inference if sensitive prompts become a concrete requirement | Verify gateway/model/connection evidence before making attestation or privacy claims; attestation does not make an AI authorization decision safe | Defer: deterministic fixture workflow needs no private inference |

**Asset choice:** native testnet NEAR only initially. Blueprint USDC amounts are illustrations, not evidence of an implemented stablecoin integration. Commercial API vendors are not represented as accepting NEAR testnet payments; use a clearly named, controlled demo provider catalogue.

### On-chain versus off-chain

**On-chain, planned:** funded capsule policy and lifecycle, authorized identities, provider registry, canonical quote terms, request identity, decisions for supported business-denial cases, exact approvals, spent/reserved accounting, transfer resolution, and minimal receipt / validation references.

**Off-chain, planned:** proposal generation, demo provider adapters, research artifacts, schema/record-count/URL-syntax validation, explanations, UI, and receipt aggregation. Private prompts, credentials, and full task artifacts stay off-chain. A validator record proves a particular validator reported defined checks, not factual truth or guaranteed delivery.

The contract is the payment authorization boundary, not the browser or an LLM. An owner-controlled deployment account remains an explicit administrative trust assumption; do not claim immutable or fully trustless custody while its full-access keys can replace code or move funds.

### Required accounting and lifecycle controls

- Use integer yoctoNEAR; expose large amounts as decimal strings, not floating-point numbers.
- Preserve `available = allocated - spent - reserved`, with allocated purchase budgets backed by funding and separate storage/operating capacity.
- Provider, recipient, amount, quantity, asset, service, recurring terms, and expiry come from the registered quote. Client assertions cannot replace them.
- Bind approvals to the exact request, quote, capsule, policy version, and expiry; re-check policy and revocation at authorization.
- For the smallest flow, approval-pending requests do not promise reserved capacity. Re-check and reserve atomically when approval authorizes settlement.
- Reserve funds and prevent request/quote reuse before scheduling a transfer. A queued promise or transaction hash is not settlement success.
- Resolve native transfer success/failure in a private, bounded callback with measured gas margin; update accounting exactly once.
- Revocation blocks subsequent authorization but cannot recall a transfer already scheduled. Never release pending funds simply because a timer expired or the capsule was revoked.
- If a callback itself fails, retain a fail-closed pending state until a separately specified, evidence-backed reconciliation is possible; no blind resend or timeout refund.
- A contract panic rolls back that receipt's state. Persist ordinary business denials by a structured no-payment return where appropriate; do not claim a denial receipt survived a reverted call.
- Bound request/quote counts and input lengths. Pre-fund or charge for storage without requiring deposit-capable agent calls.
- Distinguish business `DENIED` from a failed blockchain transaction, and distinguish purchase funds from transaction gas fees.

## 5. Version and environment audit gates

This table preserves the initial audit's candidate metadata. Subsequent autonomous development installed pinned near-sdk5.30.0/portable cargo-near0.22.0, and Rust1.99/SDK unit/WASM builds passed; frontend packages and real wallet integration are still absent. See BUILD_LOG for exact current results, not this historical table as an installation inventory.

| Component | Verified current stable / latest metadata | Gate |
| --- | --- | --- |
| Next.js | 16.4.4; Node >=20.9 | Installed Node 24.20.0 satisfies the published engine |
| React / React DOM | 19.3.1 / 19.3.1 | Next.js peer range accepts React 19; keep the pair aligned |
| Tailwind / PostCSS adapter | 4.3.4 / 4.3.4 | Suitable for dithercn; modern-browser support must be respected |
| shadcn CLI | 4.23.0; Node >=20.18.1 | Source distribution, not a single runtime UI package; components.json is needed |
| Zod | 4.6.7 | Proposed deterministic schema validation; fresh integration not yet tested |
| Playwright test | 1.64.1; Node >=20 | Browser installation and project tests not performed in this audit |
| near-api-js | 7.4.0; published Node engine >=22.22.2 | Node is sufficient; use current v7 APIs, not obsolete @near-js examples |
| @hot-labs/near-connect | 0.12.0 | Current preferred connector; test actual wallet/network behavior before claiming support |
| function-call-key-plugin | 2.1.0; peer @hot-labs/near-connect ^0.11.1; dependency near-api-js ^7 | **Not peer-compatible with connector 0.12.0.** Latest published compatible 0.11.x connector found: 0.11.4. Do not force an install; initially use explicit owner signing, then choose a verified scoped-agent path or a compatible pair |
| near-sdk | 5.30.0; minimum Rust 1.95 | Installed Rust/Cargo 1.99.0 meet the minimum; WASM/protocol compatibility still needs an actual build/runtime check |
| cargo-near / near-cli-rs | 0.22.0 / 0.30.1 | Neither executable found on PATH; official Windows artifacts exist; no installation performed |
| near-sandbox / near-api (Rust) | 0.4.0 / 0.8.7 | Current official integration-test direction; Sandbox execution documents Linux x86 / macOS ARM64, not native Windows |

Other installed tools: npm 11.19.0, Git 2.55.0.windows.5, rustup 1.29.1, and the wasm32-unknown-unknown target. pnpm, Yarn, Bun, and Docker were not found on PATH; WSL reports that it is not installed. Prefer the existing npm workflow rather than adding a package manager solely for examples.

NEAR Sandbox tests need an explicitly approved Linux environment, such as WSL or later approved CI. Native contract unit tests/builds are not yet proven. Do not install WSL, Docker, packages, or tools as part of this audit; do not substitute a mock and report Sandbox/testnet evidence.

Version sources: npm registry latest/package metadata; crates.io crate metadata; official near/cargo-near and near/near-cli-rs releases; current NEAR SDK and Sandbox upstream READMEs. Tutorial sample versions and some README runtime claims are older than current package engine metadata; use the stricter published package requirements. Pin the tested combination and lockfiles after approval, and re-check before each integration.

## 6. Publication, demo, and submission acceptance criteria

- Repository can remain private while building, but must be public by **14 November 2026 at 23:59 UTC** and remain public through judging (Q-014).
- Add a LICENSE file; any license is permitted. Preserve required third-party notices. The team retains code rights; organizers receive non-exclusive promotional rights to the listed project materials (Q-013).
- README must explain the actual product, NEAR's role, baseline/reuse, setup, test commands, limitations, and reproducible **do X -> see Y** steps. Do not claim tests or features that have not been verified.
- Human publishes a public X demo post saying the project was built at **NEAR HACKATHON**, tagging **@NEARProtocol** and **#NEARHackathon**, with demo video or screenshots attached. @NearLegion and @NearBuilders are optional.
- For a local-only demo, **video is required**; screenshots alone are insufficient when judges cannot open the demo (Q-012).
- Hosting is optional. If hosted, keep the demo up through **18 November**, ideally **25 November** (Q-012).
- Testnet-only projects are eligible in every track (Q-010). An own NEAR contract that fits the track is sufficient; ecosystem hints do not require extra protocols (Q-011).
- Provide independently checkable testnet evidence for every claimed on-chain feature: network, real contract account, code hash / build reference, transaction and receipt outcomes, and queried final state. None exists for RunLatch yet.
- Keep `SIMULATED`, `LOCAL`, `TESTNET`, submitted, pending, failed, settled, and validation states distinct. A settled purchase can still have failed task validation.
- There is no required paid AI service. NEAR AI credits are optional (Q-000); 1Click JWT is not mandatory (Q-006), and Intents is excluded here.

### Submission fields and approval boundary

Use the official form or submission API only after the human reviews the exact final payload. Collect, do not invent:

| Field | Rule |
| --- | --- |
| requestId | One UUID per submission; preserve the same value for permitted retries |
| projectName | Human-finalized name, 2-80 characters |
| leadName | Human-provided name, 2-80 characters |
| email | Valid contact email, at most 160 characters; at most two independent submissions per person/email |
| size | Exactly one of 1, 2 - 4, 4 - 6, 6 - 8, 8+ |
| tracks | One or more unique live track IDs fitting implemented functionality |
| nearAddress | Human-provided mainnet payout account, named or 64-character implicit account; no account creation/signing implied |
| projectUrl | Public repository URL, http(s), at most 300 characters, unique per submitted project |
| demoUrl | Public X demo post URL, http(s), at most 300 characters |
| idea | Accurate product description, 20-2000 characters |
| consent | true only after the human agrees to the exact notice below |

> I agree that the organizers may use these details to review our submission and contact us about this hackathon.

Official API: POST https://nearhackathon.com/api/applications, JSON body up to12000 bytes, exactly the documented fields. Do not add a `website` field; a non-empty value is a spam trap. Submission cannot be edited directly. Under the7 November live rules, mistakes go through a **human-submitted request at https://nearhackathon.com/request-changes**, reviewed by organizers; existing values remain until applied. Never submit a second project/link to bypass409. Check whether this repository has already been submitted before sending anything.

201 means saved. Follow the live documented handling for validation errors (400), closed/forbidden submissions (403: do not retry), duplicate repository / submission limit (409: do not evade), oversized payload (413), or temporary storage failure (503: reuse requestId). After an uncertain network result, inspect before retrying; never generate a second submission identity. Do not commit personal payload data.

## 7. Current checklist

- [x] Complete attached v5 blueprint read; saved byte-for-byte as RUNLATCH_PROJECT_BLUEPRINT.md. SHA-256: E6ECB3D748945F6DCA02A0C1643486CE35B5E9C33942234DC46A8B391CEE74DF.
- [x] Live official website, published FAQ, and full HACKATHON.md checked.
- [x] Date, track fit, submission rules, and rule/blueprint differences recorded.
- [x] Native-NEAR testnet MVP proposed; optional integrations evaluated without claims of implementation.
- [x] Initial audit preserved non-RunLatch work and performed no installs/Git setup/public actions; later local setup is separately recorded in BUILD_LOG.
- [x] Human authorized specification/M2 and autonomous local development; public/fund/secret actions remain protected.
- [x] Local source control initialized on main; baselineef0b767 preserves existing prototype with neutral local-only author/actual timestamps. Later hardening/clone checkpoints are in BUILD_LOG.md. No public remote/publication; never re-date reuse.
- [ ] Resolve approved contract-build and Linux integration-test environment.
- [ ] Pin and test dependency versions; resolve connector/key-plugin compatibility.
- [ ] Implement and test contract authorization, canonical quotes, funding, reservations, exact approvals, revocation, replay, callbacks, storage bounds, and receipts.
- [ ] Implement one honest demo workflow and an objective versioned validator.
- [ ] Implement Replay Lab and test adverse settlement/approval/revocation cases.
- [ ] With separate explicit approval, set up testnet accounts/keys, deploy, and collect real successful and denied-purchase evidence.
- [ ] Verify Roster-inspired RunLatch design, purposeful dithercn use, responsiveness, keyboard access, contrast, reduced motion, and loading/error states.
- [ ] Complete reproducible README, license/notices, secrets check, and clean-checkout QA.
- [ ] Confirm personal eligibility, any other NEAR entries, provisional name, team details, and payout account without storing private submission details in Git.
- [ ] Re-check live rules and relevant organizer updates before final QA.
- [ ] Human explicitly approves publication; repository public before deadline and throughout judging.
- [ ] Human records/publishes the required X demo post; verify links without login.
- [ ] Re-check rules before submission; human confirms exact payload and consent; submit once only if separately authorized.

**Stop conditions:** unavailable/conflicting rules, unresolved eligibility affecting entry, incompatible dependencies, a missing complete blueprint, or a requested signature/payment/publication without explicit approval. Report the issue; do not improvise a fake integration or silently widen scope.

## 8. Local implementation update — 3 November 2026

- Official website/HACKATHON.md re-read before coding; protected external-action gates remain. No organizer submission or public deployment request was sent.
- Read-only testnet status observed chain=testnet, nearcore2.14.0-rc.5, protocol/latest88, matching SDK5.30 minimum88. This is network/tool compatibility evidence, not RunLatch state.
- Actual LOCAL checks:82 SDK/Rust unit tests pass; strict Clippy/format and current official WASM build pass with wasm-opt/compiler checks. Current artifact267039 bytes, SHA-256C85A4E785E6DC52EFCD1C09F8C79F7BF0FC785E4D3CEDA2E0C0494945AD296AB.
- SDK test-dependency missing NASM was resolved using its documented checksum-locked bundled-object fallback, process-local only. No policy weakening or extra system install.
- Full node receipt/gas/failed-callback/refund tests require a supported Linux Sandbox host; native Windows SDK mocks do not satisfy that gate. M3 remains runtime-validation pending. No real payment settlement/attestation/provider acceptance is claimed.
- Repo remains local, no remote/commit/publish; .tools/.local/private env/credential paths ignored, no live env files or keys created. Mainnet/payout account/name/eligibility/public repo/demo/post/submission remain human-gated.

- Subsequent approved low-data work completed an offline JSON/URL-syntax/record-count validator, local fixture CLI, and55 passing Node runtime tests with no dependencies or network requests. Reports are explicitly LOCAL_VALIDATOR/UNATTESTED; no factual research, reachability, payment, or owner/on-chain attestation claim.
- Human resumed the full build; approved Ubuntu tests now pass102 Rust/SDK cases with strict lint/format, independent of validator counts. Sandbox harness dependencies/API checks are in progress. Live official website/HACKATHON.md rechecked during this milestone; deadline, testnet eligibility, no mandatory integrations, public-repo/human-demo/consent rules unchanged in these sources. No public action or source publication.

## 9. Live re-check — 7 November

- HACKATHON.md accessible; deadline14 Nov23:59UTC, public repository/human X media, local-demo video, consent, testnet eligibility and one-submission limits unchanged. New section4 describes human request-changes/organizer review, not direct editing or duplicate submission. New ecosystem listings do not require scope expansion.
- Actual local maturity:103 SDK unit tests,58 Node runtime tests and default/fault-artifact Sandbox checks passed at the saved checkpoint. Maximum-state runtime work resumed; no public contract/wallet evidence, frontend or completed release claim. Organizer social/community channels were not comprehensively rechecked.

- Subsequent7 November local milestone:113 Rust/SDK and86 Node tests plus contract/outcome/max/fault/scoped-key/research-workflow Sandbox component runs pass with strict lint/format. Constrained real LOCAL transfers precede controlled service output, Node checks and owner report; failed payment stops extraction delivery, paid-but-bad output remains a failed validation, costs include FAIL/ERROR. No AI-inference/independent-truth/commercial-provider/public-testnet claim. Final combined run and frontend/release QA pending. Human notified before UI/layout transition; no UI code/scaffolding started.

## 10. Direction-change live recheck — 7 November2026

- Official website and complete HACKATHON.md fetched successfully during direction audit.14 November23:59UTC/public repo/human X media/local-demo video/one submission/19October eligible baseline/consent rules unchanged. No mandatory Intents/Chain Signatures/private inference/AP2/vendor integration; own track-fitting native NEAR contract remains sufficient. Social/community clarifications not comprehensively checked.
- Prior combined all-mode Sandbox completed exit0; baseline113 Rust/86 Node and lint/format pass. New schema2 project/commitment/evidence work requires new tests/artifacts; no stale-artifact claim.
- Product-direction brief improves potential `business` fit through project procurement/reporting, but final track choice depends on shipped evidence. `security` remains strongest; scripted `agents` workflow must be described honestly. No fabricated scoring weights or partner relationships.
- Native NEAR testnet remains the only settlement asset. Dollar examples are illustrations, not live token/fiat equivalents. Provisioning fixture does not establish real supplier acceptance/database creation. Owner attestations are not independent delivery verification/human client acceptance.
- Human resumes ordinary local work, not public contract deployment/account-signing/repository/posts/submission. Obtain exact scope/consent before public-network actions. No external write/contact/publication performed.

## 11. UI-finalisation live recheck — 7 November2026

- HACKATHON.md read-only HTTP200 at18:31:56Z.19October eligible baseline,14November23:59UTC deadline, testnet eligibility/no mandatory protocols, public repository/LICENSE through judging, human X post and local-only video, single-submission/requestId and exact consent rules unchanged in the checked source. Organizer community channels not comprehensively checked.
- Local UI QA and isolated headless performance are review evidence, not public deployment, real supplier provisioning, authenticated client report access or overall hackathon readiness. All publication/signing/private-disclosure/submission gates remain.

## 12. Policy/release verification boundary — 7 November2026

- The human's new explicit policy request authorizes a local editor/compiler only. Browser-reviewed in-memory versions are not authenticated capsule activation, LLM inference or public-network evidence. Rust/locks/backend sources are unchanged in candidate01f1963.
- New local tests and actual checkout outcomes are recorded in BUILD_LOG.md sections41–42 and the release status. The earlier all-mode clone timed out; subsequent agency and fresh web verification are distinct runs, not an erased failure or fabricated full pass.
- Genuine219-file clone01f1963 now passes all15 `--web-only` steps: fresh installation/type/lint/115backend+54frontendNode/15parity/build/audit0/scanner/55browser and clean final Git status. It does not rerun the full SDK/WASM/Sandbox suite or provide public-network evidence. Final evidence-only docs do not change the tested source identity; overall release readiness remains partial.
- A fresh catalog/live-rules/brand check remains unperformed: kpass/ksearch are absent and installing the remote scripts requires explicit consent. No installer/authentication/payment/private disclosure occurred; the last actual official HTTP rule check remains section11. Organizer community clarifications, eligibility, name/marks, public links/targets and separate publication/submission consent still require final review before external release.

## 13. Receipt/intelligence milestone live recheck — 8 November2026

- Complete official HACKATHON.md fetched again read-only during final localcandidateeeef5cdQA on8November. Deadline14November23:59UTC, testnet eligibility, publicrepo/LICENSE/humanX/localvideo and exact single-submission/push/signature consent constraints remain unchanged. No publicaction/identity collection or organizer-community/brand/eligibility completeness implied.

- Complete official HACKATHON.md read-only fetch succeeded at this milestone.14November23:59UTC deadline,19October eligible baseline, testnet eligibility/no mandatory integrations, public repository/LICENSE through judging, human X media/local-only video, one submission/exact payload consent and no unapproved push/signature remain consistent with prior findings. No submission, publication, deployment, post or signing occurred.
- Receipt/intelligence code candidateeeef5cd now passes115backendNode/85frontendNode/86rootChromium/type/lint/build/15parity and all15fresh-web steps,84browser passes/2actual-file skips. It uses labelled LOCAL/imported/illustrative records, existing objective fixture checks and integer cost cohorts; no spending authority, independent external truth or public-testnet evidence added. Private bundles were not copied into the clone. Exact results/earlier failures and unresolved all-mode/manual/public gates stay in BUILD_LOG.md section44 and the release record. This evidence reconciliation is not a new live-rule fetch, eligibility approval or submission consent.
- Passport catalog checks remain unavailable (CLIs absent; remote install unapproved). This successful official-rule fetch is separate from unresolved catalog/brand/eligibility/community/public-link checks; it is not full final release/submission QA or publication consent.

## 14. Working testnet MVP audit — 8 November2026

- Complete official HACKATHON.md fetched read-only for the newly requested MVP.14November23:59UTC,19Octoberbaseline,testnet eligibility/no mandatory integrations, publicrepo/LICENSE/humanX/localvideo and exact signing/publication/submission consent rules remain consistent with section13. No organizer-community completeness, eligibility or public-link review claimed.
- MVP will be built first; the human must give a separate go-ahead before new Replay Lab implementation. First local read-only RPC foundation passes synthetic unit/type/lint checks only; no public account/contract/RPC-state query/wallet/signature/deployment/payment exists. SDK/connector registry metadata and official NEAR API/docs were read, not packages installed or accounts inferred. Catalog installer remains unapproved; no external paid service/project disclosure.

## 15. Setup-review milestone live recheck — 8 November2026

- CompleteofficialHACKATHON.md fetched read-only at2026-11-08T00:35:40.563Z,22199bytes/SHA256903794f4b656b456eaee087941517d024a33633641d167b90c3f060d381d9aed; ignoredsnapshot retained.14November23:59UTC deadline,19October eligiblebaseline, testnet eligibility/no mandatoryprotocols, publicrepo/LICENSE/humanXmedia/localvideo and exactsignature/publication/submissionconsent remain unchanged in this source. No organizer-community/eligibility/brand/public-link completeness claimed.
- New owner/provider setup reviews remain unsigned/synthetic and do not activate policy, publish a quote, sign or deploy. Supplementalbs58notice located; near-seed-phrase notice/SDK admission and public execution gates remain unresolved. No catalog result/remote installer/payment/private project disclosure or maintainer contact occurred. ReplayLab stays deferred until separate human go-ahead.

## 16. Owner/outcome review milestone — 8 November2026

OfficialHACKATHON.md fetched again read-only at2026-11-08T00:52:40.476Z:22199bytes, SHA256903794f4b656b456eaee087941517d024a33633641d167b90c3f060d381d9aed, byte-identical to section15completechecked source. No changedrules/deadline detected in this source; community/personaleligibility/publiclinks still not comprehensively checked. Exact publicsignature/publication/submissionconsent still absent. Newowner/outcome reviews are unsigned/synthetic; fresh147RustSDK tests are localhostmocks. No publiccontract/account/transaction/fixtureprovisioning/evidence or ReplayLab/publicaction occurred.

## 17. Codec/localcrypto milestone — 8 November2026

OfficialHACKATHON.md read-only at2026-11-08T01:11:09.621Z:22199bytes/SHA256903794f4b656b456eaee087941517d024a33633641d167b90c3f060d381d9aed byte-identical to section16. No deadline/consent change detected in this source; no community/eligibility/publiclink completeness. Newwire/signature checks are offline and generate ephemerallocaltestkeys only, not registered publicaccounts/keys or testnettransactions. No publicsigning/deployment/payment/provisioning/publication/submission occurred; firsttaskstillincomplete and ReplayLab remainsseparatelygated.

## 18. Signed local runner — 8 November2026

OfficialHACKATHON.md read-only at2026-11-08T01:20:48.117Z:22199bytes/SHA256903794f4b656b456eaee087941517d024a33633641d167b90c3f060d381d9aed byte-identicaltosection17. No deadline/consent change detected in checkedsource; personaleligibility/community/publiclinks remainunverified. Newkeyguard/byte-send checks are local with ephemeralkeys and injectedtransports only. No account/keyinstallation/deployment/publictransaction/signature/payment/provisioning/feedback/publish/post/submission occurred. Exactpublicscope and separateReplayLabgo-ahead remainabsent.

## 19. Local sequential nonce reconciliation — 8 November2026

OfficialHACKATHON.md read-only at2026-11-08T01:31:49.415Z:22199bytes/SHA256903794f4b656b456eaee087941517d024a33633641d167b90c3f060d381d9aed byte-identicaltosection18. No deadline/consent change detected in checkedsource; no comprehensivecommunity/personaleligibility/publiclinksreview. Sequentialnonce tests use only ephemeralkeys/publicfixturedata/injectedreceipts; offlineRustparity is notSandbox/publicexecution. No publicaccount/key/deployment/signature/transaction/provisioning/post/submission/privateprojectdisclosure/feedback action. WorkingtestnetMVPstillincomplete; ReplayLabgo-aheadabsent.

## 20. Restricted process-key injection — 8 November2026

OfficialHACKATHON.md read-only at2026-11-08T01:45:31.830Z:22199bytes/SHA256903794f4b656b456eaee087941517d024a33633641d167b90c3f060d381d9aed byte-identicaltosection19. No detecteddeadline/consent change or comprehensiveeligibility/community/publiclinkreview. Keyinjectiontests generateephemeralmaterialinmemoryonly; offlineRustchecks2signatures/24wirevectors, notSandbox/publicexecution. No realcredentialread, publicsignature/account/keyinstallation/deployment/transaction/provisioning/post/publish/submission/privateprojectdisclosure/feedback. Publicscope/WorkingMVPcompletion/ReplayLabgo-ahead remainabsent.

## 21. Human child-account preparation — 8 November2026

Official HACKATHON.md read-only check completed at **2026-11-08T17:28:14.623Z**: 22199 bytes, SHA256 `903794f4b656b456eaee087941517d024a33633641d167b90c3f060d381d9aed`, byte-identical to the prior complete reads. Deadline, testnet eligibility, public-repository/media and exact external-action/consent gates are unchanged in this source. No comprehensive community, personal eligibility or final submission review is implied.

The human created the parent testnet account; independent RPC observed its expected key and 10 testnet NEAR. The website is deployed from private source at `a0d2c17`, but the contract/purchase/outcome MVP remains incomplete. The new local child helper uses typed exact testnet scope and explicit human selection of a local Node signer; local tests and unsigned public preflight do not authorize or execute the three child transactions. Public GitHub visibility, contract deployment, later key/setup/purchase/acceptance calls, posts and submission remain separately gated. No mainnet, paid service, human credential read or signature by the agent occurred.

## 22. Human deployment preparation — 8 November2026

Official HACKATHON.md was fetched read-only at **2026-11-08T17:53:23.800Z**,22199 bytes, SHA256 `903794f4b656b456eaee087941517d024a33633641d167b90c3f060d381d9aed`, unchanged from the previous complete reads. The deadline, testnet/public-source/media/consent rules remain unchanged in this source; no community/eligibility/submission completeness is claimed.

The human's three child creations are now independently observed FINAL. The separate deployment/init helper has local tests and unsigned same-block preflight only: exact default artifact, Gate self-signer, empty existing code/state, finite gas and sufficient native balance. No agent human-credential read, public signature/send, contract/purchase/provisioning/acceptance, Replay Lab, visibility change or cloud action occurred. The human must separately review and execute the exact deployment transaction. See BUILD_LOG.md section69 and docs/HUMAN_DEMO_DEPLOY_STEP.md.

## 23. Human project preparation — 8 November2026

Official HACKATHON.md fetched read-only at **2026-11-08T18:10:12.220Z**,22199bytes/SHA256 `903794f4b656b456eaee087941517d024a33633641d167b90c3f060d381d9aed`, unchanged from the prior complete checked source. No deadline/consent/track change found in this source; no comprehensive organizer-community, personal eligibility or submission review implied.

The human's Gate deployment/init is independently observed FINAL; project/purchase/outcome execution is not. New exact operator project helper has synthetic/offline checks and unsigned public preflight only. 0.30 NEAR is an unfunded ceiling,0.08192 NEAR is separate project storage, and no capsule/provider/key/purchase/outcome action is bundled. Human full-access signing remains own-terminal only. The human removed local UI heads-up/routine-review requests and will review the whole build at the end; this does not permit agent credential access, privacy disclosure or invented external evidence. Public repository visibility, posts and hackathon submission do not occur as side effects.

## 24. Provider-helper continuation — 9 November2026

Complete live HACKATHON.md fetched read-only again. Deadline14November23:59UTC,19October eligible baseline, testnet eligibility/no mandatory protocols, public repository/LICENSE through judging, human X media/local-only video, exact signing/push/payload consent and one-submission/requestId requirements remain consistent with the prior record. No organizer-community/personal eligibility/public-link completeness or submission readiness is claimed. Generic catalog documentation search had no exact fit; official Context7 NEAR docs and first-party rules were used without paid calls/account/auth/private-context disclosure.

Human project creation is independently observed FINAL from the prior checkpoint, not repeated. New provider helper is local preparation with generated-key/codec/RPC tests only. The public state read confirms unchanged project and provider absence; subsequent unsigned preparations encounter RPC429. No signature/credential read/send/registration/purchase/outcome or public source/website change occurred. Human own-terminal signing remains a separate exact gate; local tests never satisfy public X/MVP acceptance.

9 November follow-up: current official NEAR RPC provider reference and Context7 confirm one request object per HTTP call (nearcore rejects batch arrays), the managed NEAR endpoint's severe rate limits, and FastNEAR's free public testnet endpoint. The existing RunLatch allowlist already admits FastNEAR. Only the unexecuted provider helper explicitly selects it, binding/displaying it in human review with no automatic fallback or paid service. All authority/state/key/freshness/byte-send guards remain unchanged; one native unsigned fresh pair passes. This does not authorize the human transaction or provide a registration/purchase/light-client proof. No public repository/website/model/provider repair or submission claim.

## 25. Website remediation / exact publication boundary — 9 November 2026

- Complete live https://nearhackathon.com/HACKATHON.md re-read at final website QA. Deadline remains **2026-11-14T23:59:00Z**; eligible development starts at the 19 October announcement. Testnet-only projects remain eligible; optional integration hints are not mandates. Public repository and LICENSE through judging, human X attribution/media, local-only video, one submission and exact payload/contact-consent requirements are unchanged. No `website` field may be submitted. This is not a comprehensive organizer-community or personal-eligibility check.
- After being told the nine-prompt work was local and unpublished, the human said **“okay continue then when you're done publish the changes.”** The existing DAVE / RunLatch / `runlatch.vercel.app` website update and necessary existing private-source push are explicitly approved. No repository visibility change, unrelated project, NEAR account/key/signature/purchase/evidence action, private-data disclosure, public post or hackathon submission is included.
- Final local Chromium **98/98** and Node **115 backend / 200 frontend / 244 NEAR-path** pass, with typecheck/lint exit 0. 42 route, 12 print and 2 actual LOCAL-import captures reported no issues. These do not establish public NEAR settlement, independent imported-record truth, universal accessibility, PDF pagination or submission readiness.
- Public Gate/project setup is recorded separately; no public purchase/outcome exists. The exact public sequence stays human-gated in `docs/TESTNET_VERTICAL_SLICE_PLAN.md`. Website deployment/build/check-out outcomes and the verified source revision are recorded in BUILD_LOG, not inferred from approval or from a READY setup transaction.

## 26. Immutable provider registration — 9 November 2026

- The human ran the exact own-terminal one-call provider helper and supplied only its bounded public result. RPC-reported FINAL transaction `5DnrDArTCEN8rGaDCAqacX2CmxvCymYozNam7iys4DLu` registered active `db_demo_1108` under `gate.runlatch-demo-1108.testnet`, with immutable publisher/recipient `db.runlatch-demo-1108.testnet` and quote count0. Attached0.04096 testnet NEAR is storage credit, not provider payment or capsule funding; reported gas burn is separate.
- A subsequent permitted read-only `--check` at block276944483 independently observed operator nonce276803830000005, the pinned Gate code hash, unchanged ACTIVE revision1/allocated0/no-capsule project, active provider/quote count0 and the retained FINAL execution proof. The agent did not access a credential, sign, resend, modify markers or perform another network write.
- Provider registration does not complete the vertical slice: no capsule, quote, restricted key, purchase, callback, provisioning, task check, human acceptance or report exists on testnet. The signing command is permanently consumed and must never be rerun. Remaining public actions each retain separate exact human gates. No mainnet, repository-visibility, X-post or submission action occurred.

## 27. Connected owner application — 9 November 2026

- Human explicitly authorized a reviewed browser wallet and completion of the remaining public testnet workflow. Current official NEAR docs still recommend NEAR Connect0.12.0; its default mutable remote-executor/persistence/discovery behavior remains outside RunLatch's admitted scope. No package was installed. A testnet-only memory bridge accepts only the documented injected-wallet interface after a user click and exact feature/account/public-key checks.
- Browser actions remain human prompts with full signer/receiver/method/args/gas/deposit visible and an immediate final-block reread. No private key enters the app/agent/source; no hosted signer, auto-connect, persistence or broader-key fallback. Native restricted AddKey is fixed to one agent account, Gate receiver, `submit_purchase`, finite0.05NEAR gas allowance and retained recovery key.
- This implementation permission is not transaction evidence. Actual Capsule/quote/key/purchase/outcome claims require separately observed public results. No mainnet, source-visibility, post or submission action occurred.

## 28. Meteor extension / immutable-expiry continuation — 10 November2026

- Complete official HACKATHON.md re-read successfully:14Nov23:59UTC,19Oct eligible baseline, testnet eligibility/no mandatory protocols, public repository/LICENSE/media/human signing/exact payload and one-submission gates unchanged. No organizer-community/eligibility completeness or submission claim. The approved existing Vercel website/private-source update remains separate from NEAR signatures and repository visibility.
- Meteor Wallet has no matching Context7 library; Meteor-framework results were rejected. Official npm SDK1.0.24/3.24.1 source review found modern extension `meteorComV2`, no-key login and native serialized transaction protocol. No SDK/dependency, mutable manifest/executor, browser key, wallet persistence, hosted signer, web/mobile fallback or paid integration was added. Synthetic browser tests remain separate from a real human extension approval.
- Native read-only RPC confirms original Project stored ACTIVE but expired, allocation0/no Capsules. Expiry is not reset. New work order/Capsule/quote templates have new IDs, fixed12Nov expiries and the actual fixture criteria digest; only an exact human signature can create that authority. Existing keys, deployed contract, old setup/attempt records and provider identity are unchanged. No public write, key access, mainnet, X post or hackathon submission occurred.

## 29. Option C release checkpoint — 11 November 2026

- Complete live official HACKATHON.md fetched read-only again. Deadline remains **14 November 2026 23:59 UTC**, eligible announcement-window work begins 19 October, testnet-only projects are eligible and own track-fitting NEAR contracts suffice. Public source/LICENSE through judging, human X post with NEAR HACKATHON attribution/@NEARProtocol/#NEARHackathon and attached media, local-only video, one submission/requestId and exact contact-consent/payload approval remain required. No organizer-community or personal-eligibility completeness is claimed.
- Catalog search for hackathon rules found no matching rules endpoint; official first-party rules used without paid calls, authentication or private-context disclosure. Existing Vercel/site and necessary private-source pushes remain authorized, not public GitHub visibility, new NEAR signatures, posts, mainnet or submission.
- The human chose Option C: four FINAL testnet setup transactions plus one retained signed-and-unresolved purchase; LOCAL Sandbox supplies the separately labelled end-to-end workflow. No completed public testnet vertical slice or supplier delivery/acceptance is claimed. Every unknown attempt remains readback-only; expiry releases nothing and no new authority/bypass was introduced. Real browser-extension approval remains unverified and further wallet work is deferred.
- Re-run approved WSL contract tests: **147/147 Rust/SDK**, strict Clippy and format, all exit 0. These are host-mock/logic tests, not a new Sandbox or public network result. Latest web/Node/clone and production deployment outcomes belong in BUILD_LOG.md section 85; publishing approval alone is not a READY verification.

## 30. Final site/docs and UI/UX release check — 11 November

- Complete live official HACKATHON.md re-read before final UI release QA. Deadline14November23:59UTC,19October eligible baseline,testnet-only eligibility,no mandatory optional protocols,public source/LICENSE through judging,human X attribution/tags/media,local-only video and exact single-submission/requestId/contact-consent requirements remain consistent. No comprehensive organizer-community/eligibility check or actual submission is inferred.
- The human already approved public GitHub visibility, which was independently verified in section86 of BUILD_LOG.md. Existing website/source pushes are approved; new signature/purchase/key, X post, submission or private-data disclosure are not. The UI/UX correction does not re-sign/resend/release the unresolved purchase or claim a real wallet-extension approval.
- Root **115backend/216frontend/306NEAR-path =637 Node** and **112 Chromium**, type/lint/build pass. Separate **32 views** across eight routes/light-dark390/1440 have no axe violations/overflow. Earlier actual147Rust/SDK and LOCAL Sandbox results remain separately dated; neither was rerun by this UI milestone. Clean-checkout/source/privacy/deployment outcomes are recorded with exact candidate identities in BUILD_LOG.md section87; no universal accessibility/legal/security clearance claim.
