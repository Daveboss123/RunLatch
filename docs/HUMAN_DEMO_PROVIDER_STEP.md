# Register the database provider — human-terminal step

**Locally prepared and fresh unsigned readback verified, not executed.** The parent/children, Gate deployment/init and project creation are already completed. Do not repeat them or remove their permanent markers. This new helper registers one immutable controlled provider; it is not a purchase or a complete Working testnet MVP.

**Completed 9 November 2026 — never run the signing command again.** The human approved the exact one-call review. FINAL transaction `5DnrDArTCEN8rGaDCAqacX2CmxvCymYozNam7iys4DLu` registered active provider `db_demo_1108` with immutable publisher/recipient `db.runlatch-demo-1108.testnet` and quote count 0. Independent `--check` at block height 276944483 confirmed the current provider/project/key state and retained FINAL proof. This registration paid storage and gas only: purchase funding 0, no quote, capsule, restricted key, purchase or outcome.

## Exact scope

| Field | Bound value |
| --- | --- |
| Network / RPC | NEAR testnet / **explicit `https://test.rpc.fastnear.com/`** |
| Signer | `runlatch-demo-1108.testnet` |
| Public key | `ed25519:4WJHM7chT6geyrN23fRR3sSLJhRaXmRaEjcaZvpUrXuL` |
| Receiver | `gate.runlatch-demo-1108.testnet` |
| Pinned code hash | `F1pev22VSu86qxxWicXpCixtzzNoQxEi1FHRF2eGXjGP` |
| Single action | `FunctionCall(register_provider)` |
| Provider ID | `db_demo_1108` |
| Immutable publisher and recipient | `db.runlatch-demo-1108.testnet` |
| DB public key (read-only check, not signer) | `ed25519:3WYYFFAVric9chaHHF5ed8gFSqBE2DppAtGPrxvx7YXN` |
| Attached deposit | `40960000000000000000000` yoctoNEAR = **0.04096 NEAR provider storage at the checked price** |
| Gas | `50000000000000` = **50 Tgas**, charged separately |

The actual Rust method validates operator identity, unique bounded provider ID, global provider quota, nonprivileged publisher, noncontract recipient, agent/provider role separation and the exact **4096-byte** storage contribution. It stores publisher/recipient immutably, `active:true`, `quote_count:0`. It cannot publish a quote, provision a database or authorize a purchase.

Exact arguments:

```json
{"provider_id":"db_demo_1108","publisher_id":"db.runlatch-demo-1108.testnet","recipient_id":"db.runlatch-demo-1108.testnet"}
```

The existing project is a separately checked prerequisite, **not** a `register_provider` argument: `project_demo_1108`, owner operator, ACTIVE revision1, allocation0, no capsules, ceiling0.30 NEAR, expiry`1794335720864706128`, original criteria and creation timestamps. Registration does not change it. The wrapper stops if that exact authority is stale/expired/changed. Global provider count has no enumerable contract view; Rust checks the quota at execution, not a fabricated preflight count.

## RPC selection and fresh readback

The original NEAR-hosted RPC state checks succeeded, but complete initial-plus-fresh unsigned preparations hit HTTP429. Those failures remain in BUILD_LOG.md; no checks were removed and no timeout or retry rule was relaxed.

The new, unexecuted provider helper now explicitly uses **FastNEAR's free public testnet RPC**, already admitted by the existing RunLatch target allowlist and listed in [NEAR's current official RPC reference](https://docs.near.org/api/rpc/providers). The exact review binds and displays this endpoint. It is **not** an automatic fallback, RPC rotation, paid API, credential-bearing URL, mainnet switch, changed contract or changed signing account. Old project/deployment/account helpers and any consumed transaction identity remain unchanged.

Fresh unsigned initial+recheck on the fixed endpoint passed:3072ms initial,1677ms fresh,4749ms total, unchanged project/DB/key/account/fees and the existing shared exact-content confirmation with signing still disabled. This is one observed public-read sample, not a promised latency, permanent rate-limit repair or a signature/registration. Any later RPC failure still stops without retry/fallback. The endpoint's free limit is not numerically published; future historical lookup can be unavailable/pruned and must remain unresolved rather than silently use another node.

For a public state check only, in your own PowerShell:

```powershell
Set-Location 'C:\Users\David\RunLatch'
node scripts/setup/human-register-demo-provider.ts --check
```

`--check` is always read-only. An HTTP429, timeout or unavailable record is not absence, failure proof or signing consent. Do not hammer the RPC, switch signing accounts/endpoints, or relax freshness to make it proceed.

## Diagnose the stopped command — read-only

```powershell
Set-Location 'C:\Users\David\RunLatch'
node scripts/setup/human-register-demo-provider.ts --preflight
```

Paste only its public `PROVIDER_UNSIGNED_PREFLIGHT_OK` JSON or the sanitized `PROVIDER_STOPPED ... phase=...` line. It does not prompt for approval, read a credential, sign, broadcast or create an attempt marker. It refuses if an existing attempt directory is present; only `--check` is supported for that case. Native connection errors now show only known error codes; unknown causes/messages/URLs/stacks/bodies stay redacted. No retries or RPC fallback were added.

The human diagnostic now passes as well, at block `4X9AmYhiZmEbXHBmxvttWwsm1AxmiskMx5cNAHeiwT1f`, height276910545, with nonce276803830000004. A subsequent agent initial/fresh recheck passes4716ms total with the same semantic state. Neither grants signing consent or permanently explains the first error; the default command still creates a new fresh review and requires the exact human typed approval.

## Signing is complete — read-only checks only

Do **not** run the default signing command again, re-sign, resend, change provider ID or edit/remove the retained attempt. The only permitted provider-helper command now is:

```powershell
node scripts/setup/human-register-demo-provider.ts --check
```

The human-only signer read only the exact operator credential after typed approval. The agent never accessed that credential. The DB and Gate credentials were not read by the signer. No quote, capsule funding, restricted key, purchase, provisioning, check, acceptance, owner return or mainnet action was bundled.

The unchanged shared setup review expires60 seconds after its chain block. A conservative wall deadline also includes **all initial reads**, prompt time and fresh reads; it is not renewed after slow RPC. Key, nonce, balance, code, project, provider absence, DB account/key and fees must stay exact. A0.03 NEAR balance cushion and current-price gas estimate are checked, not promised as actual fees. Storage credit goes to the Gate; it is not supplier payment or capsule purchase funding.

The retained public result has `"status":"PROVIDER_REGISTRATION_OBSERVED"`, transaction hash `5DnrDArTCEN8rGaDCAqacX2CmxvCymYozNam7iys4DLu`, receipts `SUtV8MPcogh741sdo4eQ4keTygJDrAJAgpNDy6fjNjG` and `2TG2SDLhVCwerSMmYvg7k15xDdp7LrGs8L28K2VwA3hH`, nonce `276803830000005`, active provider with quote count 0 and unchanged unfunded project. No private key or signed bytes were placed in chat or source.

## Error, interruption or uncertain result

**Never rerun the signing command, re-sign, resend, change provider ID or delete/edit/rename any attempt marker.** Use only:

```powershell
node scripts/setup/human-register-demo-provider.ts --check
```

`.local/human-key-setup/provider-attempt/` exclusively retains synced public review and intent/hash before signing, entered marker before one send, and verified result only after FINAL exact call/return/complete successful receipt graph/historical code/current same-block provider/project/key/nonce/DB proof. Any existing attempt blocks default execution, including a pre-send recheck or signer failure. `--check` never writes, resumes or releases it. A later project/key change may prevent the deliberately exact initial-state proof; that does not authorize repeating registration.

## Local verification boundary

31 focused generated-key/synthetic-RPC tests cover fixed terms, actual setup-review reuse, nonTTY/store refusal, safe imports, project/DB/key/storage/fee/funding/expiry changes, advancing final blocks, conservative initial-read deadline, HTTP429/no retry, exclusive concurrent claims, intent-before-sign/entry-before-send, exact signature/wire, uncertain/failed/malformed graphs and post-send DB changes. Five offline Rust codec tests cover four new provider V0 wire/hash vectors and one ephemeral signature plus unchanged project/deployment/child/restricted-agent parity. No real human key, Sandbox startup, public signature or registration is part of those tests.

The new provider RPC reads the same fixed Gate/project checks in one same-final-block preflight, batching up to six independent queries. There is no duplicated whole preflight or broader view dispatcher. Requests/streams are bounded; errors are sanitized; `FINAL` requires the full successful operator→Gate→operator-refund outcome graph. Public RPC proof is not a light client, security audit, provider delivery guarantee or completed purchase. Exact commands, counts and observed public failures are in BUILD_LOG.md.

After the explicit RPC selection,31 provider cases remain included in241near/196frontend/115backend passing Node tests, with type/root+setup lint and5offline Rust parity/Clippy/format passing. A parallel QA run hit one existing restricted-runner timing failure before invocation; the unchanged16-case file and isolated full rerun pass. The failure is retained, not a permanent timing fix or a removed adverse test. No agent real-key/store/sign/send was used.

The diagnostic extension adds three cases for unsigned preflight/no-signing/no-send/serialization, whitelisted native transport errors and redacted stream failures. Final34 provider cases are included in244near/196frontend/115backend/type/lint passing tests;5offline Rust codec/Clippy/format pass. No source authority, retry policy, old helper, dependency, contract or deployed artifact changed.
