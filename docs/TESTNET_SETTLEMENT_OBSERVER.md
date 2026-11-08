# Testnet settlement observer — local implementation, not live evidence

**8 November2026.** This is stage2 of the [Working testnet MVP plan](WORKING_TESTNET_MVP_PLAN.md), not the second requested Replay Lab task. No public contract, account setup, wallet signature or public transaction has been approved or run.

## Implemented boundary

`createTestnetReader(target).observePurchase(intent)` in `src/lib/near/testnet-rpc.ts` reads one **previously submitted** transaction. It never submits, signs, changes a policy, records settlement or automatically retries. Target configuration is the existing explicit testnet-only credential-free RPC allowlist, named contract/operator and expected code hash.

The strict intent contains transaction hash, sender, public key, `submit_purchase` or `approve_purchase`, exact gas and the bounded IDs/hash proposal. Submission expects zero deposit; exact owner approval expects one yocto and an expected request hash. This module supports Ed25519 observation keys and the default healthy25Tgas callback, not a public fault-contract deployment or an unrestricted method dispatcher.

1. Preflight verifies chain, final-block code/operator/schema/network and storage. Receipt status uses `tx_status` for reported nearcore2.14+ (including2.14 release candidates), otherwise the documented legacy `EXPERIMENTAL_tx_status` alias; it requests `FINAL` once.
2. A new final block is pinned **after** lookup. The selected capsule/project snapshot is re-read and checked with the canonical integer report reducer; provider and canonical quote hashes/consumption are checked. Outcome block headers must match their hashes and precede the pinned readback. Code hash is also checked at the initiating and callback execution blocks, not just the current block.
3. `testnet-evidence.ts` checks the exact transaction hash/signer/key/receiver/action/deposit/gas/decoded args; joins the originating receipt via the transaction outcome; rejects duplicate/cyclic/orphan/action/receiver/amount/request inconsistencies; and checks each receipt executor. Required receipts/outcomes must be present in the connected graph.
4. A purchase requires exactly one canonical native transfer and one private `resolve_purchase` callback, both originating from the contract. The callback must reference the exact purchase key and its single input-data dependency must match the transfer's output-data ID/contract receiver. System gas refunds are not provider spend.
5. A native success must have the empty native-transfer return and a successful callback whose decoded record matches the pinned request, zero reservation, exact future commitment and callback timestamp. Confirmed initial failure plus a successful callback must match `SETTLEMENT_FAILED`, zero immediate reservation and released contingent future commitment. The quote stays consumed.

The strict graph/dependency checks may fail closed on unsupported/incomplete RPC receipt formats. They are not claimed compatible with a real public run until tested there. There is no automatic receipt fallback, archival endpoint switch, resend, timeout release or unsafe recovery.

## Honest result axes

| Observed evidence | Result for this attempt |
| --- | --- |
| Exact finalized transfer + successful matching callback + final record | `SETTLED` or `SETTLEMENT_FAILED` according to the native outcome |
| Structured business denial/approval wait with no purchase transfer | `NOT_ATTEMPTED`; actual Gate decision/source retained |
| Replay rejection referencing an older settled request | `NOT_ATTEMPTED` for this replay; original final record remains separate |
| Failed initiating contract receipt, no purchase action | `TRANSACTION_EXECUTION_FAILURE`, no invented decision or surviving denial |
| Non-final/incomplete/unavailable/timeout/shard evidence | `SETTLEMENT_UNVERIFIED`, exact transaction identity retained |
| Failed/unknown callback or successful quarantining callback | `SETTLEMENT_UNVERIFIED`; immediate/future reservation must remain intact |
| Contradictory action/state/code/hash/binding | Stable validation error; no settlement or signing authority |

Wrong account/key attempts can be described as actual rolled-back execution failures; they cannot supply successful Gate results. No-payment evidence belongs to an attempt, not every later lifecycle of the referenced request. A pending approval may subsequently settle through a separate exact owner transaction.

All results retain `independently_verified:false` and `grants_payment_authority:false`. Explicit HTTP readback is **RPC-reported evidence**, not a trustless light-client/cryptographic proof, permanent code immutability, restricted access-key permission proof, provider provisioning or task acceptance. Injected fetch is always labelled `INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE`. The browser LOCAL file importer remains unchanged and rejects testnet relabelling.

## Bounds, reproduction and current evidence

Shared reader bounds remain40calls/1MiBresponse/4KiBargs/15srequest/60soperation with cancellation and sanitized errors. Observer bounds add32outcomes/32receipts/16distinct outcome blocks,8actions/dependencies per parsed receipt, one exact initiating action and bounded64KiB decoded contract return. Only fixed read methods are exposed internally; no signed transaction bytes or secrets are accepted. No new package, Rust method, UI, background service or automatic persistence was added.

Run `node --test tests/frontend/testnet-evidence.test.ts tests/frontend/testnet-rpc.test.ts` → **31synthetic tests**, no external RPC calls. Full `npm.cmd run test:frontend` → **116passes**, `npm.cmd test` → **115passes**; typecheck/lint pass. Cases cover native success/failure/quarantine, exact approval, no-payment/replay/rolled-back wrong-key failures, graph/action/dependency/code/timestamp substitution, incomplete/non-final/timeouts, large exact amounts, future commitments, gas refunds and repeat observations. Actual command results and initial test-fixture type errors are recorded in BUILD_LOG.md section46.

No new browser integration/build/clean-checkout/Sandbox/public-testnet execution is inferred from these parser tests. Root production preview remains on the earlier candidate; do not overwrite its active `.next` output to claim a new build. Next stages are human exact-action review, reviewed wallet/SDK admission, the restricted local agent and approved end-to-end testnet execution. The new Replay Lab remains unstarted until its separate go-ahead.
