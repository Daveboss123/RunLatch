# RunLatch — requirements and acceptance cases

**Prepared:**3 November2026; reconciled8 November. **Status:** receipt/intelligence code candidate **eeef5cd** passes115backendNode/85frontendNode/86rootChromium/type/lint/build/15parity. Genuine236-file fresh web checkout passes all15steps,84browser tests/2actual-file skips and clean final Git status. Earlier147Rust/SDK and LOCAL Sandbox bundles/browser imports remain separate from synthetic fixtures and the timed-out historical all-mode clone. Headed Edge/Chrome genuine hidden-tab evidence, prior captures/exports and failures are preserved. [Release record](docs/release/RELEASE_STATUS.md)/BUILD_LOG.md sections41–44 distinguish exact checkout coverage and unresolved manual/device/licence/privacy gates. Full human visual review deferred; counts are not whole acceptance-row counts or universal accessibility/security proof.

**Offline update:**55 validator/CLI,3 quote goldens,11 preparation,5 workflow CLI and12 exact cohort tests passed. Actual LOCAL Sandbox workflow separately proves constrained payments before delivery/produced-file validation/owner report/receipts/cost facts. No browser/tsc/public-chain proof implied; CLI unit tests alone are not payment evidence.

Authority: newer direction brief plus reconciled PRODUCT.md/ARCHITECTURE.md/DESIGN.md. Existing case IDs below retain compatible regression/security requirements. Research V/I cases are regression/secondary views, not the primary project demo; v1 recurring hard-denial cases apply to explicit Forbidden policy. Revised recurring/full-term checks are P family below. Official live rules override conflicts.

## 1. Levels, priorities, and evidence rules

**Receipt/intelligence addition,8 November:** `tests/frontend/outcomes.test.ts` covers five-axis receipt mapping, failed/error/missing validation, pending/unverified/native-failure separation, owner/request/policy/criteria/time binding, duplicate/conflicting selection, replay counts, large changed canonical amounts and comparable/unavailable prior quotes. `resource-hardening.test.ts` rejects duplicate-status JSON. `browser/intelligence.spec.ts` covers record-driven amount/selection updates, separate illustrative source, exact costs, manual repeatable UNATTESTED validation, failed/missing evidence, import races/adverse bounds,390/1440 light/dark keyboard/axe/mask fallback/noJS and actual3LOCAL files (honest skip without private artifacts).85frontendNode/115backendNode/86rootChromium pass on final local candidateeeef5cd; fresh web checkout repeats115+85Node/15parity and84browser passes, with the2actual-file cases skipped because private bundles were not copied. Exact checkout results and initial semantic/assertion failures are retained in BUILD_LOG.md section44. These are not public-chain, physical-device, universal-accessibility or full human visual approval.

- **U:** Rust unit/property tests. **S:** Linux NEAR Sandbox integration using actual WASM/actions/receipts on a local node. SDK host mocks remain unit tests, not Sandbox/testnet.
- **T:** TypeScript/schema/receipt/analytics tests. **B:** real-browser interaction/accessibility/layout tests. **M:** manual/source/document review. **X:** separately approved public NEAR testnet execution/read-back.
- **CORE:** required for the enforcement/funds contract milestone. **MVP:** required before claiming the full demo/release works. **COND:** only if the deferred feature is approved and implemented; absence is documented, not an MVP failure.
- “No payment” means no provider transfer/reservation for that attempt; an on-chain denied transaction can still spend gas. Check actual transfer/callback outcomes, not a fabricated balance or only a transaction hash.
- Use harmless generated fixtures and ephemeral test keys, never copied real credentials. Direct contract calls bypass the UI in security tests. Malformed/unauthorized failure and structured business DENIED are different evidence sources.
- Each automated test implements the named inputs/actions/assertions; a manual case records observed evidence. A failure blocks the affected claim. No snapshots/metrics/addresses/test results are invented.

## 2. Capsule authority and funding

| ID | Priority / level | Requirement and case | Expected evidence / result |
| --- | --- | --- | --- |
| C-01 | CORE U/S | Initialize once; try re-init, missing/invalid operator, wrong network tag | Invalid initialization fails; no ownership/state reset |
| C-02 | CORE U/S | Operator creates capsule with reviewed budget plus sufficient separate storage funding | Owner set from authenticated operator, policy/hash stored, A=B, S=R=F=0, available=B |
| C-03 | CORE U/S | Non-operator or forged owner attempts capsule creation/configuration | Reject before allocation/storage growth; no victim-funded capsule |
| C-04 | CORE U/S | Missing/short/excess/misrepresented purchase or storage deposit; caller tries a free budget credit | Reject under documented exact funding rule; no unbacked A or misclassified storage |
| C-05 | CORE U/S/T | Zero/negative/overflow amounts, cap above budget, invalid threshold, empty/duplicate scopes, bad IDs/key, past expiry | Schema and contract reject; no active malformed authority |
| C-06 | CORE U/S/B | Owner pauses active capsule; agent submits; owner resumes before expiry | Pause blocks new authorization; eligible resume restores it; stored policy remains exact |
| C-07 | CORE U/S | Non-owner pauses/resumes/revokes/approves/closes | Reject; capsule/financial state unchanged |
| C-08 | CORE U/S/X | Owner revokes; subsequent direct agent call and attempted resume | New payment denied; no transition back to ACTIVE/PAUSED |
| C-09 | CORE U/S | Capsule deadline: just before, exactly at, and after; caller manipulates client time | Only chain time authorizes; exact-at/after blocked; no automatic pending-fund release |
| C-10 | CORE U/S | Try in-place policy/budget edit/top-up or reuse approval on a new capsule/hash | No in-place authority route; new owner-reviewed capsule required; old approval never transfers |
| C-11 | MVP U/S/B | Final outcome/close followed by resume or purchase | Completed/closing/closed authority cannot reopen; historical revocation/reporting preserved |
| C-12 | CORE U/S/T | Two capsules with different budgets/keys; direct request crosses capsule identity | No cross-capsule balance, approval, request, or key authority leakage |

## 3. Registered providers and canonical quotes

| ID | Priority / level | Requirement and case | Expected evidence / result |
| --- | --- | --- | --- |
| Q-01 | CORE U/S | Operator registers pinned publisher/recipient; intruder registers or rewrites identity | Only operator registration; existing identity/recipient cannot silently change |
| Q-02 | CORE U/S | Publisher publishes own quote; another account/provider attempts publication | Correct authenticated provider only; no arbitrary quote authority |
| Q-03 | CORE U/S | Re-publish existing quote ID with higher price/new recipient/service/expiry | Reject overwrite; original canonical terms/hash unchanged |
| Q-04 | CORE U/S/T | Change a canonical quote field/network/contract domain in expected encoding | Hash changes; independent encoder/golden vectors bind every specified term |
| Q-05 | CORE U/S | Quote uses recipient different from pinned registration | Reject publication; no payable quote to substituted recipient |
| Q-06 | CORE U/S/X | Quote deadline just before/exactly at/after; pending approval crosses expiry | Exact-at/after denied; no quote consumption or reservation on denial |
| Q-07 | CORE U/S/T | Unsupported asset, zero/overflow price, zero/excess quantity, invalid account/ID, oversized field/list | Publication/input/Gate defenses fail closed; no valid alternate-asset payment route |
| Q-08 | CORE U/S/X | Consume quote, then retry in same/different request or capsule | Global one-use protection holds, including while settlement is pending |
| Q-09 | CORE U/S | Confirmed failed transfer followed by old quote/request reuse | Quote stays consumed and request terminal; new quote/request required |
| Q-10 | CORE U/S | Operator suspends provider before submit or after approval-pending creation | Current status re-checked; denied, no promise; old quote hash is not silently altered |
| Q-11 | MVP U/S/T/B | Publish new comparable quote with previous reference; invalid previous provider/service/asset/quantity | Genuine history retained/comparison valid; reject or omit invalid comparison, never fabricate a price trend |
| Q-12 | CORE U/S/T | Register canonical recurring=true adverse quote or falsify its displayed flag | Stored recurring terms are explicit; v1 cannot authorize recurring collection |

## 4. Deterministic Gate and attack/replay cases

| ID | Priority / level | Requirement and case | Expected evidence / result |
| --- | --- | --- | --- |
| G-01 | CORE U/S/X | Authorized direct account/key references valid canonical quote within every cap | APPROVED; exact canonical payment is reserved/scheduled, not client terms |
| G-02 | CORE U/S/X | Wrong account, correct account with wrong bound key, or proxy inheriting original signer | Reject before payment/growth; exact identity boundary holds |
| G-03 | CORE U/S | Unknown capsule/provider/quote, provider outside allowlist, service/category outside scope | Stable accurate denial/failure source; no bypass or invented passed checks |
| G-04 | CORE U/S/X/T/B | Recipient tampering: alter quote copy/expected hash; separately inject nested raw recipient field | Canonical mismatch DENIED or actual ABI rejection as appropriate; recipient never routes money |
| G-05 | CORE U/S/X/T/B | Price tampering or lower asserted price; select real higher-price quote | Expected hash mismatch or actual hard cap failure; stored canonical price remains source |
| G-06 | CORE U/S | Prohibited recurring quote, forged non-recurring expectation, owner tries to bless it | RECURRING_FORBIDDEN/hash mismatch; no recurring payment or approval override |
| G-07 | CORE U/S | Quantity exceeds policy or caller injects quantity/service/category fields | Canonical quantity/scope enforced; no free request substitutions |
| G-08 | CORE U/S | Canonical amount equals per-purchase cap, then exceeds it by one integer unit | Equality permitted if other checks pass; excess denied deterministically |
| G-09 | CORE U/S/X | Split purchases individually below cap; total spent + reserved + next amount exceeds A | Cumulative overspend denied; no reuse of pending capacity |
| G-10 | CORE U/S | Submit several distinct quotes before callbacks resolve, in different orders | Commit-time serialization/reservations maintain invariant; no concurrent double spend |
| G-11 | CORE U/S/X | Duplicate request ID while pending/settled/failed/denied; resend same signed tx | Replay denied or same network execution observed; original record unchanged, no new promise/payment |
| G-12 | CORE U/S/T | Malformed/extra nested fields, empty/oversized IDs/hash, unexpected outer wrapper fields | Tested ABI/schema behavior; none can alter routing; do not claim ignored fields produced a stored denial |
| G-13 | CORE U/S/T/B | Bypass UI/local preview, submit malicious provider instructions or asserted APPROVED result | Rust checks still decide; explanation/content cannot grant authority or call owner methods |
| G-14 | CORE U/S/T/B | Multiple rule failures; unknown quote prevents dependent checks; repeat identical inputs/state | Stable ordered reasons and passed/failed/not-evaluated trace; no LLM decision or fake trace |

Replay Lab must expose original policy/canonical quote, changed input/hash, actual decision/failure, failed checks, whether transfer was attempted, lifecycle, and source. Use the same contract submit path for deployed attacks. Local-only failure cases retain LOCAL/SIMULATED labels.

## 5. Exact one-time approvals

| ID | Priority / level | Requirement and case | Expected evidence / result |
| --- | --- | --- | --- |
| A-01 | CORE U/S/B | Eligible quote above approval threshold but below all hard limits | APPROVAL_REQUIRED/pending; R unchanged, quote OPEN; no payment |
| A-02 | CORE U/S | Threshold equality and amount one unit above; threshold absent/zero | Deterministic documented threshold behavior; no hidden exception |
| A-03 | CORE U/S/X/B | Owner approves IDs and exact expected request hash before deadline | Re-check current canonical state, reserve once, consume once, record approver/expiry binding |
| A-04 | CORE U/S | Approval hash/capsule/request/quote/policy/recipient/amount binding altered | Reject; no generalized waiver or alternate payment |
| A-05 | CORE U/S | Intruder/agent or wrong owner key capability approves; stale approval reused | Reject; only eligible human owner action can authorize, once |
| A-06 | CORE U/S/X | Revoke/pause/expire capsule, expire quote/approval, suspend provider before approval | Re-check denies without hold leakage or stale authority revival |
| A-07 | CORE U/S | Another purchase reduces budget or consumes shared quote while approval waits | Pending approval can fail safely; no promised/duplicate capacity |
| A-08 | CORE U/S/B | Owner rejects/cancels/expires pending request; later approve attempt | Terminal no-payment state; no money to release; cannot reauthorize |
| A-09 | CORE U/S | Owner approves a hard-denied unknown/tampered/consumed/disallowed/over-cap request | Cannot turn DENIED into approved; correction requires a new valid request/capsule as appropriate |
| A-10 | CORE U/S/B | Double click/parallel duplicate approval/rejection and forged callback | At most one legal transition/payment; canonical state refreshed; original evidence retained |

## 6. Settlement, reservations, refunds, and catastrophic failure

| ID | Priority / level | Requirement and case | Expected evidence / result |
| --- | --- | --- | --- |
| S-01 | CORE U/S | Inspect immediately after authorization and before transfer/callback | R increased, quote consumed, durable SETTLEMENT_PENDING; not spent/settled yet |
| S-02 | CORE U/S/X | Inspect transfer action receiver/amount after valid request/approval | Exactly one native transfer for stored canonical recipient/price; no generic pay path |
| S-03 | CORE U/S/X | Native transfer succeeds; healthy private callback resolves | R decreases and S increases exactly once; final receipt/state match real successful transfer |
| S-04 | CORE U/S | Transfer to an explicit invalid/nonexistent named receiver fixture fails | Actual failed outcome resolves R, S unchanged, SETTLEMENT_FAILED; no automatic retry or quality refund |
| S-05 | CORE U/S | External caller invokes purchase/refund callback directly | Private predecessor guard rejects, no financial state write |
| S-06 | CORE U/S | Missing/multiple/unreadable promise context or wrong/unknown operation binding | No fabricated success/failure; retain pending reservation where outcome is unproven |
| S-07 | CORE U/S | Duplicate/mismatched/out-of-order resolution of terminal/pending operations | Exactly-once accounting; no underflow, double refund, or another request's reservation change |
| S-08 | CORE U/S/X | Pause/revoke/expire after outgoing transfer is scheduled but before callback | New authorizations blocked; existing transfer resolves honestly; no timeout release |
| S-09 | CORE S | Deliberately starve callback gas or force callback failure | R/pending remains fail closed; new spend cannot reuse it; surface reconciliation needed, no automatic retry |
| S-10 | CORE S/M | Maximum allowed state/input; success/failure callback gas measurement and logs | Bounded work fits measured gas margin; no user-controlled loops/deserialization/panics on expected failure |
| S-11 | CORE U/S | Close capsule with active authority or pending/unknown purchase/refund | Reject close; no reclaim of in-flight funds or second owner refund |
| S-12 | CORE U/S | Owner pauses/revokes/finishes, then closes unused funds; include zero-unused case | Only stored owner receives A-S; reserve first; success adjusts A/F, not S; zero-unused closes without transfer |
| S-13 | CORE U/S | Owner refund fails; explicit retry after confirmed failure | Release only failed refund reservation, keep A/F/S, remain non-authorizing; new operation for approved retry |
| S-14 | CORE S | Owner refund callback fails/unknown, then close/resume/retry attempted | Stay CLOSING/reserved; no second refund or reopened authority |
| S-15 | CORE U/S | Funding/storage/operating balance low; initial method panics after provisional writes | No liquid-collateral guess or unbacked spend; actual Sandbox rollback prevents committed reservation/quote/promise lies |

Assert `available=A-S-R`, `S+R<=A<=B`, `A+F=B`, and reservation/operation sums after every committed receipt, including interleavings. Generate boundary/property cases without relying on a few hand-picked totals. Normal failed-transfer reconciliation is mandatory; callback catastrophe remains a documented quarantined limitation, not a claimed recovery feature.

## 7. Receipts, transaction observation, and evidence accuracy

| ID | Priority / level | Requirement and case | Expected evidence / result |
| --- | --- | --- | --- |
| R-01 | MVP T/B/X | Request/approval submitted, included, pending callback, then final outcome | Distinct transaction/decision/payment axes; no premature settlement on hash/inclusion |
| R-02 | MVP U/S/T | Successful blockchain call returns DENIED or handles transfer failure | Decode business/payment state; transaction success does not mean purchase settled |
| R-03 | MVP T/B | RPC timeout/unknown/shard error/stale response/out-of-order refresh | Show unresolved/stale/error, preserve identity; no fake failure/success or new payment attempt |
| R-04 | MVP U/S/T/X | New business denial, replay denial referencing original, ABI/unauthorized failure | Honest source-specific receipt/projection; no overwritten original or invented persisted denial |
| R-05 | MVP T/B/X | Inspect complete receipt for approved/denied/failed attempts | Capsule/request/quote/policy/reasons/canonical amount/provider/source/timestamps and actual references present or explicitly unavailable |
| R-06 | MVP U/S/T | Alter supplied transaction/hash/evidence or mismatched referenced operation | No state setter from supplied references; verify actual execution/state before claim |
| R-07 | MVP T/B | Local validation passes before owner attestation or chain finality | Mark local/unattested; never imply on-chain validation/independent attestation |
| R-08 | MVP U/S/T/B | Payment settled, output validation failed/error; payment failed, output locally valid | Facts stay independent; no payment reversal or overall green success |
| R-09 | MVP T/B/X | Repeated same tx/request observations and export/import of receipt | Idempotent projection; exact artifact/evidence binding; no duplicate spend or lost failure history |
| R-10 | MVP M/X/B | Verify contract account/code hash, initial/transfer/callback/denial receipts and final state via read-back | Real testnet evidence links, source/block/freshness and limitations; no fabricated address or “audit passed” badge |

## 8. Workflow and objective validation

| ID | Priority / level | Requirement and case | Expected evidence / result |
| --- | --- | --- | --- |
| V-01 | MVP T/B | Valid controlled report with 20–50 distinct records and required typed fields | Fixed v1 checks pass with method/criteria/version/counts, not model opinion |
| V-02 | MVP T/B | Malformed JSON, missing/type-invalid/extra fields, empty topic/title/summary | Specific deterministic failure; no silent coercion or fake success |
| V-03 | MVP T/B | 19/20/50/51 records, duplicate IDs and normalized URL identities | Boundary counts enforced; duplicates do not satisfy target |
| V-04 | MVP T/B | Invalid/non-HTTPS/credential-bearing/oversized URLs and fields | Syntax/size/privacy errors explicit; no arbitrary network fetch or “reachable” claim |
| V-05 | MVP T/B | Artifact/evidence bytes, criteria, or validator version changed | Hash binding detects change; identical fixed input yields same deterministic result; no confidentiality/truth claim |
| V-06 | MVP U/S/T/B | Owner attests matching report; wrong owner/criteria, overwritten outcome, pending settlement | Only exact bounded owner-attested terminal outcome; no payment mutation, criterion change, or unfinished-run concealment |
| V-07 | MVP T/B/M | Remove optional AI credential; run local scripted fixture workflow | Demo path still works; clearly scripted/local; testnet signing remains separately authorized |
| V-08 | MVP T/S/X | Runner waits for final successful payment before chosen fixture service; payment fails/unknown | No pretend paid-service delivery or automatic retry; stop on failed/unproven payment |
| V-09 | MVP T/B | Provider output contains executable HTML, instruction injection, fake IDs/approval/status | Treat as bounded data, escaped display; no authority, script, or method dispatch from it |
| V-10 | MVP T/B | Validator cannot complete/no artifact; repeated attempt after final attestation | ERROR/unavailable artifact explicit; immutable attestation not overwritten or treated as success |
| V-11 | MVP M/B/X | Show search/extraction fixture report and passing/failed run in demo | No third-party API acceptance, factual research, independent validator, or production paywall claim |

## 9. Run Intelligence

| ID | Priority / level | Requirement and case | Expected evidence / result |
| --- | --- | --- | --- |
| I-01 | MVP T/B | Known settled/pending/failed/denied/refunded/gas/storage records | Sum settled provider purchases only; no pending/failed amount, owner refund, gas, or storage counted as purchase spend |
| I-02 | MVP T/B | Completed passed/failed/error runs with explicit prices | Cost-per-success numerator includes failure/error spend; denominator counts passed completed runs |
| I-03 | MVP T/B | Zero successful runs or no completed sample | “Not available,” not zero/infinity/divide-by-zero |
| I-04 | MVP T/B | Mixed workflows/criteria/validator versions/assets/networks and unfinished/unattested/unknown runs | Correct separate cohorts/exclusions; no misleading pooled metric |
| I-05 | MVP T/B | Duplicate attempts/tx observations, owner-refund pending/final, changed selected period | No double count; completion/exclusions and totals update from actual records |
| I-06 | MVP T/B | Very large integer amounts and quotient presentation | Exact totals/ratio retained; documented display rounding, no float authority/accounting |
| I-07 | MVP T/B | Provider/denial breakdown and small sample | Sample, period, numerator/denominator and excluded counts visible; no causal quality/reputation/savings claim |
| I-08 | MVP T/B | Quote comparison with/without a real comparable prior quote | Real comparable price change only; otherwise unavailable, not invented history |

## 10. Product, Roster reference, and dithercn design

| ID | Priority / level | Requirement and case | Expected evidence / result |
| --- | --- | --- | --- |
| D-01 | MVP M/B | Five-second landing review with exact promise, qualified copy, clear demo/inspect actions | Understand task spending boundary without crypto jargon or unsupported absolute claims |
| D-02 | MVP M/B | Compare live Roster reference and RunLatch dated observations/screens | Deliberate hierarchy/rhythm/navigation/storytelling quality, no copied branding/assets/text/product screens |
| D-03 | MVP M/B | Review nine-section order and varied composition | Hero, board, problem, interactive capsule, receipts, intelligence, proof, docs, deliberate footer in order; not repeated template cards |
| D-04 | MVP B | All visible links/buttons/tabs/forms, wallet cancellation, duplicate clicks | Functional or explicitly unavailable; no inert CTA/placeholder link/false login |
| D-05 | MVP T/B | Local budget/quote/tamper/overspend preview and real scenario records | Immediate deterministic preview labelled SIMULATED; real evidence uses contract path and source, no simulated chain claim |
| D-06 | MVP M/B | Review theme/typography/table hierarchy/IDs/amount alignment and naming | Paper/ink/lime tokens, distinct legible font roles, useful tables, consistent Run Capsule/Gate/Receipt/Intelligence/Lab |
| D-07 | MVP B | 320/360/390/768/1024/1440px plus zoom/text enlargement | No page overflow/clipped critical data; usable menus/actions; labelled table scroll/reflow |
| D-08 | MVP B/M | Capture real 1440/390px landing/app/receipt/pending/error views | Inspect actual images, log three high-impact gaps/fixes; never claim unavailable screenshots were captured |
| D-09 | MVP B | Keyboard-only nav, tabs, dialog/menu, Escape, focus restoration | No traps; visible focus not covered by header/dither; correct semantics |
| D-10 | MVP B/M | Labels/landmarks/headings/tables, live updates, screen-reader status | Readable text and names; relevant status announced once; color not sole meaning |
| D-11 | MVP B/M | Solid and densest dither backgrounds, small warning text, focus and controls | Required contrast holds in rendered states; use warning-text instead of failing amber/paper small text |
| D-12 | MVP B | Loading/empty/error/stale/RPC-unavailable states | No invented zero balance/progress; clear next action and source/freshness |
| D-13 | MVP B | Payment green but validation red/error, pending approval, unknown callback/refund | Distinct qualified axes; no universal green success or ambiguous “done” |
| D-14 | MVP B/M | Hero, section transition, budget/data fill, quiet app detail | Dithercn is a recognizable central signature with purposeful hierarchy, not one generic background |
| D-15 | MVP M/T/B | Inspect engine install prerequisites/source/alias/tokens before use | Compatible React19/Tailwind4/shadcn/components.json; preserve utils/local edits; required notices and loaded skill |
| D-16 | MVP B/M | Dither theme and cell scale across paper/panel and dark engine fixture | Project --dither-* bindings, consistent print-like grain, no accidental lime text-noise/rainbow/generic palette |
| D-17 | MVP B | Select/copy real heading/amount/ID/label and click/focus controls over dither | Semantic text intact; decorative layer hidden from assistive tech and pointer-inert |
| D-18 | MVP B | Reduced-motion setting and effects disabled | Finished static frame; no continuing CSS/shader motion, delayed access, fake progress, or flashing |
| D-19 | MVP B | Scroll shader offscreen, hide tab, return, lose WebGL | Actual paused/static/fallback behavior; content still useful and visual identity retained |
| D-20 | MVP B/M | Dense operations and budget charts during interaction | Static SVG/CSS fills, no continuous table shaders; at most one animated hero, measured GPU/CPU behavior |
| D-21 | MVP B/T | Render SSR/static fills, client shader, duplicate chart instances | Correct client boundary, unique SVG IDs, actual parent sizes, no hydration/uniform/compile errors |
| D-22 | MVP B/M | Copy/scroll/hover/expand and state transitions | Useful restrained motion; no scroll-jacking/heavy 3D/per-frame data noise or financial digit fiction |
| D-23 | MVP M/B | Fonts/assets/licenses/load requests and bundle/runtime review | Approved locally loaded fonts/needed weights/notices, no remote font/widget/tracking surprise; actual measured results only |
| D-24 | MVP M/B | Claims, metrics, logos, testimonials, “live,” security proof and footer links | Only actual or clearly labelled illustrative facts; no fabricated partners, audit/certification, savings, addresses, or customer activity |
| D-25 | MVP B | Full signing review / disconnected/wrong-account/wrong-network behavior | Exact account/contract/method/quote/amount/deposit shown; no hidden delegation or expanded-signature fallback |
| D-26 | MVP M/B | Final visual critique against brief and reference | Fix and recheck three highest-impact weaknesses; no generic template approval without evidence |

## 11. Technical correctness, secrets, and operations

**7 November explicit policy-workshop extension:** O-01/O-02 now apply to `/policy` and `tests/frontend/policy.test.ts` / `browser/policy.spec.ts`. Required adverse cases include malformed/repeated JSON, missing limits, conflicting rules, unknown provider, unrecognized language, explicit review/versioning, changed-registry/stale-project rejection and prior-version preservation. Approval is explicitly local demo state, not authenticated capsule creation. The optional adapter is a mocked draft-only integration seam; no real LLM inference or automatic activation is claimed. See [policy workshop](docs/POLICY_WORKSHOP.md) and BUILD_LOG.md section42 for exact verification.

| ID | Priority / level | Requirement and case | Expected evidence / result |
| --- | --- | --- | --- |
| T-01 | CORE U/T | Money parse/format round trips: >2^53, 24 decimal places, exponent/negative/extra precision/overflow | Exact strings/integers or rejection; no financial Number/float conversion |
| T-02 | CORE U/T | Nano timestamp boundaries, IDs/accounts/public keys and canonical encodings | Stable bounded types, chain-time checks, independently reviewed hash goldens |
| T-03 | CORE U/S/M | Audit every public mutation, private callback, storage prefix, state transition | Explicit caller/state/deposit/bounds rules; no arbitrary transfer or settlement setter |
| T-04 | CORE U/S | Full record quotas, long fields, insufficient storage credit, pagination requests | Bound/deny safely; no unbounded owner-funded growth or callback work |
| T-05 | CORE U/S/M | Properties across generated operation sequences and interleavings | Arithmetic, replay, reservation, allocation/refund invariants hold after every committed receipt |
| T-06 | MVP T/M/B | Local preview and Rust Gate share fixture vectors; bypass preview | Equivalent supported rules on vectors; Rust remains authority; no claim TS tests prove deployed enforcement |
| T-07 | MVP T/B/M | Inspect production bundle/public routes/environment prefixes/URLs/logs/exports with harmless canaries | No signer/full-access key, credential, private prompt/artifact, or automatic sensitive storage exposure |
| T-08 | MVP T/B/M | Malicious imports/model/provider output and path/size/URL cases | Strict schema/bounds, escaped data, no instruction/method/code execution or served private directory |
| T-09 | MVP T/B | Missing/wrong network/contract/RPC or credential-bearing public URL | Testnet actions disabled/fail closed; no mainnet default or silent mock-as-live fallback |
| T-10 | MVP S/X/M | Inspect scoped key permissions, method restriction, zero-deposit and exhausted/removed allowance | One receiver/submit method/finite positive gas; forbidden calls/deposit fail; owner recovery stays human-controlled |
| T-11 | MVP M/T/B | Preferred connector and scoped runner; incompatible key plugin or permission failure | No forced peers/unapproved plugin install or fallback to owner full authority |
| T-12 | MVP T/B/X | Node RPC version differences/finality/receipt completeness | Supported status method/fallback used, actual transfer and callback checked; missing evidence stays unresolved |
| T-13 | MVP M | Dependency purpose/version/engine/peer/license/source review | Only needed coherent packages pinned after approval; no mass installs, audit version mistaken for runtime proof |
| T-14 | MVP M/U/S | Native Rust/WASM build and approved Linux Sandbox environment | Actual commands/exit codes recorded; no mocked chain claimed as Sandbox/testnet or machine-security workaround |
| T-15 | MVP T/B/M | CLI and public app separation; attempt public purchase triggering | No hosted shared signer/write relay; local operator consent starts bounded run |
| T-16 | MVP M/B | Test cases/README/build log versus actual implemented files and output | No unrun passing tests or false product maturity; optional/incomplete features labelled |
| T-17 | MVP M | Git/change/history/fixture/release inspection before any approved publish | Preserve unrelated work and actual dates; no secrets/private output/payload in history or assets |
| T-18 | MVP M | API/wallet/SDK docs before each implementation, unavailable/conflicting source | Official current source preferred, uncertainty reported, small fallback; no guessed API or broad dependency migration |

## 12. Hackathon and persistent-session requirements

| ID | Priority / level | Requirement and case | Expected evidence / result |
| --- | --- | --- | --- |
| H-01 | MVP M | Re-read official website/HACKATHON.md before final QA/submission; compare blueprint | Date/source/differences in compliance record; live rules override old brief |
| H-02 | MVP M | Deadline/time/window and baseline/library/AI reuse history review | Submit/public repo by 14 Nov 2026 23:59 UTC; eligible announcement-window work/reuse honestly disclosed |
| H-03 | MVP M/X | Track choice versus actual NEAR functionality | Security primary, agents when real workflow fits, business conditional; no mandatory Intents/TEE name-dropping or invented scores |
| H-04 | MVP M | Person/team eligibility, other NEAR entries, repo uniqueness | Human confirmation, max two independent projects/cross-disclosure if needed; no bypass of duplicate limits |
| H-05 | MVP M | Human approval and logged-out public repo/LICENSE/README access through judging | Actual permission and public availability by deadline; proper code/dependency notices |
| H-06 | MVP M/B/X | Clean-checkout judge follows setup and do-X-see-Y successful/denied purchase steps | Reproducible commands, real expected output, safe key setup, sources/addresses/evidence/limits honest |
| H-07 | MVP M | Human X post/media with correct attribution/tags | Public real demo post says NEAR HACKATHON, @NEARProtocol, #NEARHackathon; local-only demo has video |
| H-08 | MVP M | Hosted demo, if selected, and logged-out links | Optional hosting verified; kept through 18 Nov, ideally 25 Nov; no claimed URL until real |
| H-09 | MVP M | Exact submission fields/lengths/payout account/consent/requestId and previous submission | Human-supplied real values, exact notice consent and payload approval; no stored personal payload or example send |
| H-10 | MVP M | Submission error/uncertain response/retry handling | One identity/requestId; inspect before permitted retry; 403/409 not evaded; no unapproved POST |
| H-11 | MVP M | README/UI/demo comparison for on/off-chain, script/AI, local/Sandbox/testnet and validator boundaries | All integration/payment/privacy/security/outcome claims match actual evidence |
| H-12 | MVP M | Development instructions and external actions at each milestone | No installation/Git init/commit/signing/funding/deploy/post/publish/submission implied by documentation approval |
| W-01 | MVP M | Future session reads AGENTS, blueprint, specs/compliance/latest log | Correct stage, small scope, preserved work, and explicit next permission gate |
| W-02 | MVP M | Build log updated after each meaningful change/check/interruption | Dated files/decisions/actual commands/results/unrun tests/blockers/next step; no secret contents |
| W-03 | MVP M | Work scope review before checkpoint | No delegated agents without request, no large unsolicited implementation, no overlapping design installs |
| W-04 | MVP M | Name/domain/package/trademark and asset-license review before public launch | Human decision and actual checks; no legal clearance claim from a provisional name |

## 13. Deferred features — conditional only

| ID | Priority / level | Requirement and case if approved later | Required result before any claim |
| --- | --- | --- | --- |
| O-01 | COND T/B/M | LLM policy compiler returns malformed/conflicting/unknown/invented limits or providers | Strict schema/cross-field checks, exact human review, no silent activation; default credential-free path still works |
| O-02 | COND U/S/T/B | Rule suggestions or policy revisions from historical evidence | Human approves new authority; old capsule/hash/approval never broadens silently |
| O-03 | COND T/B/M | URL network reachability checks | New criteria/cohort version, allowlists/SSRF/timeout/size/rate protections; syntax-only v1 never re-labelled reachable |
| O-04 | COND M/X | External commercial provider integration | Provider/adapter payment support actually tested; no demo catalogue rebranding as merchant acceptance |
| O-05 | COND M/X | Intents/Chain Signatures or other asset rail | Real requirement/docs/network/security/finality evidence and explicit human approval; no Intents testnet invention or mainnet fallback |
| O-06 | COND M/T/X | NEAR AI Cloud/TEE/attestation | Concrete privacy need and verified connection/workload/response evidence; no logo or model-output security guarantee |
| O-07 | COND T/B/M | Reputation, advanced charts, renewals, notifications, or provider rankings | Enough honest comparable data/support, sample/period/limits, owner control; not default MVP scope |
| O-08 | COND U/S/M/X | Catastrophic callback recovery or contract migration | Reviewed evidence-backed exact-once reconciliation; no owner-supplied false failure, budget reuse, unsafe timeout, or hidden upgrade |

## 14. Blueprint traceability and milestone exit gates

| Blueprint requirement family | Coverage |
| --- | --- |
| Mandatory hackathon/meaningful NEAR + tracks + external-action limits | H family, T-09 through T-18, W family, O-05/O-06 |
| Sections 2–3 niche, recurring workflow, quote/capsule/task journey | C/Q/G/A/S/R/V/I families, D-01/D-05 |
| Sections 4.1–4.4 capsules/Gate/Lab/receipts | C/Q/G/A/S/R families |
| Sections 4.5–4.7 intelligence, optional compiler/suggestions, exact approvals | I/A families, O-01/O-02/O-07 |
| Sections 1 and 5 visual reference, landing/app, motion, evidence | D family, H-11 |
| Section 6 palette/type/dithercn/accessibility/no false claims | D-06 through D-26, W-04 |
| Section 7 contract/canonical terms/budgets/async/privacy/trust | C/Q/G/A/S/R/V/T families |
| Delivery phases/minimum criteria/prompts/Section 10 worked examples | All CORE/MVP cases; simulations versus chain source explicit |
| Tool/reference catalogue and skills appendix | T-13/T-18, D-15/D-23, W family; references are not instructions to install everything |

**Current contract gate:** foundation/funds/project/commitment/outcome code passes current local unit and combined Sandbox regression. Maximum indexes and deliberately modified callback-catastrophe artifact have separately labelled evidence. A mocked callback result is not payment proof; measured samples do not constitute complete requirement traceability or a security audit. Further code changes require fresh applicable tests.

**Complete demo gate:** compatible CORE/MVP plus P-family project/demo cases, actual testnet success/denials and source-accurate report/UI. Research checks remain tested regression; no fabricated deployment/provisioning/acceptance. Deferred features do not become automatic requirements. An incomplete case stays disclosed, never called passed/security audited.

## 15. Direction-change acceptance matrix (partially verified locally)

Project/commitment/evidence SDK cases, independent Node commitment/hash/resource/report checks and recovered combined LOCAL agency/report flow pass. P-14 expanded maximum sample and P-14/G-12 oversized-proposal unit/runtime rollback pass on current artifacts; not every possible full history or exhaustive worst-case proof. P-19 seeded browser/disclosure UX and P-21 local interface now have browser/capture evidence; this does not prove authenticated owner/client access or public chain integration. P-20 public testnet and P-22 public claims/release remain unverified. No entire-row/whole-product acceptance is inferred from a test count.

| ID | Priority / level | Case | Required result |
| --- | --- | --- | --- |
| P-01 | CORE U/S | Owner creates bounded project and funded Client Work Capsule | Opaque project/task/criteria references, immutable budget/revision, separate storage/funding |
| P-02 | CORE U/S | Agent/wrong owner changes project status/revision or mismatched expected revision | No authority/state write; exact human state-change guard |
| P-03 | CORE U/S | Pause/cancel/revise then submit or approve old request | Active/current revision required; no stale revival/transfer; pending payment preserved |
| P-04 | CORE U/S | Cross-project ID/revision or old request on new capsule | Hard binding failure, no reassignment after payment |
| P-05 | CORE U/S | Allocate multiple capsules/agents under one project | Original allocations sum<=ceiling; concurrent spending cannot bypass disjoint funding; refunds do not refill delegation |
| P-06 | CORE U/S/T | Canonical20×12 fixed recurring charge plus fees/taxes |240 full minimum commitment (excluding separately explicit fees); due-now/future exact; checked overflow rejection |
| P-07 | CORE U/S | New bounded recurring request under RequireApproval vs Forbidden | Review by default, hard-denial if forbidden; no holds while waiting; approve exact current state only |
| P-08 | CORE U/S/T | Unknown fees, unbounded renewal/usage or malformed commercial terms | Reject unsupported/unbounded terms; no zero assumption, forecast or unlimited approval |
| P-09 | CORE U/S/T | Immediate funds fit but full obligation exceeds remaining authority | No payment; per-commitment/project ceiling enforced against S+R+C |
| P-10 | CORE U/S/T | Two distinct quote IDs/prices for same project/vendor/plan/resource | Canonical deterministic duplicate protection; request/hash replay remains independent |
| P-11 | CORE U/S | Parallel/approval-wait duplicate resource claims | Atomic claim on authorization; pending approval holds none; second approval rechecks |
| P-12 | CORE U/S | Success/failure/unknown/duplicate callback with future obligation | Success retains C, confirmed contingent initial failure releases exact R/C/claim, unknown retains all |
| P-13 | CORE U/S | Revoke/close while future obligations exist | No cancellation claim; owner return excludes C; no quality/timeout release |
| P-14 | CORE S/M | Schema2 maximum records/scopes/terms/resource/evidence and callback costs | Prepaid bounds/margins remeasured; old artifact metrics not reused as new proof |
| P-15 | MVP U/S/T | Settled payment with failed/not-evidenced provisioning | Independent evidence/status; payment immutable; fixture not a provider-signed live event |
| P-16 | MVP T/S | Agent asserts completed without objective report | Unverified assertion only; no PASS/human acceptance from it |
| P-17 | MVP U/S/T | Fixed resource/website check PASS/FAIL/ERROR and altered digest/criteria | Exact bytes/criteria/tool/time/scope; no arbitrary URL fetch or end-to-end quality proof |
| P-18 | MVP U/S/T | Explicit owner accepts/rejects exact report; wrong caller/hash/repeat | Bound human identity/time; no agent impersonation or payment/commitment change |
| P-19 | MVP T/B | Read-only project report disclosure/scope/totals | Canonical S/R/C/available values; no unrelated project, keys/prompts/private artefacts/account IDs by default |
| P-20 | MVP S/T/X | Repeatable fictional agency database workflow + adverse attempts | One supported real payment, fixture provisioning/check/receipt/report; source/network clearly labelled |
| P-21 | MVP T/B/M | Overview/detail/review/receipt/report/Replay Lab | Due-now/full-term and lifecycle axes readable, paper/ink/lime/dithercn preserved, no empty modules |
| P-22 | MVP M/X | Testnet claim/public/demo compliance | Exact approved accounts/actions and actual evidence; no mainnet/FX/provider/market/AP2 claims |

Brief section17 coverage: valid/wrong-agent/revoked/paused/expired/stale/tampered/quote expiry via P-01..04 and existing C/Q/G/A; recurring/unbounded/usage/budget/duplicate/concurrency via P-05..13; timeout/callback/failure via S/R and P-12..14; provisioning/assertion/check/acceptance via P-15..18; scope/report/UI/demo via P-19..22. Unimplemented scenarios remain explicit limitations.

P-14/G-12 regression detail: oversized project IDs and expected quote hashes must fail before request/hash/persistence work, with no capsule/index growth, quote consumption or transfer. Bounded malformed hashes remain ordinary deterministic mismatches. Verify unit and actual Sandbox rollback separately; a failed ABI/input transaction does not create a stored denial.

## 16. Registered-quote frontend/agent checkpoint

Seven added contract SDK cases cover recipient-copy/hash tampering, quote expiry, replay preservation, cumulative overspend, revoked authority with pending reservation, exact approval binding/current-state recheck and confirmed transfer failure. The full147-test SDK run passes; mocked promise outcomes alone are not payment proof.

Frontend parser/browser cases cover canonical IDs-only unsigned proposals; tampered recipient/transfer; expired/revoked approval review; duplicate/reused receipts and replay; inconsistent cumulative balances; exact request/hash binding; successful private callback versus failed/missing evidence; malformed/oversized/duplicate-key input; clear/read/reimport races; no-JS fallback; memory-only/no-network/no-signing boundaries; responsive light/dark keyboard/axe/no-overflow checks. Recorded frontend totals67 Node and73 Chromium include earlier features, not67/73 new acceptance rows.

The root browser run imports all three actual completed LOCAL agency bundles (settled70/50/0, each R0), separately labelled from synthetic fixtures. The actual-file case skips in a fresh web checkout without private execution artifacts; copying `.local` into a clone is prohibited. These checks support LOCAL P-19/P-21 observation only, not completed public P-20/P-22, independent chain verification, full human visual review or a passing all-mode clone. Exact commands, checkout coverage, failures and remaining gates: BUILD_LOG.md section43 and the release record.

## 17. Working testnet MVP — in progress, Replay Lab deferred

8 November first backend stage: `tests/frontend/testnet-rpc.test.ts` adds8synthetic tests for explicit named-testnet targets, RPC endpoint/credential restrictions, same-final-block reads, pinned operator/code/schema/network, syncing rejection, selected project/capsule/provider/quote bindings, exact integer reports/disclosure, missing/malformed/duplicate/oversize replies, sanitized RPC errors, no write/retry method and cancellation before network. All93frontendNode/115backendNode/type/lint checks pass locally. These mock RPC replies are not public-network observations. Transaction-transfer-callback proof, real wallet signing, restricted-agent public execution, browser integration and new clean-checkout tests remain pending. The human explicitly requires a stop/go-ahead before starting the new Replay Lab; existing regression/simulator cases do not satisfy that separate task. Exact current outputs and scope: BUILD_LOG.md section45.

Second backend stage adds23synthetic `testnet-evidence.test.ts` cases: exact transaction/agent/approval identity and calls, native success/failure, wrong-key rollback, replay-original separation, no-payment/approval wait, graph/data dependency/transfer substitutions, callback failure/quarantine, historical code/current-view timestamps, non-final/incomplete/timeouts/shard errors, refund exclusion, large amounts, exact future commitments and idempotent observations. Full116frontendNode/115backendNode/type/lint pass. R/S/T evidence parser coverage does not satisfy public X cases, actual restricted-key setup or entire acceptance rows. No new UI/build/browser/clean-checkout/SDK/Sandbox run claimed. [Observer reproduction/boundaries](docs/TESTNET_SETTLEMENT_OBSERVER.md); exact results in BUILD_LOG.md section46.

Review/access foundation adds20synthetic `action-review.test.ts` cases: exact receiver/submit-only ordinary access keys, finite nonzero cap/recovery presence, full/gas/wildcard/admin/unsafe nonce/duplicate/incomplete-list rejection; pinned unsigned submit/owner pending approval and separate deposit/price/full commitment; revisions/expiry/revocation/quote/hash/role changes; fresh confirmation versus changed call/nonce/allowance/evidence/transport, expired/reconstructed reviews, getter/cycle/size bounds and cancelled/sanitized RPC failures. Full136frontendNode/115backendNode/type/lint pass. This is not an actual restricted key installation, wallet signature, signer run, browser acceptance row or public X evidence. [Exact current scope](docs/TESTNET_ACTION_REVIEW.md); package sources were read without install/execution. BUILD_LOG.md section47 records exact outcomes and next steps.

Single-attempt groundwork adds20offline `tests/near/single-attempt.test.ts` cases: marker/identity-before-invocation ordering, exclusive duplicate/concurrent/cross-process claims, interrupted-run blocking, changed-context same-request slots, exact fresh reviews/confirmation/intent, HTTP/owner exclusion, sanitized faults/deadlines/cancellation/expiry/late outputs, journal failures/forged leases/corrupt markers and traversal/non-directory/junction rejection.20nearNode/136frontend/115backend/type/lint pass. Initial18/20failure under concurrent QA and corrected phase-specific deadline tests are recorded, not erased. No test signs/verifies actual transaction bytes or submits to a chain; G/R/T boundaries are partly exercised, not whole acceptance rows. [Reproduction/limits](docs/LOCAL_SINGLE_ATTEMPT_EXERCISE.md); SDK67-archive metadata/notice review is not admission or security audit. BUILD_LOG.md section48 contains exact results.

Owner/provider setup groundwork adds `tests/frontend/setup-review.test.ts`: exactproject/capsule/provider/quotecreation signatures, separate ceiling/funding/storage/fullcommitment, samefinalblock/key/role/ID/project/scope/deposit bounds, integeroverflow, stale reviews, previousquoteintegrity and untrusted/mutating input/cancellation. Sharedunsignedreviewencoder preserves earlierpurchasing tests and rejects nonJSON/getter/sparse/nonindex arrays. This supports selectedC/Q/P/Tlocalreview boundaries, not actualhumanactivation, walletsigning, Sandbox/publicX or wholeacceptance rows. [Exact implemented scope](docs/TESTNET_SETUP_REVIEW.md). Section49records finalcommands/counts, initialfixturetypecheckfailure and remainingSDK/public/admin/outcome gates.

Finalsection49checks:23newsetupcases included in159/159frontendNode;20/20offline nearNode and115/115backendNode/type/lint/diffcheck pass. No newbrowser/build/clone/Rust/SDK/Sandbox/publicX run. Report-source/rootlock/UI/paymentauthority unchanged; signing remainsdisabled and firsttaskstillinprogress.

Section50owner/outcomereview:27newsyntheticcases included in186/186frontendNode;20/20nearNode/115backendNode/type/lint/diffcheck pass.147/147existingLinuxRustSDK plus strictClippy/format freshlypass (hostmocks, notSandbox/testnet). SelectedC/Q/A/S/R/V/P/Treview checks cover actual fixedmethods, stale/terminal/currentrevision, immutableledgers, unresolvedrefund/callback, recurringfuturecollateral, exactartifact/report and evidence/outcomeacceptance hashes. No wholeacceptance rows, ownerwallet/restrictedsigner, actualpublicprovisioning/settlement or finalbrowser/clean-checkout completion follows. [Reproduction and limits](docs/TESTNET_OWNER_OUTCOME_REVIEW.md).

Section51wire/localcrypto:40/40nearNode (20new),186frontend/115backend/type/lint pass.1/1offlineRustharnessintegration checks24V0byte/hash/layout vectors plus actualephemeralNodeEd25519 verification/corruptionrejection; lockedofflinealltargetClippy/format pass. This supports selectedT-01/T-02/T-08/T-09/T-10/T-11/R-03/R-06/R-09 evidence at codec/offlinejournal level only. No newcontracthost/Sandbox/publicX/browser/cleancheckout run, no wholeacceptance completion or publicsigner/settlementclaim. [Scope/reproduction](docs/TESTNET_TRANSACTION_CODEC.md).

Section52signedlocalrunner:64/64nearNode (24new),186frontend/115backend/type/lint;1offlineRustparity/Clippy/format pass. SelectedT-02/T-07/T-08/T-09/T-10/T-11/T-15/R-03/R-06/R-09 samples cover durableone-shotaccount/key claim, exactsignedbyte/RPCshape, simultaneousprocesses, cancellation/expiry, oversized/stalled/errorresponses and unknownidentity retention. No secretloader/defaultnetwork/publicbroadcaster or actualsettlement/provisioning; no sequentialsamekeypublicnonce allocator (guardneverreleases). No wholeacceptance completion, newcontract/Sandbox/browser/cleancheckout proof. [Reproduction/limits](docs/LOCAL_SIGNED_RUNNER_EXERCISE.md).

Section53localnonce:83/83nearNode (19new),186frontend/115backend/type/lint;1offlineRustparity/Clippy/format pass. SelectedT-02/T-07/T-08/T-09/T-10/T-11/T-15/R-03/R-06/R-09 localcases add exactpriorfinaltransaction/purchase/keynonce reconciliation, permanentanchor/noadoption,3boundedsequentialsamekeyrequests andcrossprocessnextslotconcurrency. Unknown/pending/inclusion/highernonce/clone/oldfiles failclosed; originalrequestjournal andcontractreservation/commitment/outcome fieldsunchanged. No admittedHTTPadapter/secretloader/publicrunner or wholeacceptance/publicsettlement/browser proof. [Limits/reproduction](docs/LOCAL_SEQUENTIAL_NONCE_RECONCILIATION.md).

Section54processkey:95/95nearNode (12new),186frontend/115backend/type/lint;1offlineRustparity(24vectors+2actualephemeralsignatures)/Clippy/format pass. SelectedT-02/T-07/T-08/T-09/T-10/T-11/T-15/R-03/R-06/R-09 cover boundedPKCS#8injection/publicmismatch/nofallback, secret-slotremoval/noinheritedchildslot, sharedreview/signaturechecks, dispose/reload/clone/scope refusal and existingunknown/sequentialmarkers. Onlygeneratedinmemorykeys; no realcredentialread/publicsigning/on-chainkeypermission/wholeacceptance or browserproof. [Format/reproduction/limits](docs/RESTRICTED_PROCESS_KEY_INJECTION.md).

Section55 connected fixture:108/108nearNode (13new),186frontend/115backend/type/lint pass. Synthetic P-15..20/V-08/S/T composition joins the existing observer, fixed local artifact check, separate unsigned owner reviews and receipt/report; no owner writes/automatic acceptance/provider HTTP. Failed/unknown payment stops; failed/missing delivery after settled payment preserves spend; stale evidence cannot become current acceptance. [Rehearsal and limitations](docs/CONNECTED_FIXTURE_WORKFLOW.md). Actual public P-20 and whole-MVP acceptance remain unverified. First parallel near run107/108hit an existing300ms timeout assertion (safe pre-invocation stop); isolated near rerun108/108passed, not a permanent timing fix.

Section56 nonce readback:120/120nearNode (12new),186frontend/115backend/type/lint pass. Selected S/T/R synthetic cases reuse historicalcode/receipt/native-transfer/private-callback evidence and compare exact ordinary numeric transaction/key nonce at one final block. Pending/unknown/unsafe/highernonce/mixedkeys/permissionbroadening/cancellation/forgedtokens fail closed; no money/key/journal changes or resend. [Identity/readback limits](docs/SIGNED_AGENT_NONCE_READBACK.md). HTTP adapter is read-only; no actual network transaction, signer/publicrunner or whole-MVP acceptance claim.
