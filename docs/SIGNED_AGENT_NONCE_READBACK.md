# Captured agent transaction nonce readback

**8 November 2026 — read-only HTTP-capable reconciliation, not a public runner or testnet execution proof.**

`scripts/near/read-signed-agent-nonce.ts` binds an explicitly supplied captured transaction identity to `createTestnetReader(...).reconcileAgentNonce(...)`. No dependency, signer, CLI, secret loader, journal writer, nonce allocator or broadcast method is added.

## Narrow path

1. Reuse the independently Rust-checked V0 codec to parse the captured identity and recompute its transaction hash. Require testnet, the selected agent/key/contract, one `submit_purchase` call and zero deposit. Parsing this identity is not proof that a signature was produced or approved.
2. Reuse the **same observer implementation** as the connected fixture workflow. It performs one `tx_status`/legacy `EXPERIMENTAL_tx_status` lookup with `wait_until: FINAL`, current/final contract-role/schema/network checks, historical initiating/callback code-hash checks, exact transaction/receipt/action/canonical-transfer/private-callback checks, and canonical final-state consistency. Do not substitute a ledger SETTLED label, nonce bump or transaction hash for these checks.
3. Require terminal evidence: SETTLED, SETTLEMENT_FAILED, or an evidenced denied/rolled-back no-payment attempt. Approval-pending, missing receipts, unproven/failed callback, retained pending reservation or reconciliation-required state blocks reconciliation. A replay denial cannot override an unresolved original purchase. This terminal predicate is shared with the existing LOCAL reconciliation, not a second Gate.
4. Compare the exact transaction nonce. Then read the selected ordinary function-call key and bounded key list at the **same post-lookup final block** as the purchase snapshot. Require the same exact nonce, receiver, sole allowed method, finite positive bounded allowance, matching key/list envelopes and retained designated human recovery key. Higher/lower nonce, mixed blocks, pagination, broadened permissions and gas-key lanes fail closed.
5. Return only selected identity/nonce/block/access/payment-reference facts. No financial report, raw RPC errors, artifacts, acceptance, signature bytes or secrets are exported. `signing_enabled`, `grants_payment_authority` and `independently_verified` remain false. Fresh in-memory issuance prevents serialized/cloned observations from replacing a reader operation; it is not a cryptographic proof or human consent.

The Node wrapper requires an explicit reader/identity/scope and calls no default transport itself. The existing reader uses its credential-free allowlisted HTTPS endpoints when deliberately constructed without an injected transport. Injected tests retain `INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE`; HTTP operations are labelled `EXPLICIT_TESTNET_HTTP_READBACK`, still RPC consistency, not light-client verification. One bounded read operation retains the existing 40-request/60-second overall/15-second per-request/1MiB response limits. No method fallback/retry loop is added. Cancellation/deadline is checked after response consumption too, so even an injected transport ignoring the signal cannot issue a completed readback after cancellation.

## Money and consent boundaries

- Readback performs no network write or local claim change. It releases no reservation/future commitment and never resets, re-signs or resends an attempt.
- The existing LOCAL sequential coordinator continues to accept **only** its separately issued LOCAL evidence; these new readbacks do not unlock it or admit a public signer. Files remain audit history, not authorization.
- Before a later public runner may use this readback, its own exact review/consent/claim/sign/capture/single-send checks must be admitted and tested. All actual accounts/deployment/key installation/actions/gas/deposits/funding/run scope still require human approval.
- Ordinary RPC transaction/key nonces are numeric JSON. Unsafe, fractional, missing, negative or string observations are refused rather than rounded/repaired. Expected nonces above `Number.MAX_SAFE_INTEGER` are rejected before calls; the codec's exact decimal u64 support does not remove this readback limitation. Money remains integer decimal-string yoctoNEAR.
- Fixture provisioning, objective checks and explicit human acceptance remain separate downstream facts. This readback does not call a provider or complete the Working testnet MVP. Replay Lab remains deferred.

## Verification and sources

```powershell
node --test tests/near/read-signed-agent-nonce.test.ts
npm.cmd run test:near
```

12 synthetic cases cover terminal payment/no-payment/rollback, legacy API, pending/unknown/missing callback stops, exact/safe nonces, bounded permissions/recovery/pinned queries, historical code/actions, identity/config/getter refusal, token provenance, cancellation and unchanged LOCAL gating. New readback + existing local reconciliation + connected workflow: **32/32**. Full **120/120 near**, **186/186 frontend**, **115/115 backend**, typecheck/lint exit0. No public RPC execution, actual signing, browser/a11y/build or new Rust/Sandbox run is claimed. Existing observer/codec/parity evidence is reused; these fixtures do not prove deployment/network execution.

Current Context7 `/near/docs` queries checked transaction status/finality/receipts and pinned access-key/key-list request/response semantics before implementation. Official sources: [transaction RPC](https://docs.near.org/api/rpc/transactions), [contract/access-key RPC](https://docs.near.org/api/rpc/contracts), [finality](https://docs.near.org/integrations/blocks-and-finality). `tx_status` is available from nearcore2.14.0, with the legacy alias on older nodes; a missing receipt list never becomes settlement evidence. The existing allowlist, RPC limits and cryptographic implementation are unchanged. Root SDK dependency admission is still blocked; no package/lock/license change.

**Section57 follow-up:** the [bounded restricted testnet runner](RESTRICTED_TESTNET_RUNNER.md) now consumes these issued readbacks only with a separately issued exact run confirmation. The LOCAL coordinator still refuses them. This is locally implemented/synthetic-tested, not human approval or executed public evidence; the section56 read-only API still signs/sends nothing.
