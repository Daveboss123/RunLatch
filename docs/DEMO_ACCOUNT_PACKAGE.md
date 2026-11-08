# New demo accounts — proposed scope, not execution approval

**8 November 2026.** The human created the parent and three exact children; independent read-only RPC verified their FINAL creation transactions/keys/initial balances. The agent has not read human secrets or signed. Deployment/init and remaining calls below are still proposed, not performed or approved by this document. Never repeat parent/child creation or key generation.

| Proposed account | Role | Human-controlled key |
| --- | --- | --- |
| `runlatch-demo-1108.testnet` | Operator/owner and initial parent | Full access, outside agent/app |
| `gate.runlatch-demo-1108.testnet` | Contract deployment and private init self-call | Full access, outside agent/app |
| `db.runlatch-demo-1108.testnet` | Canonical controlled database publisher/recipient | Full access, outside agent/app |
| `agent.runlatch-demo-1108.testnet` | Agent account | Retained human full-access recovery key plus one distinct restricted key |

Historical RPC at block `FJ9MLe8UXnyqwXDE2g1EUXsVWt4vWQT7qcZApemHbFVA`, height276798927, reported all four absent before creation. Current evidence supersedes that absence: gate4.5 NEAR tx `BxTkx6szB8Adn7v7wt27mYwBWwJpkurdgg25MBL56J2f`; db0.3 tx `9B4RnaMX6WyczGHfMTv98462juUArjng3qfw3WM7NJ36`; agent0.1 tx `5ueNZxf3Vfg35MQ9GMmPPswtWM52giGbfdEU9Lvp7JQF`. See BUILD_LOG.md section68. Account creation is not contract/purchase/outcome evidence.

## Proposed native amounts

These are **testnet NEAR**, not fiat equivalents. The parent grant was observed as 10 testnet NEAR; recheck current available balance before each approved step. Stop if it cannot cover the package; never substitute real funds or another account.

- Parent-created initial balances: contract4.5 NEAR, provider0.3 NEAR, agent0.1 NEAR; total4.9 NEAR.
- One project/capsule: budget ceiling/funded purchase allocation0.30 NEAR, immediate purchase cap0.05 NEAR, full commitment cap0.30 NEAR, autonomy threshold0.05 NEAR, recurring policy REQUIRE_APPROVAL.
- One canonical one-time database quote: due-now/full commitment0.05 NEAR, no future commitment. Exact resource/purpose and criteria use the existing fictional website fixture.
- Restricted key: `submit_purchase` only on `gate.runlatch-demo-1108.testnet`, zero deposit, gas allowance0.05 NEAR. Gas allowance does not grant purchase authority. Keep the recovery key; no deletion or unlimited allowance.
- Observed-price storage contributions: project0.08192 NEAR; provider registration0.04096 NEAR; capsule history2.62144 NEAR; quote0.08192 NEAR. Capsule creation attaches0.30 +2.62144 =2.92144 NEAR. Owner setup deposits total3.04432 NEAR; quote deposit is paid separately by the provider. Re-read actual contract requirements before approving the final calls.
- Code storage, account storage, transaction gas, scope-key gas allowance, capsule funding and provider payment are distinct. The 415910-byte code alone corresponds to4.15910 NEAR at the observed storage price; do not mistake the 0.30 purchase budget for all setup costs.

## Proposed execution count

One faucet creation request for the parent, followed by **15 human/agent signed transactions** if every preceding operation is proven successful:

1. Three parent transactions: each exactly CreateAccount + Transfer + AddKey(FullAccess) to its direct child.
2. One contract self-signed transaction: DeployContract of the default artifact + `init({operator_id: "runlatch-demo-1108.testnet"})`, zero function-call deposit,100 Tgas. Never use the callback-fault artifact.
3. Four setup transactions: owner `create_project`, `register_provider`, `create_capsule`, then provider `publish_quote`;50 Tgas each, exact deposits above.
4. One human agent-recovery-signed AddKey with the exact restricted permissions/finite allowance.
5. Three separately exact-reviewed restricted agent calls: valid database purchase, distinct altered-hash attempt, distinct attempt to reuse the consumed canonical quote;100 Tgas each and zero deposit. Actual reason codes/outcomes must come from Rust/RPC, not this plan. These use the normal submit path, not the separately deferred Replay Lab.
6. Three owner outcome transactions: `record_provisioning`, `record_task_check`, `record_human_acceptance`;50 Tgas each, one yoctoNEAR each. The owner must explicitly accept/reject the exact checked result; the agent cannot manufacture that decision.

Callbacks are contract-scheduled receipts, not additional human signatures. No approval, renewal, pause/revoke/refund, key removal, fallback account, resend or additional purchase is included. Any failure/unknown result stops the sequence for evidence readback; the count is a proposed happy-path maximum, not consent or completed execution.

## Remaining exact binding

The default artifact was rechecked locally:415910 bytes, SHA256 `d0397fc992cb8f0624076c59314dbe1339461f38ea4c66980dd3d39720c57964`, NEAR code hash `F1pev22VSu86qxxWicXpCixtzzNoQxEi1FHRF2eGXjGP`. It is not deployed.

Human-only local generation yielded **five public keys**, bound in an ignored public-record file: four full-access keys and one uninstalled restricted key. Do not repeat [completed key steps](HUMAN_DEMO_KEY_STEPS.md), the faucet or [completed children](HUMAN_DEMO_CHILD_STEPS.md). [The next human-only deployment/init command](HUMAN_DEMO_DEPLOY_STEP.md) uses only the Gate's exact Windows store entry after separate typed approval. It does not admit stock CLI defaults or a parent-signing fallback. No real human private key has been accessed by the agent; no new dependency or Windows policy change accompanies this step.

After human-only generation, bind those public keys, the exact opaque project/task/quote IDs, fixture criteria hashes, chain-derived expiry times, all arguments/deposits and fresh nonce/block values to one final human-reviewed package. **This document alone does not authorize account creation, key installation, deployment, signatures or acceptance.** Website hosting proceeds separately with honest absent-testnet labels.
