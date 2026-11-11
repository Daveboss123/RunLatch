# Demo setup — exact human-terminal steps

> **Next purchase, not setup:** the human has approved only the exact one-call0.05native database purchase; the restricted-only terminal helper is prepared separately. [Complete scope, command, gas/funding separation and readback-only rules](DEMO_DB_PURCHASE_SCOPE.md). All four setup commands below remain permanently consumed. Do not paste or export keys; provisioning/check/acceptance are later steps.

> **All four setup actions now completed11November:** native AddKey `H4cqJTWvx2GvSAaFMPt4JUjPk2EvrjsbpoYUuLfWufMK` is independently FINAL with initialized nonce277138475000000, exact Gate/submit-only/finite0.05gas permission and retained recovery FullAccess key. Project/Capsule/quote/key default commands must never repeat; --check only. No purchase has happened. The next step is a **distinct, exact human-reviewed one-call restricted-agent purchase**, not another setup approval or a recovery-key payment. All setup command examples below are historical/readback-only.

> **Current11November key-install handoff:** the ordinary-key nonce readback correction passed actual isolated Sandbox and all46helper/620Node checks plus independent Rust wire tests. Project/Capsule/quote are FINAL and must never repeat. Quote remains unused. Native public AddKey initial/fresh review passes with one recovery FullAccess key and restricted key absent; no key-install attempt exists.

### Next: install only the restricted agent key

```powershell
node scripts/setup/human-demo-operation.ts agent-key
```

Review the agent account, retained human recovery key, added public key, Gate receiver, `submit_purchase`-only method and finite **0.05 NEAR gas cap**. This cap pays gas, not a separate purchase budget or transfer. No FunctionCall/transfer/deposit is bundled. If you approve only this native AddKey, type:

```text
INSTALL AGENT KEY ed25519:ABWnTWVgg59wN1p7pYfjcUUf53FFYubzELSBPq57Z2hY ON agent.runlatch-demo-1108.testnet USING LOCAL RECOVERY KEY
```

Return public `DEMO_AGENT_KEY_INSTALL_OBSERVED` JSON. The helper proves the actual seeded key nonce and exact permission before any agent signature. Human recovery remains FullAccess; the agent key cannot change policy, approve, attest outcomes or transfer freely. Any error/unknown/interruption is `--check agent-key` only; never re-sign/resend/delete markers/change the nonce or fall back to the recovery key for a purchase.

> **Latest11November checkpoint:** Project1110, Capsule1110 and quote1110 are independently FINAL and consumed creation/publication commands. Quote `2TYs5yEFkjFRWiAMTuMqETQ2FosvoaLZnKhjRZEWF1Pn` is published but unconsumed; no purchase. Do not repeat any of those commands. The last setup action is restricted AddKey; signing is temporarily held while its protocol-nonce readback is tested in isolated Sandbox. Action input nonce0 is not the final ordinary-key nonce: nearcore seeds `(execution_height - 1) * 1000000`. Never manually reset or change it. Key receiver/method/finite0.05NEAR gas cap and retained human recovery access remain unchanged.

> **Latest11November gate:** Project1110 and Capsule1110 are independently observed FINAL and must never be created again. Capsule transaction `AeNBkfXrftqN85JEFgJAwXdnHnbr4Nb8A65ysi4drKKj` funded0.30 NEAR with zero spent/reserved/future commitments and2.62144 storage. The next separate human command is **quote** below. Earlier Project/Capsule creation examples are now historical/readback-only.

### Next: publish the canonical quote

```powershell
node scripts/setup/human-demo-operation.ts quote
```

This uses only the registered provider account `db.runlatch-demo-1108.testnet` to publish one-use `db_quote_demo_1110`. Review the fixed database-plan/booking-database/quantity1/native0.05 NEAR all-inclusive one-time price, pinned recipient,12Nov15:00UTC expiry and50Tgas. Attached **0.08192 testnet NEAR is provider-paid quote storage**, not the0.05 purchase price or Capsule funding. If approved, type:

```text
PUBLISH QUOTE db_quote_demo_1110 ON gate.runlatch-demo-1108.testnet USING LOCAL NODE SIGNER
```

Return public `DEMO_QUOTE_PUBLICATION_OBSERVED` JSON. Publication is not purchase approval, settlement or provisioning. On any error/interruption/unknown, `--check quote` only; no repeated command, new ID, key/RPC fallback or marker removal.

**10 November2026.** These are separate human signatures, not agent signing permission. The original `project_demo_1108` expired at **2026-11-10T18:35:20.864Z** with allocation0/no Capsules and remains untouched. It cannot be extended in place. A new **unsigned** work order is prepared, not created or renewed.

> **11 November update:** the human created `project_demo_1110`; independent `--check project` verified FINAL transaction `FMKZhn3JU6k7KxEE9BLezanQoZmHufCHrrqHwSZudBza`, exact owner/terms/revision1 and allocation0/no Capsules. **Project creation is completed and must never repeat.** Its ceiling is still unfunded. The next separate human action is `capsule`, total2.92144 testnet NEAR:0.30 purchase funding +2.62144 prepaid history storage. New Capsule/quote/key/purchase remain absent. Project examples below are historical/readback-only; use the Capsule instructions here next.

### Next: fund the Capsule

```powershell
node scripts/setup/human-demo-operation.ts capsule
```

Review exact `capsule_demo_1110` under Project1110 revision1, same operator/Gate/agent key, database-only scope,50Tgas and12Nov16:00UTC expiry. If you approve its displayed **2.92144 NEAR** attached deposit and policy, type:

```text
CREATE CAPSULE capsule_demo_1110 ON gate.runlatch-demo-1108.testnet USING LOCAL NODE SIGNER
```

Return only public `DEMO_CAPSULE_CREATION_OBSERVED` JSON. This funds bounded authority; it does not buy the database or install a key. Any error/interruption/unknown result means `--check capsule` only, never repeat default or delete its attempt directory.

## Fixed planned scope

NEAR **testnet** only; Gate `gate.runlatch-demo-1108.testnet`, code hash `F1pev22VSu86qxxWicXpCixtzzNoQxEi1FHRF2eGXjGP`, credential-free FastNEAR RPC. No deployment, provider registration, faucet, account creation, key deletion, mainnet, public repository or third-party payment is bundled.

| Order | Human signer | One action | Attached deposit / meaning |
| --- | --- | --- | --- |
| 1 | `runlatch-demo-1108.testnet` | `create_project`: `project_demo_1110` | `81920000000000000000000` yocto =0.08192 NEAR storage;0.30 NEAR ceiling is **unfunded** |
| 2 | Same operator | `create_capsule`: `capsule_demo_1110`, new project revision1 | `2921440000000000000000000` yocto =0.30 purchase funding +2.62144 prepaid history storage |
| 3 | `db.runlatch-demo-1108.testnet` | `publish_quote`: `db_quote_demo_1110`, one-time `database-plan`, `booking-database` | `81920000000000000000000` yocto =0.08192 quote storage;0.05 purchase price is **not paid by publication** |
| 4 | `agent.runlatch-demo-1108.testnet` recovery key | Native `AddKey` on its own account | No transfer/deposit; restricted key `ed25519:ABWnTWVgg59wN1p7pYfjcUUf53FFYubzELSBPq57Z2hY`, one Gate/`submit_purchase`, finite0.05 NEAR **gas** cap; recovery stays FullAccess |

Each FunctionCall uses50 Tgas. Native AddKey has no FunctionCall prepaid gas. Fees/storage collateral are separate from spending. Fixed expiries: quote **12Nov15:00 UTC**, Capsule **12Nov16:00 UTC**, Project **12Nov18:00 UTC**; no automatic refresh.

New Project/Capsule bind the actual `website-resource-fixture-v1` criteria hash `57ad6f579cc08fc614950b7c15151054c564e4b30370077f14bb780cbd34c4b9`. It checks labelled manifest/health/route fixtures, not a live website/database. The earlier unexecuted Capsule template's different hash is not new authority.

## Read first; sign only after reviewing the displayed transaction

In your own terminal at the project root:

```powershell
node scripts/setup/human-demo-operation.ts --preflight project
```

`DEMO_UNSIGNED_PREFLIGHT_OK` is public state/fee/serialization evidence only, not a signature, attempt, new project or reusable approval.

**Only if you approve that new work order**, run:

```powershell
node scripts/setup/human-demo-operation.ts project
```

Inspect the exact signer, receiver, terms, hash, storage/funding and deadline. To approve only this one transaction, type:

```text
CREATE PROJECT project_demo_1110 ON gate.runlatch-demo-1108.testnet USING LOCAL NODE SIGNER
```

Return only public `DEMO_PROJECT_CREATION_OBSERVED` JSON or a sanitized stopped reason. Never paste private keys, credential values, environment/profile dumps or raw exceptions. After FINAL proof, `capsule`, `quote` and `agent-key` are separate commands with separate displayed approval sentences. Do not run a batch or sign before each preceding step is verified.

## Any uncertain attempt becomes readback-only

The helper creates a permanent exclusive `.local/human-key-setup/demo-<kind>-attempt/` before recheck/signing, syncs intent/hash before signature, and entry before its sole send. Any existing directory blocks default execution—even after a pre-send failure. Never delete/edit markers, reuse IDs, re-sign/resend, switch key/RPC or repeat a default command after an uncertain outcome.

```powershell
node scripts/setup/human-demo-operation.ts --check project
```

`--check` cannot sign, send, resume or repair; unavailable FINAL identity/state stays unresolved. Setup success is not a purchase. Restricted agent execution, transfer/callback observation, labelled provisioning/check, explicit acceptance and Outcome Receipt remain later steps.

## Browser wallets are a different custody path

Meteor extension v2 connects a **wallet-held** testnet account. RunLatch does not import WinCred keys into Meteor. No key is requested/generated at connection or persisted, and no broader credential fallback exists. Each call still needs fresh exact review and an external wallet prompt. Synthetic browser tests are not proof of a real extension approval; returned hashes remain unverified until FINAL readback.
