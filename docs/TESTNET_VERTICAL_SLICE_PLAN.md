# Testnet vertical slice — exact remaining plan and approval gate

> **All setup verified11November:** Project/Capsule/quote and restricted ordinary agent key are independently FINAL; key install `H4cqJTWvx2GvSAaFMPt4JUjPk2EvrjsbpoYUuLfWufMK`, seeded nonce277138475000000, Gate/submit_purchase only, finite0.05NEAR gas cap, human recovery retained. These four default signing commands are permanently readback-only. No purchase/settlement/fixture/check/acceptance/receipt exists yet. One exact0.05NEAR database purchase needs separate reviewed scope and restricted-only signing; no broader-key fallback.

> **Latest11November quote:** `db_quote_demo_1110` is independently FINAL, canonical hash `ae846302dbae490ba2352bbce89162821b8882a9c237903f97692ad9007231a3`, unconsumed,0.05 native NEAR all-inclusive one-time; publication `2TYs5yEFkjFRWiAMTuMqETQ2FosvoaLZnKhjRZEWF1Pn`. Quote creation is now readback-only. Restricted key installation follows only after the pending ordinary-key nonce-initialization check passes; no purchase/settlement/provisioning/acceptance exists.

> **Latest11November:** Capsule1110 is human-funded and independently FINAL (`AeNBkfXrftqN85JEFgJAwXdnHnbr4Nb8A65ysi4drKKj`), allocated0.30 NEAR/spent0/reserved0/future0, separate2.62144storage, Project1110 revision1/allocation0.30. Project and Capsule creation are consumed/readback-only. Next is only provider quote1110 publication, then restricted AddKey and separately reviewed agent purchase/evidence. No purchase or quote exists yet. [Exact provider signing scope](HUMAN_DEMO_OPERATION_STEPS.md).

> **11 November current state:** new Project `project_demo_1110` was human-created and independently observed FINAL (`FMKZhn3JU6k7KxEE9BLezanQoZmHufCHrrqHwSZudBza`), ACTIVE revision1/allocation0/no Capsules. Do not repeat Project creation. Next is only the separately reviewed funded Capsule1110, then quote1110/AddKey/agent purchase/evidence. [Current human Capsule scope](HUMAN_DEMO_OPERATION_STEPS.md). Earlier unsigned-plan text below is historical; no purchase has occurred.

> **10 November superseding checkpoint:** `project_demo_1108` is still stored ACTIVE but its immutable expiry has passed; allocation0/no Capsules/no purchase. Do not revive it or repeat its creation. A new unsigned `project_demo_1110` work order, `capsule_demo_1110` and `db_quote_demo_1110` are prepared, not created. Remaining order is **new Project → Capsule → quote → restricted AddKey → one reviewed agent purchase → callback/evidence/check/acceptance/receipt**. [Exact human commands, deposits, expiries and stop rules](HUMAN_DEMO_OPERATION_STEPS.md). Older rows below are historical, not current signing instructions.

**Status: 9 November 2026. Public testnet is partially set up: Gate, project and immutable database-provider registration are observed; no capsule, quote, restricted key, purchase, callback, provisioning, task check, human acceptance or report exists on testnet.** This page consolidates the exact remaining sequence. It is a plan and a list of approval gates, not execution consent and not evidence of a completed purchase.

Read with [DEMO_ACCOUNT_PACKAGE.md](DEMO_ACCOUNT_PACKAGE.md), [HUMAN_DEMO_PROVIDER_STEP.md](HUMAN_DEMO_PROVIDER_STEP.md), [WORKING_TESTNET_MVP_PLAN.md](WORKING_TESTNET_MVP_PLAN.md), [RESTRICTED_TESTNET_RUNNER.md](RESTRICTED_TESTNET_RUNNER.md) and [CONNECTED_FIXTURE_WORKFLOW.md](CONNECTED_FIXTURE_WORKFLOW.md).

## 1. What is actually verified

| Item | Observed state | Evidence |
| --- | --- | --- |
| Network | NEAR testnet only | RPC reads and deployment records |
| Contract | `gate.runlatch-demo-1108.testnet`, schema 2, default artifact | Deployment/init transaction `23jZ77SEAK3b4YwW6EjanToSSt1XtbCvvgTPxFXYJqg6`; code hash `F1pev22VSu86qxxWicXpCixtzzNoQxEi1FHRF2eGXjGP` |
| Operator | `runlatch-demo-1108.testnet` | Gate `get_operator` readback |
| Project | `project_demo_1108`, ACTIVE, revision 1, allocated 0, no capsules | Create transaction `BU2DMrx9gi3zTTzcybvjuCp5Zm9HQdpoP96SLafjvTnB` |
| Database provider | `db_demo_1108`, active, publisher/recipient `db.runlatch-demo-1108.testnet`, quote count 0 | FINAL transaction `5DnrDArTCEN8rGaDCAqacX2CmxvCymYozNam7iys4DLu`; independent read-only current-state and retained-attempt proof |
| Capsule / quote / restricted key / purchase | **Absent** | No public transaction exists |
| Outcome Receipt / report | **Absent** | No purchase to derive from |

The contract account is public testnet state. It is not a mainnet deployment, a production custody service or proof of delivery.

## 2. Desired eight-step demo and where each part lives

| Demo step | Rust / evidence implementation | Current status |
| --- | --- | --- |
| 1. Owner creates a project and Client Work Capsule | `create_project`, `create_capsule`; project revision and immutable policy hash | Project exists; capsule not created |
| 2. Registered provider publishes a canonical quote | `register_provider`, `publish_quote`; provider-authenticated, immutable terms | Provider registered; quote not published |
| 3. Restricted agent submits a purchase | `submit_purchase`; exact agent account, public key, zero deposit | Runner/admission locally tested; key not installed |
| 4. Contract checks current authority, quote, resource, expiry, uniqueness and full commitment | `gate.rs`, `commitment.rs`; denial reason codes | LOCAL SDK and Sandbox tested; no public call |
| 5. Valid request is reserved and schedules a native transfer | `authorize_request`; checked integer accounting | LOCAL tested; no public call |
| 6. Private callback confirms the actual transfer outcome | `resolve_purchase`; fail-closed pending on unknown | LOCAL tested; no public call |
| 7. Tampered or over-budget request is denied with a reason and no transfer | Stored-quote hash binding, budget and commitment rules | LOCAL and browser preview tested; no public adverse call |
| 8. Receipt separates settlement, provisioning, objective checks and human acceptance | `record_provisioning`, `record_task_check`, `record_human_acceptance`, `get_receipt` | LOCAL tested; no public call |

## 3. Exact public sequence

All amounts are native testnet NEAR in integer yoctoNEAR. Order 1 is completed and retained below for audit continuity; **never repeat it**. The human signs every remaining owner/provider/contract/key action in their own terminal; the agent never reads those credentials. A restricted agent key signs only the three purchase attempts below.

| Order | Signer | Method | Deposit | Gas | Security meaning |
| --- | --- | --- | --- | --- | --- |
| 1 — **completed; never repeat** | Operator `runlatch-demo-1108.testnet` | `register_provider` for `db_demo_1108`, publisher/recipient `db.runlatch-demo-1108.testnet` | `40960000000000000000000` yocto (0.04096 NEAR) | 50 Tgas | FINAL transaction `5DnrDArTCEN8rGaDCAqacX2CmxvCymYozNam7iys4DLu`; immutable identity only, no quote or purchase |
| 2 | Operator | `create_capsule` with project `project_demo_1108`, revision 1, budget 0.30 NEAR, per-purchase 0.05, per-commitment 0.30, approval threshold 0.05, `REQUIRE_APPROVAL` for recurring, providers `[db_demo_1108]`, services `[database-plan]`, categories `[database]`, quantity 1, agent `agent.runlatch-demo-1108.testnet` and its restricted public key | 0.30 NEAR budget + contract-quoted capsule storage credit | 50 Tgas | Creates the only purchase authority; policy is immutable |
| 3 | Provider `db.runlatch-demo-1108.testnet` | `publish_quote` for one `database-plan` / `booking-database` quantity 1 at 0.05 NEAR, non-recurring, expiry from the reviewed block | Contract-quoted quote storage credit (observed 0.08192 NEAR) | 50 Tgas | Provider authenticates its own canonical terms; agent cannot edit them |
| 4 | Human owner of the agent account | `AddKey` — FunctionCall key on the Gate, method `submit_purchase` only, allowance 0.05 NEAR | None (native action) | Native action, no prepaid Tgas | Gas allowance limits gas, not business spending; human recovery key remains |
| 5 | Restricted agent key | `submit_purchase` with the exact proposal `{project_id, project_revision, capsule_id, request_id: "database-01", quote_id, expected_quote_hash}` | **0** yocto | 100 Tgas | Rust re-checks all current state and reserves atomically |
| 6 | Restricted agent key | `submit_purchase` with a different `request_id` and a changed expected quote hash | **0** yocto | 100 Tgas | Must return `QUOTE_TERMS_MISMATCH`, no transfer |
| 7 | Restricted agent key | `submit_purchase` with a third `request_id` reusing the consumed quote | **0** yocto | 100 Tgas | Must return the Rust reason code for an unavailable/used quote, no transfer |
| 8 | Operator | `record_provisioning` bound to the exact request hash | 1 yocto | 50 Tgas | Owner-attested fixture fact, not supplier proof |
| 9 | Operator | `record_task_check` bound to the exact request hash and policy hash | 1 yocto | 50 Tgas | Objective fixture result; passed does not mean accepted |
| 10 | Operator | `record_human_acceptance` for the current evidence snapshot | 1 yocto | 50 Tgas | Explicit human decision; the agent cannot approve itself |

Scheduled native transfer and private callback receipts are contract-scheduled, not additional human signatures. There is no approval, renewal, pause/revoke/refund, key removal, resend or additional purchase in this sequence. A recurring quote used to demonstrate the approval path would add a separately reviewed `approve_purchase` (1 yocto, exact request ID and request hash); it is locally tested but not part of this first public sequence.

Before any command runs, the exact signer, account, receiver, code hash, method, complete arguments, deposit, gas, native exposure, allowance, funding and call count must be displayed and approved in the human's own terminal. A failure or unknown result stops the sequence for readback; never rerun an uncertain transaction.

## 4. Security implications and gates

- **No mainnet and no real funds.** Only testnet NEAR from the recorded faucet allocation.
- **No human full-access key in the browser, agent, repository or logs.** Owner, provider and contract actions stay in the human's terminal. The restricted key is process-injected only for the approved call.
- **The agent cannot change authority.** Rust rejects a different agent account/key, policy, project revision, capsule state, provider/recipient, quote terms, asset or expiry.
- **Approval binds to the exact request.** A stored request hash is required; approval cannot revive a stale revision or override a hard denial.
- **Unknown is not success.** A scheduled transfer, transaction hash or RPC inclusion is not settlement. A missing or failed callback keeps the reservation pending.
- **Storage, gas and purchase funding are distinct.** Provider/capsule/quote storage credits are not supplier payment or purchase budget.
- **The browser remains a preview.** No wallet, signer or public RPC write path is connected to the website.

Explicit human approval is required for each public step. This document alone authorizes nothing, and the broad local-development instruction does not authorize public signing.

## 5. Reproducible LOCAL Sandbox fallback

If the public sequence is not approved or cannot be completed safely, the claimed execution mode is **LOCAL Sandbox**, not NEAR testnet. The complete scripted agency path is reproducible:

```powershell
npm.cmd run prepare:sandbox-reports
wsl --distribution Ubuntu-24.04 --user runlatch --exec sh /mnt/c/Users/David/RunLatch/scripts/setup/test-sandbox-linux.sh agency
```

Observed 9 November 2026 output:

```json
{"result":"AGENCY_WORKFLOW_CHECKS_PASSED","public_testnet":false,"source":"LOCAL_NEAR_SANDBOX_SCRIPTED_AGENCY_WORKFLOW","runs":[
{"project_id":"agency-pass-...","scenario":"pass","payment_status":"SETTLED","settled_spend":"70","task_check_status":"VALIDATION_PASSED","human_decision":"ACCEPTED","fixture_service_calls":1},
{"project_id":"agency-provision-fail-...","scenario":"provision-fail","payment_status":"SETTLED","settled_spend":"50","task_check_status":"VALIDATION_FAILED","human_decision":"REJECTED","fixture_service_calls":1},
{"project_id":"agency-payment-fail-...","scenario":"payment-fail","payment_status":"SETTLEMENT_FAILED","settled_spend":"0","task_check_status":"VALIDATION_ERROR","human_decision":"REJECTED","fixture_service_calls":0}]}
```

This proves local runtime behaviour under the recorded setup. It does not prove public testnet execution, provider delivery, independent chain truth or user acceptance.
