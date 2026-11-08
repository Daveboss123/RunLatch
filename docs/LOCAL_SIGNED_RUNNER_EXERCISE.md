# Signed local runner: key guard and one bounded send

**8 November 2026. Local tests only; the Working testnet MVP is still incomplete.** This milestone composes the existing issued purchase review, ephemeral signer, verified V0 bytes and request journal with a new local key guard and an injected-transport RPC send exercise. It loads no supplied secret, calls no public RPC and creates no account, key, transfer or provisioning record.

## Implemented ordering

`scripts/near/local-runner-exercise.ts` uses the existing `exerciseSingleAttempt`, without changing its request identity or failure semantics:

1. Read a fresh exact issued review and confirm its content against the original review. Both must have the injected-test source, current project/capsule/quote and restricted access, and unexpired local review time. This is not authenticated owner consent or a lease on chain state.
2. Create the existing exclusive **request claim** on the local filesystem.
3. Create and sync a **key claim** before any signature. Identity is `testnet + agent account + public key`, independent of contract, RPC endpoint, code hash, request, quote, revision or observed nonce.
4. Generate one ephemeral signature with the existing helper, using ordinary `observed nonce + 1` and the reviewed final-block hash. No imported private key or broad owner fallback exists.
5. Verify and re-inspect signed bytes; check the exact review call, nonce and block; sync the key's public transaction hash. Then capture the same observation intent in the original request journal.
6. Sync the original invocation-entry marker before calling the byte-send seam once.
7. Keep acknowledged/unknown transport state separate from purchase authorization, native settlement, provisioning and human acceptance. No send response creates payment evidence.

Request journal and signer/codec implementation are unchanged. Rust is still the only authorization/accounting authority. No TypeScript financial policy or settlement setter was added.

## Conservative key strategy and limits

`scripts/near/local-key-guard.ts` implements a **one-shot local key guard**, not a full public nonce allocator. One account/key gets at most one claim in the namespace, even across processes and after success, cancellation, preparation failure, timeout or a missing final marker. It has no release, reset, stale-lock expiry, nonce refresh or delete API. Captures require the issued in-memory lease and valid signed bytes matching the claim. Concurrent captures consume the stage before asynchronous I/O; partial/tampered markers are not overwritten.

This deliberately blocks a second request using the same key. **It does not yet support the sequential multi-request public MVP.** That needs a reviewed advancement/reconciliation strategy with exact transaction and current finalized access-key evidence; neither timeout nor a higher nonce alone should prove that the original purchase failed or its reservation can be released. The contract's pending reservations and future commitments remain untouched by all local guard operations.

The default namespace is `working-mvp`. Tests use unique isolated namespaces under `.local/testnet-mvp/key-guard/`; changing namespaces or deleting markers to evade a claim is not a recovery flow. This is not distributed coordination across workspaces, machines, network filesystems or malicious local writers. Node documents that exclusive `wx` flags may not work on network filesystems. Each existing directory/junction is checked before writes; this does not provide an atomic filesystem sandbox against ancestor replacement. File sync/exclusive-create behavior and cross-process tests do not prove crash/power-loss durability on every OS.

At most two bounded markers are written for a key, each at most16KiB. Marker contents are public account/key/target/review identifiers, nonce/block and hash only—no signed bytes, private keys, prompts, artifacts or provider instructions. An incomplete marker still blocks a new claim. A signature captured by the key guard may remain useful as public identity evidence if later request-journal I/O fails; it is not permission to rebroadcast it.

## Bounded transport seam

`scripts/near/local-broadcast-exercise.ts` has **no default transport**. It requires an explicitly injected test function, rejects the actual global `fetch`, HTTP-labelled reviews, cloned reviews and mismatched/invalid signed bytes. `local-signed-review.ts` binds verified bytes to an actual issued review and ordinary nonce/block. These checks are consistency, not Gate approval or externally authenticated signing consent.

The only request is `broadcast_tx_async`, one positional base64 string in `params`, to the reviewed allowlisted endpoint. The original signed bytes, computed transaction hash and request ID are immutable/captured. There are no arbitrary methods, provider-supplied URLs, retries, `send_tx` fallback, replacement signatures or credential-bearing calls. Request body≤12KiB; response≤16KiB; timeout≤15seconds; cancellation aborts the call and cancels a stalled response stream. Redirects are errors; credentials/referrer omitted; no caching.

An acknowledgement requires strict bounded JSON `{jsonrpc,id,result}` with the exact captured transaction hash. A correct acknowledgement is `ACKNOWLEDGED_UNVERIFIED`, **not validation, inclusion, settlement or delivery**. Transport rejection, method unavailable, nonce/RPC error, HTTP error, wrong hash/shape, duplicate fields, invalid UTF-8, oversized response or timeout is `RESULT_UNKNOWN` after entry. Nothing releases funds, commitments or key/request claims. Cancellation/expiry before a call enters no transport. Each constructed send consumes its slot even on a cancelled/expired start.

Current official Context7 `/near/docs` transaction documentation confirms that `broadcast_tx_async` returns a hash, while `send_tx` with `wait_until: NONE` returns only a final-execution-status object and does not validate/include the transaction before returning. No fallback between those distinct acknowledgements is inferred. Node24 filesystem/stream/abort API documentation was checked before implementation.

The injected transport is **trusted local test code**, not a security sandbox: a deliberately supplied wrapper could perform network I/O. The public entry point/default fetch remain absent and not admitted. The standalone send seam provides only per-object consumption; the composed runner supplies durable request/key guards. Do not use the standalone seam as a public broadcaster or create another instance to evade a prior attempt. There is no hosted signer or browser route.

## Verification and reproduction

- `npm.cmd run test:near` -> **64/64** local tests:40prior +8key-guard +8broadcast +8composed-runner cases. All signatures use generated ephemeral keys in memory. The new cross-process test yields exactly one claim for a shared public account/key on this local filesystem. Junction tests ran without skips; OS settings were not changed.
- Tests inspect exact request bytes/method/options, both synced identities before send, concurrency/restart, changed request/revision/nonce/code/endpoint, malformed/large/stalled responses, wrong key/signature/review, no retry, cancellation/expiry, journal I/O failure and late acknowledgement immutability. Valid acknowledgement plus a failed final marker remains unknown, preserving hash/entry.
- `npm.cmd run test:frontend` **186/186**, `npm.cmd test` **115/115**, typecheck and lint pass. An initial typecheck failed because TypeScript treated callback mutation of a local nullable variable as always-null; a typed result box fixed it without casting or changing runtime semantics. The initial62tests all passed; two additional composed-runner tests and the revision-change check were then added.
- Approved Linux command: `wsl --distribution Ubuntu-24.04 --user runlatch --exec sh /mnt/c/Users/David/RunLatch/scripts/setup/test-transaction-codec-linux.sh` -> **1/1 offline Rust integration**,24wire/hash/layout vectors plus Node ephemeral signature verification/corruption rejection; locked/offline all-target Clippy and formatting pass. No Sandbox node starts. Contract host-mock/Sandbox/WASM results from earlier checkpoints were not rerun or relabelled.
- No new browser/build/clean-checkout/public-testnet evidence. Source-import search finds no `src` reference to these Node modules; this is not a fresh production bundle scan. Package/lock/crate/contract/frontend and prior signer/journal remain unchanged.

## Remaining gates

Public restricted-key loading/process injection, finalized per-key sequential nonce coordination, an admitted public broadcaster/runner, exact human-approved testnet action scope and owner/provider wallet are still absent. The fixtures/receipts/report and full UI/human QA remain necessary. No real secret store or `.env` was opened; SDK7.4.0 remains uninstalled/unadmitted. Future UI requires a fresh heads-up; public actions require exact separate approval. Replay Lab remains unstarted pending completion of the first task and separate human go-ahead.
