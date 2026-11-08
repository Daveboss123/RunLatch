# Bounded restricted testnet runner

**8 November 2026 — locally implemented and synthetically tested. No public run is authorized or executed. The Working testnet MVP remains incomplete.**

`scripts/near/restricted-testnet-runner.ts` connects the existing exact review, process-injected restricted key, durable request journal, permanent key anchor, three-slot coordinator, V0 signature codec and bounded byte-send. It is one Node-only path to the same Rust `submit_purchase` Gate, not another policy or payment engine. There is no CLI/default environment read, wallet, hosted signer or browser import.

## Explicit entry and consent

Only a trusted operator, **after separately obtaining exact human approval**, may call `confirmTestnetAgentRun(review, consent)` and then `runRestrictedTestnetPurchase(admission, keyHandle, { reader })`. Do not construct confirmation from agent/provider/model output, a broad development instruction or a wallet connection. The confirmation is an in-memory exact-content guard, **not authentication or proof that a human approved**; the operator must enforce that external boundary.

The consent schema requires all of:

- `authorization: "HUMAN_APPROVED_EXACT_TESTNET_AGENT_CALL"`, `consent: true`, the original issued `review_hash`, and `calls: 1`;
- exact `target` (testnet, allowlisted credential-free RPC, named contract/operator, expected deployed code hash);
- exact `scope` (separate agent account, bound Ed25519 public key, designated distinct recovery public key and positive finite allowance cap);
- the original reviewed `call` (receiver, sole `submit_purchase`, exact project/revision/capsule/request/quote/hash arguments, decimal gas, zero deposit);
- the original reviewed native-NEAR `exposure` (canonical recipient/immediate amount, future/full commitment, gas/deposit). The review hash also binds current canonical quote/provider/policy/project/ledger/access state. Display that complete review, not only the hash, before approval.

Each distinct request needs its own exact human-approved review/confirmation. A confirmation cannot be cloned/deserialized or reused after entry. Setup/deployment/funding/key installation, owner/provider/outcome actions, public publication and submission are **not** included. No real accounts/keys were discovered, loaded or requested in chat.

The existing process-key loader consumes only an explicitly supplied private process slot and returns an opaque handle. It never enables signing merely by loading; `public_signing_enabled: false` remains a consistency-only handle flag. The admitted adapter separately requires the issued confirmation and exact handle/target/agent/recovery/allowance binding. LOCAL and admitted adapters share consumed requests. Disposal disables both without erasing/releasing historical claims; secure-memory erasure is not promised. Never inject owner/provider/deployer/recovery keys, write secrets to files, print them, or put them in the browser.

## Shared execution order

1. Validate issued exact confirmation, live issued key, target and deadline. Public HTTP mode fixes the production namespace to `working-mvp`, uses native fetch for reads/writes and wall-clock time; no custom relay, clock or marker namespace can evade prior claims. Tests can use explicitly injected transport/clock/namespace and retain their synthetic label. No module performs an automatic import-time network call.
2. Read the captured last identity from the same permanent key anchor/three-slot history. When one exists, use [identity-bound nonce readback](SIGNED_AGENT_NONCE_READBACK.md): one receipt-status lookup, actual canonical native transfer/private callback/historical code/final-state checks, terminal payment/no-payment evidence and same-final-block exact restricted-key nonce. No polling, method fallback or retry. Unknown/pending/callback-unproven/unsafe/divergent nonce cannot advance.
3. Re-read the exact current purchase review **after** that reconciliation. Require original issued content, unchanged target/call/state/permissions/funding, current project/capsule/quote authority and unexpired original/fresh review. This is not a lease on chain state: Rust rechecks on execution and can deny.
4. Sync an exclusive contract/capsule/request claim, then exclusive account/key slot/anchor **before signing**. The exclusion hash domains and directories are unchanged across modes. A legacy LOCAL one-shot claim or incompatible/partial history cannot be adopted, reset or migrated. Every next slot checks the issued prior identity/access/block against the new review. At most three distinct calls/key; old persisted status is not fresh evidence.
5. Use the shared Node Ed25519/V0 exact-review signer. Fix nonce+1 and the fresh reviewed block hash, verify/inspect the signature, sync exact public identity in key history and request journal, then sync invocation entry. The next nonce must itself fit ordinary safe JSON readback; exact u64 codec support does not repair unsafe RPC numbers. Signed bytes/private keys are never journaled.
6. Enter **one** bounded `broadcast_tx_async` with the exact signed bytes, fixed allowlisted endpoint, no credentials/referrer/cache/redirect, at most12KiB request/16KiB response and15seconds per phase. Accept only strict JSON-RPC/exact-hash acknowledgement. HTTP/RPC/content/duplicate/size errors, wrong hash, timeout, cancellation and late output remain unknown after possible invocation. No SDK convenience send, alternate method, owner fallback, re-sign/resend, release or cleanup is available.
7. Return identity/attempt/broadcast facts with `payment_evidence: "NOT_OBSERVED"`, `public_execution: "NOT_PROVEN"`, no signing bytes and no grant of payment authority. A signature, entry marker or acknowledgement is not inclusion/settlement. Observe the same captured transaction separately through the existing settlement observer, then run the [labelled fixture workflow](CONNECTED_FIXTURE_WORKFLOW.md) and separate owner provisioning/check/explicit acceptance/report actions. A provisioning failure never refunds spent NEAR or releases future commitment.

The timeout mechanism is reused rather than duplicated. If signing/capture is interrupted, the claim/partial history remains blocking even if the result lacks an in-memory identity; inspect preserved markers, never rerun an uncertain job. Filesystem integrity checks reject symlinks/junctions, oversized/partial/gapped history and competing claims. This is crash/concurrency protection for trusted local operator code, **not** a sandbox against malicious same-process code, an OS administrator, RPC operator, owner, provider or deployer. No light-client verification, security audit or production-custody claim.

## Actual verification

```powershell
node --test tests/near/restricted-testnet-runner.test.ts
npm.cmd run test:near
npm.cmd run test:frontend
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
```

- **16/16** new synthetic cases: full reader/claim/capture/send order; exact consent and getter refusal; forged handles/confirmations/target/transport/deadlines; production-mode restrictions without network; changed/owner/stale review; wrong/disposed key; uncertain acknowledgement/error/late/cancel; three calls with shared final readback/fourth refusal; pending prior; LOCAL/token isolation; legacy/partial history; shared signer consumption; competing calls; safe next nonce. Generated private material stays in memory.
- Full root **136/136 near**, **186/186 frontend**, **115/115 backend**; typecheck/lint exit0. The existing timing-sensitive runner test passed; no timing fix or test weakening is claimed.
- Approved Linux `test-transaction-codec-linux.sh`: **1/1 offline Rust parity**,24V0 vectors and two independently verified ephemeral signatures (including the changed shared injected LOCAL signer), Clippy/format exit0. Wire/crypto implementations and harness/contract dependencies are unchanged. This is not a new Sandbox node/public deployment or public signature test.
- Static `src` search finds no imports of runner/admission/process-key modules. No new browser build/bundle scan, browser/a11y/UI/preview/release QA or actual HTTP transaction is claimed. No npm/Cargo dependency, lock, licence, Rust contract or SDK admission changed.

Current Context7 `/near/docs` checked `broadcast_tx_async`/FINAL receipt semantics; Node24 official docs checked supported Ed25519 `sign(null, …)` and AbortSignal/fetch cancellation. Existing request/response/timeout/source guards are preserved. Root SDK remains unadmitted; this path uses already reviewed built-ins/codec instead.

## Remaining gate

Next connect the human owner/provider signing interface (fresh UI heads-up/reference review first), then present the exact public accounts/roles/code hash/keys/receiver/methods/args/gas/deposits/allowance/funding and call count for approval. Only an approved actual run can supply public native transfer/callback/fixture/receipt/report evidence. No accounts/deployments/keys/signatures/payments/public posts/publication/submission/private disclosure occurred. Replay Lab remains deferred until the Working testnet MVP is genuinely complete and the human gives a separate go-ahead.
