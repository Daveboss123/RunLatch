# Single-attempt safeguards — offline foundation

**8 November 2026.** This advances the Working testnet MVP's restricted-runner groundwork. It is **not a signer, a broadcast adapter, a deployed workflow or Replay Lab**. SDK admission remains pending. No public execution command is enabled.

## Implemented boundary

`scripts/near/single-attempt.ts` exposes `exerciseSingleAttempt` to trusted local test code. It accepts only an in-memory-issued unsigned `submit_purchase` review with **injected-test transport**, zero deposit, restricted-access readback and checked financial projection. HTTP-labelled reviews and owner approval calls are rejected. A fresh issued review and exact-content confirmation use the existing review module; no new Gate or financial policy engine was added.

The exercise calls trusted, caller-injected **test** ports for fresh review, preparing a synthetic transaction identity and one invocation. It has no default signer/network transport, SDK import, process-key reader, wallet fallback, RPC dispatcher, CLI transaction entry point or provider-selected function/URL. Returned provider-like data is neither interpreted nor persisted.

Sequence:

1. Check eligible source/method and exact fresh review/confirmation/time.
2. Exclusively create a `CLAIMED` marker before preparation.
3. Validate the prepared observation intent's exact agent/key/method/gas/proposal binding. Persist `IDENTITY_CAPTURED` before invocation.
4. Persist `INVOCATION_ENTERED`, recheck time/cancellation, invoke the test port once.
5. Record `RETURNED_UNVERIFIED` or `RESULT_UNKNOWN`. Neither means settlement. A failure before invocation returns `STOPPED_BEFORE_INVOCATION` and retains the claim.

Fresh review, preparation and invocation have bounded deadlines (15 seconds each by default, configurable only within 1–15000 ms for tests), cancellation signals and no retry loop. The original/fresh review expiries are checked after asynchronous preparation/marker operations. A late result after deadline is ignored. Errors and provider-like returned content are not echoed. If final marker writing fails, the result explicitly says `NOT_FINALIZED_RETAIN_PRIOR_MARKERS` and preserves the captured identity and prior markers.

## Journal and scope

`scripts/near/attempt-journal.ts` creates four bounded, immutable UTF-8 marker files at most (16 KiB each) below ignored `.local/testnet-mvp/single-attempt/<namespace>/`. Each write uses exclusive `wx`, `writeFile`, `FileHandle.sync` and close. Each existing ancestor is inspected for a real directory, no symlink/junction and matching canonical path before creating its child. Imported data supplies no directory/file path. In-memory lease stages are consumed **before** asynchronous writes; forged leases and concurrent stage calls fail closed.

The attempt slot hashes **network + contract + capsule + request**, deliberately excluding quote, key, revision, operator/code hash and RPC endpoint. Changing those parameters cannot obtain another slot for the same request in the same namespace. The claim survives process restart, even if preparation fails or only the identity/entry marker exists. Corrupt/pre-existing files are never truncated or interpreted as permission to retry. There is no reset, resend, release, new-nonce or recovery operation.

Markers contain only bounded public target/action/observation identifiers and source labels, not signing bytes, private keys, prompts, full artifacts, raw provider errors or returned output. All carry `LOCAL_SINGLE_ATTEMPT_EXERCISE`, `public_execution:false` and `payment_evidence:NOT_OBSERVED`. These files are not genuine transaction evidence and cannot enter the existing LOCAL Sandbox importer as such.

### Explicit limits

- The prepared hash is a **synthetic port-supplied identifier** whose fields are checked, not a cryptographically verified transaction. Actual SDK encoding/signature verification/hash capture and an exact single HTTP broadcast still need implementation after dependency admission.
- A future production caller must use one fixed, protected journal namespace and separately approved public account/action scope. This exercise's namespace argument is for local tests, not a mechanism for obtaining new production attempts. Public execution is currently rejected, not inferred from a boolean confirmation.
- These are application-level local filesystem safeguards, not tamper-proof storage. A same-user adversary can remove markers or race ancestor replacement. Network filesystems, OS crashes/power loss, directory-entry durability and Windows ACL hardening have not been certified; file `sync` is not a universal power-loss guarantee. No computer security setting was changed.
- Preparation/invocation ports are trusted local **test code**, not an interface for executing provider-supplied code. Cancellation cannot undo an already entered operation. A missing final marker or unresolved result must never invite resubmission.
- No on-chain reservation, quote capacity, commitment, payment result or provisioning fact is changed by this module. Actual settlement still needs the existing transaction/transfer/private-callback observer after separately approved execution. No fixture is delivered here.

## Reproduce and verified cases

`npm.cmd run test:near` → **20 offline tests**, no skipped cases on the checked Windows environment. Tests use synthetic RPC shapes and identifiers, not secrets or signatures. They cover marker-before-invocation ordering, one invocation, duplicate/restart/concurrent claims, two actual competing Node processes, changed-context slot binding, fresh-review/confirmation rejection, HTTP/owner exclusion, substituted prepared identity/extra secret fields, sanitized failures, deadlines/late data, cancellation, expiry, journal I/O faults, forged/concurrent lease stages, corrupt markers and traversal/non-directory/junction rejection.

The first 16-case targeted run passed. The first concurrent 20-case QA run had **18 pass / 2 fail**: a test-only 10 ms invocation/preparation deadline also expired the synthetic RPC pre-read under load. The two phase-specific tests now use an immediate issued synthetic fresh-review port so the forced deadline targets the intended invocation/preparation phase; separate bounded fresh-read timeout coverage remains. No product deadline or security assertion was relaxed. Corrected 20-case run, typecheck and lint pass. Existing **136 frontend / 115 backend Node tests** also pass. No production build, browser, clean-checkout, Rust, SDK or Sandbox run was made for this change.

Only npm test/lint commands and TypeScript coverage were added to the manifest/configuration; dependencies and the root lockfile are unchanged. The existing loopback preview and `.next` output were not replaced. The first task is still incomplete; Replay Lab remains deferred pending separate go-ahead.
