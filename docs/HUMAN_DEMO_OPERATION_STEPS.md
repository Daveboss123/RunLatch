# Demo setup — exact human-terminal steps

**10 November2026.** These are separate human signatures, not agent signing permission. The original `project_demo_1108` expired at **2026-11-10T18:35:20.864Z** with allocation0/no Capsules and remains untouched. It cannot be extended in place. A new **unsigned** work order is prepared, not created or renewed.

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
