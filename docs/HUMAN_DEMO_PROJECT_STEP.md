# Create the fictional project — human-terminal step

**8 November 2026. Prepared and locally tested; not executed.** The Gate deployment/init is completed and must never be repeated. This next command creates **one project only**, using the operator's existing human-controlled Windows Credential Manager key. No new dependency, account or key is installed.

## Exact scope

| Field | Bound value |
| --- | --- |
| Network / RPC | NEAR testnet / `https://rpc.testnet.near.org/` |
| Signer | `runlatch-demo-1108.testnet` |
| Public key | `ed25519:4WJHM7chT6geyrN23fRR3sSLJhRaXmRaEjcaZvpUrXuL` |
| Receiver | `gate.runlatch-demo-1108.testnet` |
| Pinned code hash | `F1pev22VSu86qxxWicXpCixtzzNoQxEi1FHRF2eGXjGP` |
| Single action | `FunctionCall(create_project)` |
| Project / organisation / client refs | `project_demo_1108` / `org_demo_1108` / `client_demo_1108` |
| Budget ceiling | `300000000000000000000000` yoctoNEAR = **0.30 NEAR unfunded delegation ceiling** |
| Attached deposit | `81920000000000000000000` yoctoNEAR = **0.08192 NEAR project storage only** |
| Gas | `50000000000000` = **50 Tgas**, separately charged to the operator |
| Expiry | Exactly 48 hours after the first finalized preflight block's chain timestamp; exact nanoseconds/UTC displayed before signing |
| Outcome definition | `website-resource-fixture-v1`, hash `57ad6f579cc08fc614950b7c15151054c564e4b30370077f14bb780cbd34c4b9` |

Fictional labels **Northstar Studio / ACME Demo Client / Automated Booking Website** stay off-chain. The criteria predeclare local manifest/project/resource binding, fixture health200/HTTPS flag and `/health` body `ok`. This is **not** a live database/website check or a passed outcome. Only opaque refs and the definition hash enter the project record.

The exact JSON is displayed by the command, including the fresh nonce/block and expiry. Expected argument shape:

```json
{"project":{"project_id":"project_demo_1108","organisation_id":"org_demo_1108","client_ref":"client_demo_1108","budget_ceiling":"300000000000000000000000","expires_at_ns":"<fresh chain-derived timestamp displayed by the command>","outcome_definition_hash":"57ad6f579cc08fc614950b7c15151054c564e4b30370077f14bb780cbd34c4b9"}}
```

The placeholder is explanatory, not a runnable transaction. The command constructs the actual integer timestamp. It checks existing Rust storage requirements and fails closed if the exact deposit has changed. A 0.03 NEAR operator-balance cushion plus the current-price gas estimate is checked, **not promised as the actual fee**. Storage funding, gas, project ceiling and later capsule funding are separate.

**Excluded:** provider registration, capsule creation/funding, quote publication, restricted-key installation, agent purchase, provisioning, task check, human acceptance, transfer action, deployment/init, owner returns, Git push, public-source visibility or website deployment. The contract's storage deposit is transferred with this payable call; “no transfer action” does not mean zero attached value.

## Copy into your own PowerShell terminal

```powershell
Set-Location 'C:\Users\David\RunLatch'
node scripts/setup/human-create-demo-project.ts
```

Review the displayed single-call package. At its prompt, type exactly:

```text
CREATE PROJECT project_demo_1108 ON gate.runlatch-demo-1108.testnet USING LOCAL NODE SIGNER
```

The exact review expires **60 seconds after its reviewed chain block**; read time is included, and the fresh recheck must finish inside that window. Complete the displayed review/prompt promptly. A changed key, nonce, balance, code, storage requirement, existing project or intervening capsule stops before signing. The command reads **only the exact operator credential**, locally and after the typed approval. The agent/browser never accesses it. No stock CLI, broader owner-wallet fallback or hosted signer is used.

On success, paste only the final public JSON beginning with:

```text
"status":"PROJECT_CREATION_OBSERVED"
```

That result must show the exact immutable input, operator owner, `ACTIVE`, revision`1`, allocated authority`0` and no capsule IDs, plus the real transaction/receipt references. It proves project creation only, not funded purchasing authority or completed work.

## Error, interruption or uncertain result

**Do not rerun the creation command, re-sign, resend, change project ID or delete/edit any attempt marker.** Run only:

```powershell
node scripts/setup/human-create-demo-project.ts --check
```

`.local/human-key-setup/project-attempt/` permanently retains synced public review/intent/hash before signing, an entered marker before one send, and a verified result only after exact FINAL receipt/return-value/historical-code/same-block state proof. Any existing attempt directory blocks default execution, including a pre-send failure. `--check` neither writes nor resumes; missing/unknown/mismatched execution remains unresolved. Completed child/deployment markers and all keys stay untouched.

The observer uses bounded first-party RPC queries, not a light client or security audit. Later state changes may prevent this deliberately exact initial-state proof; they do not justify repeating creation. After independent readback, later setup calls are prepared as their own exact terminal steps.

## Verification boundary

27 focused synthetic tests cover the fixed terms, unsigned existing setup-review path, money/time/key/state checks, advancing finalized-block metadata versus unchanged semantic account state, exact bytes and signature, native-default wiring, exclusive concurrent claims, changed/stale reviews, marker ordering, unknown retention, altered/failed/missing graphs and historical creation time. One fixed same-block RPC preflight feeds the unchanged shared `prepareSetupReview` validator and `confirmFreshSetupReview`; independent reads are bounded batches, not a duplicated full reader preflight. Four offline Rust parity tests cover this project plus unchanged deployment/child/agent encodings; the new project case compares four V0 wire/hash vectors and one generated in-memory signature. These tests do not sign with the human key or create a public project. Full commands/counts and unsigned public preflight are recorded in BUILD_LOG.md section71.
