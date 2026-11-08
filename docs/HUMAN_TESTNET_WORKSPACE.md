# Human testnet workspace — read-only, not a wallet

**8 November 2026.** `/testnet` connects the existing unsigned human reviews, captured-purchase observer and selected project report to the browser. It does **not** finish human signing or the Working testnet MVP. No public account/deployment/key/run or wallet connection is configured.

## What works locally

- An explicit named testnet contract/operator, allowlisted credential-free RPC and expected deployed code hash. Fields start empty except the allowlisted RPC. A separate read-disclosure checkbox is required; missing/invalid scope fails before RPC.
- Eight human review methods for the connected slice: `create_project`, `register_provider`, `publish_quote`, `create_capsule`, `approve_purchase`, `record_provisioning`, `record_task_check`, `record_human_acceptance`. Arguments use the existing [setup](TESTNET_SETUP_REVIEW.md), [purchase](TESTNET_ACTION_REVIEW.md) and [owner/outcome](TESTNET_OWNER_OUTCOME_REVIEW.md) schemas. Approval input is the exact `proposal` and `expected_request_hash`, not free recipient/price fields. The separate signer/public-key/gas fields cannot be substituted by approval JSON.
- Current final-block-pinned canonical review through the existing reader. Exact account, public key, receiver, code hash, method, gas, derived deposit, canonical immediate/future/full commitment and complete arguments remain inspectable HTML/text. Full capsule policy and commercial terms are visible, not replaced by a hash. Setup funding/storage/project ceiling remain separate from payment; approval and quoted price are not settlement.
- Explicit local fixture-byte selection (16 KiB maximum) for the existing objective validator. No file upload, provider code execution or artifact in an RPC request/export. Missing/bad bytes cannot prepare a passed report. Owner-recorded checks/provisioning/acceptance remain attestations, not independently verified provider delivery or real-client acceptance.
- One explicit read of a captured purchase identity through the shared transfer/private-callback/historical-code observer. A transaction hash/initial success or reported ledger resolution alone cannot become confirmed settlement. Unknown/missing callback retains unverified evidence, not a release/resend action.
- Owner-selected project/capsule/provider/quote report, with budget/expense/evidence visibility **off by default**. Only the reduced report is displayed, not the raw snapshots. The RPC still reads selected records for consistency; visibility flags do not supply on-chain confidentiality or hide requests from the RPC operator. No real savings/margin/acceptance is inferred.
- Input edits, task/method changes, clear and cancel abort/discard stale asynchronous results. No automatic reads, polling, retries, signatures, wallet discovery, server action, persistence, URL data or background purchase. Clear affects browser memory only, never reservations/commitments/authority.
- Explicitly permitted unsigned-review download, with all exact public terms/metadata and no fixture bytes, private key or signing-consent token. Export is a historical document, not a reconstitutable issued confirmation and not fresh authority.

Never paste private keys, recovery phrases or credentials. Human-held full-access secrets remain outside this app/agent. The restricted local agent runner remains Node-only and is not imported into the browser. This screen exposes no agent-submit, arbitrary pay/receiver/method/key-management/settlement resolver or administrative bypass.

## Presentation and actual QA

The fresh UI heads-up preceded implementation. Actual Roster inspection at 710×620 showed early exact terms, restrained Space Grotesk/Inter hierarchy, local table overflow and a real Upside/Floor tab change. A screenshot succeeded; wider reference/device/full-motion behavior was not verified. RunLatch reuses its own dark/paper/ink/lime tokens, self-hosted type and a quiet **installed dithercn** static divider—no copied branding/assets/product screens, new shader or design/dependency installation.

The worksheet uses normal document flow, labelled fields, wrapping exact IDs/amounts and explicit source/error/status messages. Mobile fields stack; desktop fields align in two columns. The new route alone removes the shared header's background-only theme transition after actual axe testing found temporary low contrast. No-JS guidance is ordinary server HTML because the installed server renderer emitted an empty `<noscript>`. Dropdown accessible names match visible labels without concatenated option text. Texture reduction hides the decorative divider; reduced motion disables new control transitions. Existing landing/header source is unchanged.

Actual verification:

```powershell
node --test tests/frontend/human-workspace.test.ts
npm.cmd run test:frontend
npm.cmd run test:near
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
```

- **7/7** new synthetic Node composition cases; full **193/193 frontend**, **136/136 near**, **115/115 backend**, typecheck/lint exit0.
- Isolated source copy with reviewed existing dependencies: `next build --webpack` exit0, all routes static including `/testnet`. No install or root preview rebuild. Root `.next/BUILD_ID` stays `dexkbcE6iReIohV9grell`.
- **9/9** new isolated Chromium browser cases: no automatic network/storage, scope/error focus, exact review/download/edit invalidation, missing callback, selected report visibility, cancellation/late result, real local artifact selection/bounds/privacy, no-JS, and route-only contrast behavior after navigation. Native browser fetch is intercepted by **synthetic RPC responses**: this is browser mechanics evidence, not actual testnet state or public settlement proof. No wallet/API signing was invoked.
- 390/1440 screenshots in both themes, axe with zero reported violations, 320/768/1024 reflow, keyboard focus, reduced motion and CSS-mask fallback/texture reduction passed. No shader/GPU-performance claim, real-device/Safari/screen-reader certification or complete sitewide browser release QA.
- Isolated built JavaScript search found none of `RUNLATCH_AGENT_PRIVATE_KEY`, `consumeRestrictedProcessKey`, `confirmTestnetAgentRun`, or the restricted single-attempt marker. This is a narrow bundle exclusion check, not a security audit.

Ignored captures/logs stay in the isolated QA source, not public evidence. The current port-3000 preview intentionally remains the prior build. The separate loopback QA preview is `http://127.0.0.1:3001/testnet`; do not replace the root preview or reinterpret a synthetic screenshot as a public run. Future root build/browser commands must follow the current heads-up/preview rules.

## Genuine remaining blocker

No fixed human-selected, reviewed owner/provider wallet/signing path exists. NEAR Connect's default mutable remote executors, discovery/persistence and earlier notice concerns remain unadmitted; its generic package API is not permission to silently activate a wallet. No SDK/key-plugin/new wallet package was installed or patched.

**Section59 follow-up:** the human selected CLI. [Current review/blocker](HUMAN_CLI_SETUP.md): private0.31.1 source restriction tests pass, but Windows blocked the tool build; no binary/signing admission. An existing global CLI config was found bymetadata and left unread/unchanged. Human config-handling choice is required before the official prebuilt alternative can be checked. This workspace still signs/sends nothing.

The human must identify their testnet wallet (or choose a human-operated NEAR CLI signing flow), without supplying secrets. Review that exact path's current API/source/notice/privacy/capture/retry behavior before adding it. Then obtain exact public accounts/roles/code hash/keys/receiver/methods/arguments/gas/deposits/allowance/funding/call-count approval before any public action. Every actual signature remains a human action; no agent owner/provider key or broader-wallet fallback.

After approved execution, observe native transfer/private callback/final state, run the labelled fixture check, separately record provisioning/task/explicit human acceptance, and generate selected receipt/report evidence. The Working testnet MVP remains incomplete until that network slice and signing QA actually exist. Replay Lab remains unstarted and requires a separate go-ahead after completion.
