# Owner and provider setup — unsigned review foundation

**8 November 2026. Working testnet MVP still in progress.** These are dependency-free exact-content reviews for four existing Rust methods, not a wallet, authority activation, SDK admission, deployed workflow or Replay Lab.

## Fixed supported calls

`createTestnetReader(target).readSetupReview(action)` performs explicit, bounded read-only RPC queries and returns a deeply detached unsigned call. The exact action schema contains `method`, named testnet `signer_id`, **public** Ed25519 `public_key`, decimal-string `gas`, and typed `args`. No private key, arbitrary receiver, attached deposit, model decision, executable manifest or free RPC method is accepted.

| Method | Reviewed caller and arguments | Derived attached deposit |
| --- | --- | --- |
| `create_project` | Operator; strict opaque project/organisation/client refs, immutable ceiling, expiry and outcome-definition hash | Exact observed project storage requirement. **The ceiling is not funding.** |
| `register_provider` | Operator; immutable provider ID, separate publisher and pinned recipient | Exact observed provider storage requirement, not a payment to the provider |
| `create_capsule` | Operator; new capsule ID, complete schema2 immutable policy, explicit storage credit | Checked integer `policy.budget + storage_credit`; credit must meet the observed minimum |
| `publish_quote` | Registered provider publisher; new canonical quote input | Exact observed quote storage requirement. **The quoted price is not this deposit.** |

The call receiver is always the selected contract. Caller-provided gas must be positive and no greater than 300 Tgas; it is neither a purchase budget nor a measured gas-cost guarantee. All amounts remain decimal strings/BigInts; no money is converted through JavaScript `Number`.

Project/capsule inputs match the actual current Rust `ProjectInput`/`Policy` signatures, not the earlier illustrative blueprint or browser policy-workshop schema. No policy hash is fabricated from unsigned JSON. Quote parsing, full commitment and the **proposed** Borsh quote hash reuse existing modules. A proposed hash is not evidence of provider-authenticated publication.

## Readback and review checks

- Existing final-block preflight checks the allowed credential-free testnet endpoint, chain, syncing, expected contract code hash, operator, schema2, network tag and positive storage requirements.
- A selected public human signer key is read at the same block. Ordinary `FullAccess` permission and a safe nonce are required for these deposit-capable methods. This observes capability only: it does **not** prove human identity, recovery control, wallet authentication, signature consent or sufficient funds/gas. No human secret or broader signing fallback enters this module.
- The exact new project/provider/capsule/quote ID must currently be absent. Null is required; unavailable/malformed views and existing records are not interpreted as absence.
- Capsule review binds the active operator-owned project and exact creation revision, expiry, original allocation ceiling, bounded scope and selected provider records. It shows the complete immutable policy, not a silent modification of existing authority. The existing capsule ID cannot be reused.
- Publisher review binds the registered active publisher/recipient, quote capacity, positive quantity and canonical bounded commercial terms. The optional previous quote must have a valid existing canonical hash and matching provider/service/category/asset/quantity/recurrence. Price changes still need a new quote ID.
- The shared commitment helper distinguishes first charge and future commitment. A fixed 20 × 12 quote displays 20 due now, 220 future, 240 total; publication still attaches only quote storage. This local review deliberately declines unsupported/unbounded exposure; it is not an exact implementation of every possible Rust publication path.

`src/lib/near/setup-review.ts` validates/detaches inputs before asynchronous work. `review-content.ts` provides one bounded exact-content encoder/hash for both purchasing and setup reviews. It rejects non-JSON values, getters/toJSON functions, excessive nesting/bytes/fields, and sparse/accessor/non-index arrays. This encoding is **not** the contract's Borsh policy/request domain or a proof of authority.

Reviews expire within 60 seconds, shortened by relevant project/capsule/quote expiry. `confirmFreshSetupReview(original, fresh, {review_hash, consent:true})` requires two current in-memory-issued reviews. Exact call, target, storage, project/provider/previous-quote content, key nonce/permission and transport source must agree; backwards block/time and original expiry reject confirmation. Same relevant state on a newer final block is allowed. Confirmation returns **signing disabled** and grants no payment authority.

The reader exposes no general administrative dispatcher. Per operation it performs 9 RPC calls for project/provider creation, 11 for a capsule with one provider (13 with the maximum three), and 10 for publication (11 with prior quote), within the existing 40-call/1 MiB response/15-second request/60-second operation bounds. Only fixed view names plus account/key readback are added; no broadcast, retry or automatic network call is introduced.

## Limits and remaining work

Rust is authoritative for actual creation, registry identity, project ceilings, policy activation, record quotas, deposits and purchase decisions. These reviews are not a second purchasing Gate, a reservation, or a lease on mutable state. They do not inspect every global registry/capsule count or future interleaving, authenticate account ownership, ensure recipient existence, or verify native settlement/provisioning. Registration can still fail a global role conflict or quota at execution. No hard `DENIED` becomes approvable.

The pure preparation helper checks supplied context; only the reader performs the bounded RPC preflight/readback, and neither is a light client. All tests use `INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE`. HTTP-labelled context is not signing consent. No browser UI, SDK, signer, administrative broadcast, private key, public state query, wallet connection or testnet evidence has been run.

Project pause/revision controls, capsule revocation/close, owner rejection, provisioning/task-check/acceptance actions, an admitted human wallet flow and the actual restricted signing/agency slice remain unfinished in the Working testnet MVP. Each public account/key/deployment/signature/run still needs exact human approval. Replay Lab remains separately gated and unstarted.

## Verification

`node --test tests/frontend/setup-review.test.ts` contains **23 synthetic tests** for setup views and pure review boundaries. Coverage includes all four exact calls, separate deposits/funding/full commitment, final-block/caller/key binding, existing IDs, stale/inactive/substituted projects, scope/role/allocation/expiry/storage/overflow bounds, prior quote integrity, fresh confirmation, mutation/getter/cycle/JSON bounds, cancellation, sanitized RPC failures, no write/fallback and shared encoder regression.

Final `npm.cmd run test:frontend` → **159/159**, `npm.cmd run test:near` → **20/20**, `npm.cmd test` → **115/115**; typecheck/lint and `git diff --check` exit0. Initial21targeted cases passed; the first typecheck caught a test-only asset typed as genericstring rather than the native-asset literal. Corrected fixture and two further adverse tests pass, with no product deadline/security check relaxed. Production build/browser/clean-checkout/Rust/SDK/Sandbox and actual testnet execution were **not run** for this stage; the owned preview and historical `.next` output remain untouched. Exact command outcomes are recorded in BUILD_LOG.md section49; no whole acceptance row or deployed capability follows from these tests.
