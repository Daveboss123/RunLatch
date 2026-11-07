# RunLatch visual reconstruction — 7 November 2026

Governing brief: `C:\Users\David\Downloads\RUNLATCH_ROSTER_MOTION_AND_DITHER_DESIGN_BRIEF.md`, all 1,095 lines read. This is a correction of the existing UI, not a new application. Product direction, Rust authority, exact accounting and protected external actions are unchanged.

**Latest governing work:** full1652-line `RUNLATCH_FULL_PRODUCT_UX_MOTION_AND_TECHNICAL_AUDIT.md`, Section14, plus the human's scroll-linked bar/stronger buttons/new-tab tools/single mobile icon/tighter closing corrections. The initial audit table below is retained as history, not a missing-feature checklist. Source truth: [FULL_PRODUCT_TRUTH_MAP.md](FULL_PRODUCT_TRUTH_MAP.md); actual changes: [FRONTEND_CHANGESET.md](FRONTEND_CHANGESET.md); outcomes: BUILD_LOG.md sections38–40.

## Audit before implementation

| Responsibility | Existing files | Gap / disposition |
| --- | --- | --- |
| Narrative | `src/app/page.tsx` | Hero, board, comparison, simulator, receipts, report, proof, architecture exist. Comparison is static; commitment, explicit lifecycle, capability matrix and FAQ are missing. Recompose rather than discard working demos. |
| Typography / themes / layout | `src/app/globals.css`, `src/app/layout.tsx` | Self-hosted Space Grotesk / Inter / IBM Plex Mono and paper/ink/lime exist; pure-black dark is retained. Motion timings scattered, repeated section density. Add tokens and differentiated compositions. |
| Text / reveals | `animated-heading.tsx`, `reveal.tsx` | Per-heading scroll listeners, decorative duplicated words; Reveal only used in closing. Replace with one-time observed semantic line entrances / group choreography. |
| Hero dither | `animated-latch.tsx`, `latch-field.tsx` | Working 24fps/3px installed engine with pause/reduction/loss fallback. Composition is a large latch plus beams, not request-to-receipt. Recompose shader and matching SVG; keep one canvas. |
| Static textures / budgets | `budget.tsx`, `src/lib/dither/style.ts`, `fill.tsx` | Correct seeded partition already present. Extend with interactive fixed-quote commitment visual; never count initial payment twice. Static masks only. |
| Navigation / footer | `header.tsx`, `footer.tsx`, `display-settings.tsx` | Routes, native non-modal mobile menu/Escape/focus, memory-only theme controls exist. Add scroll compaction, active route and consistent feedback; retain tools-only strip. |
| Gate | `simulator.tsx`, `src/lib/preview/*` | Real deterministic non-authoritative preview exists with 29 ordered checks/15 Rust parity vectors. Preserve inputs/denials, improve decision marker and transitions; fix /gate heading order with configurable semantic level. |
| Evidence / reports | `receipts.tsx`, `tabs.tsx`, `report-preview.tsx` | Seeded state examples and export work; receipt lacks evidence-layer inspection. Add a structured layer selector without inventing hashes/transactions. |
| Project workspace | `run-board.tsx`, `demo-walkthrough.tsx`, `/gate`, `/demo`, `/docs` | Keep these working views. No contract, signing, callback resolver or payment interface change. |
| QA | `tests/frontend/browser/landing.spec.ts`, frontend/preview suites | Preserve all adverse cases; update section-order expectation only for the intentional expanded narrative and add new interactions/widths/route axe coverage. |

No supplied recording found by the non-hidden workspace glob; historical `.local/ui/v1-motion.webm` is available but predates latest route work, not current visual proof. Previous V1 screenshots/tests are historical.

## Art direction: the bounded passage

A request begins diffuse, enters a finite capsule, meets a narrow Gate and resolves into receipt rows. This is an explanatory composition, not a simulated chain event. The human's later six-image feedback supersedes the initial left-aligned/side-by-side hero: a centred proposition and compact unboxed interactive passage lead into real seeded project data. Operational content remains left-aligned. A sticky cancellation story raises the question answered by the Gate; a fixed quote then makes future exposure tangible. Evidence becomes a document, not another feature card.

- **Dark-first after human steering:** paper #000000, panel #0C0C0C, ink #F7F7F2, muted #A8A8A8. Light remains selectable: paper #F7F7F2, panel #FFFFFF, ink #171916, muted #686D65, lime #C6F36B. Server and initial client state agree; no light flash or persisted preference. No new fonts/dependencies.
- Hero: centred semantic HTML heading/context/copy/actions, compact request/capsule/receipt composition below; no text behind texture. 2px Bayer8 field,24fps cap, slow low-amplitude tone motion, no flashing or palette cycling. Keyboard/touch range and pointer lens only explore the illustration; explicit pause and matching SVG fallback.
- Narrative: hero → seeded board/tools → sticky problem → existing Gate → capsule/full commitment → linked lifecycle/receipt inspector → selected report → dated tested enforcement → NEAR architecture → FAQ. Redundant later capability matrix is relocated to Docs, retaining its anchor beside proof. Footer pairs copy/action columns with a small static dither echo.
- Motion: CSS central instant/fast/base/enter/feature/hero timings and UI/enter easings; IntersectionObserver one-time groups/hero entrance, shared bidirectional opaque section-heading ink, one desktop sticky visual driven by narrative steps. Budget clip uses that same batched reader for true reversible viewport progress, never a timer/keyframe or width transition. No wheel hijack, per-character scramble, animated money or extra motion library.
- Data: native NEAR only, decimal strings/BigInt authoritative arithmetic; presets select actual immutable fixture quotes, never mutate trusted quote terms. Available now and available to commit remain separate. Pending/review is not success.
- Dither placements: hero (WebGL + matching SVG), one transition mask, budget partition, small decision mark, quiet receipt seal/closing motif (CSS/SVG). Never texture readable fields or use multiple canvases.
- Reduced motion: immediate readable text, static composed hero, no sticky scroll-linked motion/ambient strip loops. No-JS: full narrative/amounts/limitations remain readable; interactive limitation explicit.

## Reference and API checks

Actual Roster browser inspection retained from `docs/FRONTEND_REFERENCE_AUDIT.md`; fresh in-app readback at 800×620 confirms 40px Space Grotesk hero, 34px editorial section headings and 200ms color/border feedback. Reuse quality/pacing, not Roster content/assets/interface. Installed dithercn skill and landing/fields/recipes/API/quality references read, with existing source API as authority. Current official write-your-own URL HTTP200; React effect/observer cleanup docs fetched through Context7 and installed Next `use-client.md` read. Catalog setup failed with missing Linux jq, reports nothing downloaded/changed; no payment/account or OS change.

## Verification contract

Current115 backend Node/36 frontend Node/42 browser/15-vector parity/all29states and production build pass. UI unchanged during release hardening; six-width1440/1364/1024/768/390/360 captures retain210 PNGs/four homepage axe0 audits, while browser regressions additionally retain320/1280/**775**. Reverse/stationary budget, keyboard/reflow/focus, reduced/no-JS/WebGL adverse cases and16 read-only canonical exports remain preserved. BUILD_LOG.md sections38–40 retain historical failures/experiments; section41 and the [release record](release/RELEASE_STATUS.md) distinguish actual clone/licence/privacy results. Headed Edge/Chrome now verify true hidden-tab pause/resume; Safari/real hardware/manual assistive technology remain unverified.140 Rust/SDK/all-mode LOCAL Sandbox are separate from browser authority. Human visual review deferred; no publish/deploy/sign/submit.
