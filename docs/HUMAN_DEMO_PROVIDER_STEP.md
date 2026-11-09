# Register the database provider — human-terminal step

**Locally prepared, not executed.** The parent/children, Gate deployment/init and project creation are already completed. Do not repeat them or remove their permanent markers. This new helper registers one immutable controlled provider; it is not a purchase or a complete Working testnet MVP.

## Exact scope

| Field | Bound value |
| --- | --- |
| Network / RPC | NEAR testnet / `https://rpc.testnet.near.org/` |
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

## Current read-only limitation

The first public `--check` succeeded and observed the expected keys/code/project, provider absent and the DB account still holding0.30 NEAR. Subsequent initial-plus-fresh unsigned preparations hit RPC HTTP429. **Fresh public signing-handoff readiness is not yet verified. Do not run the signing command until that read-only blocker is resolved and recorded.** No signer, credential reader, broadcast or real provider-attempt directory was invoked by the agent.

For a public state check only, in your own PowerShell:

```powershell
Set-Location 'C:\Users\David\RunLatch'
node scripts/setup/human-register-demo-provider.ts --check
```

`--check` is always read-only. An HTTP429, timeout or unavailable record is not absence, failure proof or signing consent. Do not hammer the RPC, switch signing accounts/endpoints, or relax freshness to make it proceed.

## Exact signing command, once readiness is verified

```powershell
Set-Location 'C:\Users\David\RunLatch'
node scripts/setup/human-register-demo-provider.ts
```

At the displayed exact review, type:

```text
REGISTER PROVIDER db_demo_1108 ON gate.runlatch-demo-1108.testnet USING LOCAL NODE SIGNER
```

This is **human own-terminal signing only**. It uses the already installed pinned native helper to read only the operator's exact credential, after typed approval, synced review/intent and fresh public recheck. The DB and Gate credentials are never read by this signer. No broader wallet/CLI/owner fallback is available to the agent. No new dependency, account, key, deployment, capsule funding, quote, purchase, provisioning, task check, human acceptance, owner return, Git push or website deployment is bundled.

The unchanged shared setup review expires60 seconds after its chain block. A conservative wall deadline also includes **all initial reads**, prompt time and fresh reads; it is not renewed after slow RPC. Key, nonce, balance, code, project, provider absence, DB account/key and fees must stay exact. A0.03 NEAR balance cushion and current-price gas estimate are checked, not promised as actual fees. Storage credit goes to the Gate; it is not supplier payment or capsule purchase funding.

On success paste only the public JSON with `"status":"PROVIDER_REGISTRATION_OBSERVED"`. It must include the actual transaction/receipt IDs, exact active provider with quote_count0, unchanged unfunded project, code, nonce and separate gas/token burn. No private key or signed bytes belong in chat.

## Error, interruption or uncertain result

**Never rerun the signing command, re-sign, resend, change provider ID or delete/edit/rename any attempt marker.** Use only:

```powershell
node scripts/setup/human-register-demo-provider.ts --check
```

`.local/human-key-setup/provider-attempt/` exclusively retains synced public review and intent/hash before signing, entered marker before one send, and verified result only after FINAL exact call/return/complete successful receipt graph/historical code/current same-block provider/project/key/nonce/DB proof. Any existing attempt blocks default execution, including a pre-send recheck or signer failure. `--check` never writes, resumes or releases it. A later project/key change may prevent the deliberately exact initial-state proof; that does not authorize repeating registration.

## Local verification boundary

31 focused generated-key/synthetic-RPC tests cover fixed terms, actual setup-review reuse, nonTTY/store refusal, safe imports, project/DB/key/storage/fee/funding/expiry changes, advancing final blocks, conservative initial-read deadline, HTTP429/no retry, exclusive concurrent claims, intent-before-sign/entry-before-send, exact signature/wire, uncertain/failed/malformed graphs and post-send DB changes. Five offline Rust codec tests cover four new provider V0 wire/hash vectors and one ephemeral signature plus unchanged project/deployment/child/restricted-agent parity. No real human key, Sandbox startup, public signature or registration is part of those tests.

The new provider RPC reads the same fixed Gate/project checks in one same-final-block preflight, batching up to six independent queries. There is no duplicated whole preflight or broader view dispatcher. Requests/streams are bounded; errors are sanitized; `FINAL` requires the full successful operator→Gate→operator-refund outcome graph. Public RPC proof is not a light client, security audit, provider delivery guarantee or completed purchase. Exact commands, counts and observed public failures are in BUILD_LOG.md.
