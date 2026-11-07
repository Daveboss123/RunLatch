# RunLatch source-backed truth map

7 November 2026. Source-backed baseline for the full UX/motion/technical audit, retained below with a current implementation addendum; not a security audit. Read with BUILD_LOG sections38–40 for executed checks and subsequent changes. Entries explicitly marked baseline describe the pre-change implementation, not remaining defects.

## Routes and controls

| Surface | Implementation and action | Truth boundary |
| --- | --- | --- |
| `/` | `src/app/page.tsx`: centred proposition, project board, five-chapter problem story, Gate, commitment comparison, lifecycle, receipts, disclosure report, proof, architecture and FAQ | Fictional project throughout; no wallet/RPC/signing endpoint |
| `/gate` | Same `simulator.tsx`; allocation input, canonical fixture quote selector, adversarial buttons, reset, real calculated trace and hash details | Exact TypeScript preview, not a Rust invocation; approval-required cannot approve or reserve |
| `/demo` | `run-board.tsx` filters/inspectors plus `demo-walkthrough.tsx` evaluate → illustrative reservation → selected callback fixture | Seeded board and resettable walkthrough are different data sets; reset never retries a transfer |
| `/docs` | Curated architecture/API/accounting/evidence/privacy/reproduction/credits; local section links | Does not serve arbitrary repository or `.local` files |
| `/setup` | Static SVG/CSS engine smoke surfaces | Technical preparation, no shader/payment connection |
| 404 / error boundary | `not-found.tsx` return link / `error.tsx` local reset | Neither changes contract state |
| Shared navigation | `header.tsx`: route links, memory-only theme, native details menu, Escape close/focus; `footer.tsx`: directory and texture setting | Display controls do not edit authority; `/gate` already omits closing pitch |
| Project board | Fixed `PURCHASES` + `DEMO_BUDGET`; payment filter, arrow inspector, empty-state reset; table/phone cards | Native decimal-string amounts, seeded statuses/time; unavailable transaction references |
| Problem story | `problem-story.tsx`: height-based observer band, sticky desktop visual, manual numbered buttons, static phone/reduced layout | Explanation of owner revision invalidation, not a chain event |
| Commitment | `commitment-visual.tsx`: two distinct quotes, hypothetical 3/4 allocation, exact upfront/full/future calculations | Selection is not publication, policy editing, approval or renewal collection |
| Lifecycle | `purchase-lifecycle.tsx`: eight explanatory stages | Baseline stage selection independent of receipt; no event stream |
| Receipt | `receipts.tsx`: keyboard Tabs; six evidence layers, source/exact amount details | Baseline independent receipt selection; no digest/transaction invented; acceptance not recorded |
| Report | `report-preview.tsx`, `preview/disclosure.ts`: three explicit disclosure checkboxes, empty-state shortcut, local JSON Blob download | Nothing uploaded; evidence only with expenses; no human authentication or sharing service |
| Built with | `build-strip.tsx`: six actual stack names/assets/URLs, pause/focus/offscreen/reduction | Referential tools, not partnerships; baseline outbound links leave the current tab |

## Claims mapped to authority and evidence

| Claim | Contract / reducer / evidence |
| --- | --- |
| Project-bound immutable authority | `projects.rs` authenticated revisions/status; `lib.rs::validate_policy`, `create_capsule`, `evaluate_stored`; `project_tests.rs` |
| Provider-published immutable canonical terms | `lib.rs::register_provider`, `publish_quote`; unique quote ID, publisher/recipient checks; `hashing.rs` and independent TS hashing/goldens |
| Account + key + scope enforced | `submit_purchase` direct predecessor/signer/key check, `gate.rs::evaluate`; `foundation_tests.rs`; real restricted-key Sandbox cases |
| Exact funding/commitment | `model.rs` checked available methods; `commitment.rs`; `authorize_request`; TS `purchasing/commitment.ts`; commitment/project tests |
| Approval-pending holds no capacity | `submit_purchase` pending record with zero R/C, no quote/resource claim; `approve_purchase` re-evaluates current stored state and exact request hash |
| Duplicates are project-scoped canonical resources | `resource_fingerprint` binds project/provider/service/resource, not a free agent string; atomic claim in `authorize_request`; project/commitment tests |
| Unknown settlement fails closed | Private `resolve_purchase` checks exactly one bounded native-transfer promise result; empty successful bytes settle, failed promise releases, everything else quarantines; duplicate calls resolve once |
| Revocation cannot recall scheduled payment | Status stops future evaluation; pending records remain; callback still resolves stored outgoing operation |
| Return is separate from task quality | `close_capsule` excludes future commitment and refuses pending settlement; authenticated async owner return and private resolver; no poor-quality refund |
| Evidence is not payment/delivery truth | `evidence.rs`: owner-only linked/bounded provisioning, exact fixture criteria/resource checks, explicit immutable acceptance bound to outcome/evidence snapshot |
| Reports disclose only reviewed fields | `reporting/project.ts`: bounded input/schema/scope/hash/operation-sum checks and selected projection; not independent RPC proof. `export-project-local.ts` refuses nonlocal provenance |

Financial invariants: `available_now = allocated - spent - reserved`; `available_to_commit = available_now - committed_future`. All authority uses checked u128 / BigInt decimal strings. JS Number conversions found in source are geometry, indices, HTTP status or one-byte hash encoding—not money parsing. No pay-any-recipient method, public callback outcome setter, hosted signer or broad-key fallback was found in the inspected paths.

## Existing execution paths

- Browser: imports only fixed public fixtures and pure helpers. `DEMO_DOMAIN.network=testnet` is a **hash domain**, not the execution environment. No fetch/RPC, credential or browser-storage writes in the product components.
- Rust SDK: Linux `test-contract-linux.sh`, mock host promise results; not runtime settlement proof.
- Isolated LOCAL Sandbox: `scripts/sandbox/src/main.rs` requires Linux/loopback, starts near-sandbox 2.14.0, generates ephemeral actors in memory, loads native production/fault artifacts, observes final transaction and receipt outcomes. Modes cover core/outcome/fault/maximum/scoped/research/project/agency. Does not use public testnet funds.
- Public testnet: **absent**. No deployed account, network observer, wallet session or verifiable public transaction in the interface. A report import's source label alone is not independent observation.
- Tests: npm scripts cover independent hashes, untrusted artifact validation, commitments, report projection, preview parity, frontend and actual Chromium controls. BUILD_LOG is the dated recorded evidence, not a live dashboard metric.

## Motion and dither trace

- No GSAP/Motion/Framer dependency. CSS tokens, once-only content entrance, shared rAF heading ink, sticky observer story, input-driven state transitions; no scroll-jacking.
- Installed `lib/dither` supplies real Bayer matrices, SVG fill/path generation, CSS masks and WebGL quantization. `shader.tsx` has colorField, context budget, near/screen observers, low-power cell-sized canvas, theme subscription, context-loss fallback. `motion.ts` pauses offscreen/hidden documents and holds reduced-motion stillTime.
- Hero field computes aspect-corrected continuous tones, 2px Bayer8 cells, 24fps; range/pointer lens and Pause controls. HTML captions/text remain outside the shader. Baseline freely scrubs past the Gate regardless of selected preview: illustrative, but should be linked to the decision state.
- Compact marks use actual engine fillStyle/FillPattern: budget partition, commitment term, story boundary, Gate, receipt, transition and quiet empty state. No shader behind amounts or dense table.
- Baseline budget uses **1100ms once-only clip animation**, not scroll progress. Segment widths also have a width transition: remove this so partition geometry is never temporally inaccurate.
- Baseline shared CSS contains successive historical overrides; targeted consolidation must not reintroduce the old split hero.

## Baseline defects and chosen corrections

1. Explicit shared execution/provenance metadata, with no live claim derived from a caller's source string. Keep old machine source enums compatible.
2. Central scenario metadata and a shared page-local preview selection for hero/Gate/commitment; lifecycle and receipt use the same seeded purchase selection, explicitly separate from proposal preview and callback fixture. Do not manufacture receipt evidence from an eligible preview.
3. Group allowed/blocked scenarios and point to actual lifecycle edge-case walkthrough; dynamic trace count retained. Add expected-versus-actual, exact financial effect and no-mutation explanation.
4. Remove the later eight-row landing comparison matrix; relocate compatible detail to Docs and preserve `#capabilities` as an anchor to proof. Keep the five-chapter problem explanation as the only comparison story.
5. Tighten footer closing composition into copy + action column, retaining small static passage echo; no added marketing filler. Standardise primary “Try the Gate”; separate secondary project inspection.
6. Budget reveal follows vertical viewport passage in both directions, with full static/reduced/no-JS fallback. Exact segment ratios and textual ledger never animate.
7. Stronger consistent hover/focus/press/disabled feedback for all button classes, without hover-only meaning, low-contrast disabled text or layout shifts. One icon-only labelled mobile-menu affordance; real new-tab outbound links.
8. Fresh six-width/dark/light/reduced/no-JS/WebGL/keyboard/axe/performance/clean-source QA. Screenshots prove appearance only, not money or external delivery.

## Reference and audit contradictions

Live Roster readback: 64px Space Grotesk hero, 56px section headlines, Inter body, 200ms colour/border controls and no page overflow at 1000×700. Prior source-backed reference audits record table/navigation/mobile/footer behaviour. Adapt readable hierarchy, product-first pacing and restraint; copy no Roster content/assets/code. The supplied recording is older than the centred hero correction; preserve the human's centred layout and reversible opaque ink rather than resurrecting a split hero/once-only text fade.

Live official HACKATHON.md re-read: deadline 14 November 2026 23:59 UTC; testnet-only and local-only allowed; local-only needs public repo/reproducible README and human X **video**. No mandatory Intents/TEE/Chain Signatures. Publication/signing/submission remain protected gates. Catalog setup failed (missing Linux jq), nothing installed/paid; direct official docs succeeded. Dithercn current docs and loaded skill confirm static engine fills and one purposeful shader, not a replacement engine/dependency.

## Limits

Not exhaustive formal verification or security audit. No Safari/iOS/real phone, assistive-technology, true GPU/hardware benchmark or independent supplier delivery verification. Browser resize is not physical mobile testing. Newly executed test/capture outcomes are recorded in BUILD_LOG as they complete; historical 140/114/37 counts are not automatically current. Public testnet execution and human final design review remain absent.

## Current full-audit implementation and verified corrections

- `execution.ts` descriptors are frozen, descriptive metadata. Imported testnet/local source labels explicitly do not independently verify a chain or grant authority. Current115 backend Node/36 frontend Node tests include those negative assertions; the added tooling case concerns matcher compatibility, not a new payment feature.
- Hero/Gate/commitment share page-local proposal selection; stale async preview results are cancelled. Lifecycle/receipt share a seeded purchase selection. Neither creates evidence from eligibility, and neither is the separate resettable callback fixture. Twelve presets include uncapped full commitment denial and unknown full amount remains null/Unknown.
- Budget uses a direct reversible viewport-linked clip through the same batched scroll reader as opaque heading ink; old1100ms keyframe and width transition are gone. Amounts/ratios remain exact; static/reduced/no-JS/print fallbacks retain full data. Hero illustration stops at Gate on denial/review in shader/fallback; the installed engine and one2px/Bayer8/24fps shader are unchanged.
- One comparison story remains; later matrix relocated to Docs with old deep link preserved. Header has one44px labelled mobile-menu icon; six outbound tools use protected new tabs. Common button states remain readable. Closing layout fills the former empty half with existing next-step copy/actions, not filler; `/gate` still omits it.
- Fresh corrected-build browser QA **42/42**, six-width dark/light/reduced captures **210 PNGs**, no overflow/external requests, four homepage axe checks0violations. Original37/42 failure retained. Automated accessibility is not universal conformance.
- Legitimate `.local/projects/latest.json` and all three generated canonical envelopes were found by a targeted canonical-file search; the earlier broad filename glob missed them. **16 read-only export checks pass** for no fields/budget only/expenses only/full selection and invalid scopes. Output equals recorded report data apart from additive execution metadata; originals remain untouched. Source is LOCAL_NEAR_SANDBOX_OBSERVATION; it is a derived input projection, not fresh Sandbox/public-network verification.
-140 Rust/SDK tests,15 Rust–TS vectors/all29check states and all-mode LOCAL Sandbox results remain separate Section38 evidence; Rust sources/artifacts unchanged. Isolated final headless loopback sample: LCP328ms,CLS0.000383488,40 WebGL submissions/2002ms,one480×85canvas,errors/external0; no hardware/real-device guarantee. Final174-file fresh-source staging/npm-ci/type/lint/115+35Node/build passes;81source/test/config files byte-match.13development advisories remain, production audit0; no forced upgrade. Final relative-file link check11documents/44links passes; it is not external URL/anchor verification.

## Subsequent release hardening

The preceding35-test/13-advisory/fresh-source state is historical Section40 evidence. Current115+36Node/42browser/type/lint/build/15parity pass; targeted development-only dependency changes yield full npm audit0. Headed Edge/Chrome now confirm actual hidden→paused→visible→running, with separate automated keyboard/axe checks, not manual AT. UI, Rust and evidence semantics remain unchanged. [Release record](release/RELEASE_STATUS.md)/BUILD_LOG.md section41 supply exact actual Git-clone reproduction, licence/notice coverage, privacy/mark blockers and unavailable browser/device checks. Public release and human visual approval remain absent.

## Requested policy workshop

`/policy` and `src/lib/policy/` now provide deterministic explicit-clause/manual/JSON purchasing terms, schema/cross-field/context checks and owner-reviewed immutable browser-memory versions. Unknown providers/recipient substitutions/AI decisions, missing limits and uninterpreted instructions fail closed. At most eight versions; edits invalidate draft consent while retaining prior versions. This is local draft review only: no authenticated owner, capsule/key/workflow/validation binding or `runlatch.policy.v2` hash is invented, no Gate/receipt/settlement facts change. Optional injected drafting uses local test mocks, not a configured inference service. See [POLICY_WORKSHOP.md](POLICY_WORKSHOP.md), [release status](release/RELEASE_STATUS.md) and BUILD_LOG.md section42 for exact current results; preceding counts remain historical.
