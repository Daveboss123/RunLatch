# Local release-hardening record

**Scope:** item 2, requested 7 November 2026. Item 1 (human visual review) is deferred, not discarded. No interface/layout changes in this stage. This is a local source-hardening checkpoint, **not public-release clearance**.

## Completed checks

- Local Git baseline `ef0b767` preserves the existing prototype. Neutral local-only author; actual timestamps, no history rewriting. There is no public remote/deployment evidence.
- Removed the unused one-time `shadcn@4.23.0` installer, not its installed engine/skills/generated source. Kept Next, React, Tailwind and contract versions. The only override is `@typescript-eslint/typescript-estree → minimatch@11.0.1`; legacy ESLint matcher 3 remains. No force upgrade, global override or migration.
- Fresh full npm audit: **0 advisories** after the targeted change, versus the preserved 13-advisory baseline. This is registry-advisory evidence, not a security certification.
- Current source passes typecheck, strict lint, **115 backend Node / 36 frontend Node / 42 Chromium browser tests**, **15 Rust/preview vectors and all 29 check states**, and production build. Prior 140 Rust/SDK and all-mode isolated LOCAL Sandbox results remain separate until clone reproduction below.
- Installed headed Edge 156.0.4314.42 and Chrome 157.0.8103.38: four routes each, zero axe violations/page overflow. Actual `hidden → paused → visible → running` is observed for both hero and Built-with strip. Keyboard skip navigation and reduced motion pass in separate automated contexts. No page script or fake event supplied the visibility result.
- Failed visibility attempts are preserved. Playwright default focus emulation made tabs always visible; a separate empty browser profile, loopback CDP and documented `connectOverCDP({noDefaults:true})` supplied the valid observation. Native keyboard injection without focus emulation was not accepted as manual keyboard evidence. A Chrome internal TTS-extension request was distinguished from external HTTP/S; it is not a RunLatch outbound network call. Final app checks made zero observed external HTTP/S requests.
- Candidate scanner found no blocked credential/generated-path pattern matches. This bounded scan is not exhaustive secret detection. Two exact synthetic invalid-URL locations are reviewed exceptions, not blanket test exemptions.

## Licence and reuse inventory

- [Exact dependency inventory](DEPENDENCY_INVENTORY.json): **447 npm lock records**, all with declared licences; **374 installed / 73 noninstalled platform-optional**. Includes source/integrity, scope, installation state and collected-notice hashes. **18 installed packages lack a collected root/directory notice**; declarations are not substituted for missing text.
- [Installed npm notices](../../licenses/npm-transitive-NOTICES.txt) preserve collected texts. LGPL libvips/sharp platform binaries, MPL build/test code and CC-BY data must not be labelled universally MIT or ignored merely because npm audit is clean. A source repository and a hosted/bundled binary release require different artifact-specific checks.
- Cargo lock inventories include **284 contract / 301 harness records including the local roots**. Linux-filtered cached metadata supplies declared licences for **242 / 254**; **42 / 47 other-target records remain explicitly unresolved**. No Cargo lock was changed to evade this gap.
- [Cargo notice inventory](CARGO_NOTICE_INVENTORY.json) and [cached Linux source notices](../../licenses/cargo-linux-transitive-NOTICES.txt): **374 unique registry packages**, **21 without a collected root/directory notice**. Existing direct NEAR SDK notice remains in THIRD_PARTY_NOTICES. Licence text availability is not a legal compatibility opinion or a binary-distribution audit.
- Existing three self-hosted WOFF2 font files retain their unmodified OFL notices. Dithercn engine/source/skill copies retain the MIT notice; Simple Icons distribution retains CC0, separate from individual brand rights. Unslop guidance is credited under CC-BY-4.0. No Roster assets, text, screenshots or proprietary UI were copied into the app. Original source uses the root MIT licence.
- Generated Next declarations/agent guidance, registry source, skill references and asset-copy helpers are retained with provenance. AI assistance is disclosed in the README. No earlier work is re-dated as a new hackathon contribution.

## Public-release blockers and unavailable evidence

1. **Privacy:** eight files contain historical/local machine paths. The in-app `/docs` reproduction instructions also contain a local path. Preserved in private local history; public source/history and hosted output need exact redaction/disclosure review. A future publish cannot silently expose them.
2. **Marks:** NEAR official logo permission remains unresolved; the previously checked brand URL returned 404. Rust artwork has conflicting recorded CC-BY versus CC-BY-SA metadata. Keep attribution, but confirm rights or obtain approval for a replacement before public distribution. CC0 geometry distribution is not trademark permission.
3. **Artifact-specific licensing:** resolve relevant missing notices/other-target records and bundled sharp/libvips obligations for the actual deployment/package; do not call this complete legal clearance.
4. **Platform/manual review:** Safari/iOS, installed Playwright WebKit/Firefox, physical mobile/touch, screen-reader and manual assistive-technology testing were not performed. Two branded Chromium channels are not independent browser-engine coverage. Automated axe/keyboard/reflow is not universal accessibility proof.
5. **Live rules:** the last complete official rule check is the recorded 7 November HTTP200 check. A new external catalog/rules/brand lookup was not completed in this stage: Passport CLIs are missing and their remote installer requires explicit consent; no installer, authentication, paid call or project disclosure occurred. Recheck official rules and relevant organizer clarifications before publication/final submission. Do not treat unchanged local documentation as fresh web evidence.
6. **Publication target/consent:** the human reminded the agent that GitHub/Vercel publishing is available, but no exact target repository/project or privacy/logo resolution has been established here. No GitHub push, Vercel deploy, public NEAR action, payment, post or submission was performed. No signing keys enter the website.

## Actual clean-checkout reproduction

The first actual clone of candidate `4c8fde6` correctly stopped before installation: Windows Git converted Cargo.lock LF to CRLF, failing exact-byte comparison despite identical normalized contents. Failure and original clone are preserved. A targeted `*.lock text eol=lf` rule now preserves exact lock bytes; no dependency change or bypass. Fresh reproduction is pending at this saved checkpoint.

`node scripts/web/check-release-checkout.mjs` clones the committed local tree into approved temporary storage, verifies excluded/private paths and lockfiles, installs from the lock, tests/builds and checks the clone's Git status. It uses shared approved Ubuntu tool/registry/target caches, not a clean OS. It creates its own loopback production server for clone browser tests, without replacing the original preview or copying private artifacts. Exact result/commit and remaining limits will be recorded here and in BUILD_LOG.md.

Private evidence stays under `.local/release-hardening/`; the original full-audit review remains `.local/ui/full-audit/review/REVIEW.md`. Nothing is uploaded.
