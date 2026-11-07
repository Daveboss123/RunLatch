# Frontend reference and design plan

Checked 7 November 2026. Roster Finance was opened live in the desktop browser and Playwright. These are visual observations, not verification of Roster's market or security claims.

## Actual reference observations

- Desktop: framed content around 1,200px; an approximately 80px high navigation strip, fine rules, centered 64px Space Grotesk hero with tight line height, short centered copy and two direct actions. Product tables follow the promise, rather than a generic feature grid.
- Tables: amounts aligned in columns, explanatory sublabels, quoted terms and explicit limitations beside the action. The live quote tab switched from Upside to Floor. Selected tab semantics updated. Some unavailable actions say “Coming soon”; RunLatch will not copy those inert actions.
- Story rhythm: broad comparative timelines, narrower technical explanations, interactive terms, proof tables, objections and a closing section. Sections differ in composition and answer a concrete question.
- Motion: sampled control style has200ms color/border transitions. No scroll-jacking was observed. This is not a full animation/performance audit.
- Mobile390px: compact brand/theme/language/app navigation; large tables use their own horizontal scroll. Terms and controls stack. Captures include hero and an inspected table/quote area.
- Actual Playwright images: `.local/ui-reference/roster-desktop.png`, `roster-mobile.png`, `roster-mobile-hero.png`. The first desktop capture includes an actual transient table loading surface. Desktop-pane screenshot failed because its window was not visible; do not claim that method succeeded.

## RunLatch plan and brief review

**Audience/job:** an owner-led AI studio wants to delegate one project task without handing the agent general spending authority. The visitor's next action is to try a credential-free policy simulation.

**Palette:** paper `#F7F7F2`, ink `#171916`, muted `#686D65`, line `#DDE0D7`, lime `#C6F36B`; accessible warning/danger/success from DESIGN.md.

**Type:** self-hosted Space Grotesk headings, Inter prose/controls (human's later request, matching current Roster computed body font), IBM Plex Mono only for IDs/amounts/code. No remote font requests.

**Composition:** left-aligned, large promise beside a dithered latch/request-path field; a wide useful Project Board follows. Then a paired problem/outcome narrative, a split interactive workbench, inspectable receipts, selected-disclosure report preview, enforcement ledger, documentation and a deliberate ink footer.

```text
brand             product / simulator / evidence / docs       explore demo
large promise + actions                    request paths -> latch
wide Project Board + six exact balances + inspectable purchase rows
without bounded authority         |       with current project authority
capsule inputs + canonical quote  |       decision + checks + explanation
receipt selection                 |       evidence lifecycle
report disclosure controls        |       selected totals + expense data
enforced properties               |       actual local evidence + limits
architecture roles + docs
closing promise + useful links + precise local/production disclaimer
```

**Dither techniques:** the first pass used static FillPattern for the signature latch. Human subsequently required an animated hero; V1 now uses one bounded24fps DitherShader with original converging request paths/latch, theme ink/paper/lime, separate SVG fallback and engine reduced-motion/offscreen/hidden-tab lifecycle. fillStyle remains static for transition/budget/quiet interface. No animated dense tables; real values remain HTML and visual ratios are separate from money authority.

**Specificity review:** rejected a generic glowing background, three identical feature cards and an analytics chart with invented trends. The signature comes from the spending latch and visible canonical purchase-to-evidence mechanism. Generic design-search recommendations suggesting badges, sales forms and gold/purple did not match this brief and are not applied or persisted as another design system.

**Truth boundaries:** fixtures prominently labelled “Demo data / browser simulation.” Native NEAR only; no fiat conversion. Browser cannot authorize a purchase or impersonate owner acceptance. Actual140 SDK/114 Node/Sandbox backend checkpoint is dated and distinguished from current frontend tests. No public contract/repository/transaction link exists. Documentation links must work locally, not point to fictional GitHub/explorer URLs.

## Planned verification

Short setup stage: pinned dependencies -> registry readback -> skill load -> type/lint/build/Node/technical browser. Product stage: nine sections -> actual1440/390 screenshots -> three recorded weaknesses/fixes -> responsive320/360/390/768/1024/1440, keyboard, reduced motion, disabled-effects/no-JS, all controls/links, console/network and measured performance. These checks are pending, not claimed complete by this plan.

## Human-directed V1 correction

The human rejected the green-tinted dark surface and overly static motion. Further live Roster inspection measured its sticky81px nav, Space Grotesk/Inter pairing, word-level blur/opacity/transform entrances, and scroll text changing from slate to ink (48 slate characters at entry,32 ink/16 slate when moved toward center). This is actual DOM/animation observation, not inferred from a PNG.

Polish direction (frontend-design primary, unslop critique, dithercn engine):

- Product: project-bound purchasing and evidence for an AI studio owner.
- Character: exact, composed, technically literate.
- World: an inspectable ledger, warm paper by day and **pure black** by night, not forest-tinted chrome.
- Moments: animated proposals converging on the latch; a readable canonical purchase/evidence board.
- Signature: the latch and limited lime passage, not a generic orb or glows.

Preserve all section/content/trust boundaries. Add real locally served NEAR/dithercn marks to the previously reviewed four tool marks; source/use attribution and public brand review remain explicit, not a partner claim. One hero shader only; scroll-linked public heading ink and word reveals, sticky header/menu feedback, static financial text. User explicitly authorized these changes; V1 will be delivered for review, not presented as final visual approval.

Unslop critique guidance by Damir Sokolovsky (@heydamir), CC-BY4.0; no third-party scene/template/code asset copied.

## Registered-quote observation inspector (section43)

The local `/demo` extension reuses this day's live-reference audit and re-reviewed actual desktop/mobile captures; it is not a new live Roster inspection or a redesign. Use the existing paper/ink/lime tokens, Space Grotesk/Inter/IBM Plex Mono roles, fine rules and terms-led progressive disclosure. One semantic purchase tree serves mobile and desktop; long hashes wrap rather than duplicate tables. No extra shader, texture, dependency or borrowed reference asset is added.

The inspector's primary action is explicit local file selection. All monetary text is exact integer yoctoNEAR, with input-derived ledger labels. Distinct payment/provisioning/check/owner-action rows prevent a generic green “success” treatment from hiding paid failure. Browser fixtures remain untouched below the import boundary. BUILD_LOG.md section43 records73/73 Chromium checks including expanded-record keyboard/axe/no-overflow at320/390/768/1440px in both themes, adverse/race/no-JS checks and all three actual LOCAL imports. Four actual1440/390 light/dark captures were inspected. This is automated/local review evidence, not manual assistive-technology/device coverage or human visual approval; full human visual review remains deferred.
