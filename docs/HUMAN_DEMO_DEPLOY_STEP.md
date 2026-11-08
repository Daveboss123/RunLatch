# Deploy and initialize the Gate — human-only step

**Completed 8 November:** deployment/init transaction `23jZ77SEAK3b4YwW6EjanToSSt1XtbCvvgTPxFXYJqg6` is independently observed FINAL with the exact default code/operator/schema2/testnet. **Do not rerun deployment/init or remove attempt records.** The commands below document the completed scope; subsequent project/setup actions require their own exact approval. See BUILD_LOG.md section70.

**8 November 2026.** The three child accounts are created and independently observed. Do not recreate them or the parent, regenerate keys, or repeat the child batch. This is the next separate action, not a completed deployment or approval of the rest of the MVP.

## Exact scope to review

One **testnet-only, contract-self-signed** transaction:

| Field | Exact scope |
| --- | --- |
| Signer and receiver | `gate.runlatch-demo-1108.testnet` |
| Full-access public key | `ed25519:9mjERcGtp9pc2oqxZo8zKMrbKa44wuU47KrCquKTbraB` |
| First action | DeployContract of the pinned **default** WASM, 415910 bytes |
| SHA256 | `d0397fc992cb8f0624076c59314dbe1339461f38ea4c66980dd3d39720c57964` |
| NEAR code hash | `F1pev22VSu86qxxWicXpCixtzzNoQxEi1FHRF2eGXjGP` |
| Second action | `init` with `{"operator_id":"runlatch-demo-1108.testnet"}` |
| Function-call gas and attached deposit | 100 Tgas, **0 yoctoNEAR** |
| Result configuration | Operator above, schema2, network tag `testnet` |

The current Rust initializer requires contract-self caller and no existing state. The parent/operator cannot substitute its signature. The command checks the actual default artifact at `\\wsl.localhost\Ubuntu-24.04\home\runlatch\.cache\runlatch-artifacts\production\runlatch_contract.wasm`; it does not rebuild, copy, choose a fault artifact, or accept another path.

**Signing path:** local Node24.20+ with the already installed size/SHA-pinned Koffi3.3.7 Windows Credential Manager tool. Only the Gate's exact newly created credential target is read, **after your exact typed approval**, in your terminal process. No stock NEAR CLI, browser/hosted signer, parent fallback, private-key file, key export, environment injection or new dependency. Full-access authority remains human-controlled; the app/agent never receives this key. JS strings/KeyObjects and the same-user OS remain trust assumptions, not secure-memory or custody guarantees.

The public chain/RPC receives the account, public key, code, arguments, nonce/block, signature and transaction identity. No private key is printed or sent. No transfer, account creation, restricted-key installation, project/capsule/provider/quote setup, purchase, provisioning, acceptance, Git push or website deployment is included.

## Costs are separate quantities

Unsigned preflight at block `7sMyxYAh2WM1juZCxTQB3BRt3fau93f3dTHSBMdbrYrr`, height276808618 observed 4.5 NEAR,182 account-storage bytes, key nonce276806735000000, no code/state, protocol88, gas price100000000 yocto/gas and storage price10000000000000000000 yocto/byte. This is an observation, not a reusable signed approval.

- Code storage alone: **4.15910 NEAR collateral**, not a payment to a provider or spent transaction fee.
- Native deployment/action overhead estimate:31255992702794 gas; initializer prepaid gas100000000000000. At the observed price, their combined budget is **0.0131255992702794 NEAR**, not a guarantee of final fees.
- Existing account storage is separate. The helper conservatively allows8192 extra initialization-state bytes (**0.08192 NEAR at that price**) and0.03 NEAR balance margin. Neither is a measured exact state cost or protocol fee cap.
- Observed minimum balance including those cushions: **4.2859655992702794 NEAR**. No additional funding transfer is part of this command. It stops if current funding cannot cover its checks.

The command fetches fresh finalized state/fees before displaying the review and rechecks before signing. Changed key/nonce, existing code/state, unsafe nonce, insufficient balance or changed fees stop it. Future setup/storage/purchase deposits remain separately reviewed.

## Run in your own PowerShell terminal

```powershell
cd 'C:\Users\David\RunLatch'
node scripts/setup/human-deploy-demo-gate.ts
```

Review the displayed scope, key, artifact hashes, exact arguments, deposits, current fees, nonce/block and public transaction hash. Only if you approve, type exactly:

```text
DEPLOY AND INIT gate.runlatch-demo-1108.testnet USING LOCAL NODE SIGNER
```

Anything else cancels without credential access/signing/sending. The review expires after two minutes. Do not paste private keys, credentials or signed transaction bytes into chat.

The command sends **once**. Exclusive public review/intent/hash records exist before signing; a send-entry marker exists before RPC. It waits for FINAL, checks exact deployment digest/init actions, signature-bound transaction identity, complete successful receipt graph and actual gas/tokens burned, then queries same-final-block code bytes/hash, operator/schema/network, retained sole public key and exact consumed nonce. The nearcore transaction ActionView returns a base64 **code digest**, not the full WASM; separate `view_code` verifies the actual bytes. RPC observations are not trustless light-client proofs.

On success, send only the public `GATE_DEPLOYMENT_AND_INIT_OBSERVED` JSON result here. It includes actual transaction/receipt references and separately reports `restricted_key_installed:false` and `purchase_executed:false`. Deployment/init does not prove purchase settlement, provisioning, objective check, human acceptance or a completed Working testnet MVP.

## On error, timeout or interruption

**Do not rerun the deployment command. Do not redeploy/reinit/re-sign/resend or delete/rename/edit `.local/human-key-setup/deployment-attempt/`.** Run only:

```powershell
node scripts/setup/human-deploy-demo-gate.ts --check
```

This reads public current state and the existing transaction identity. It never signs, sends, resumes or releases a marker. Unknown results are not proven failures. Even a signing/journal error retains the attempt; any later action needs evidence review and a separately approved scope, not an automatic retry.

## Local verification and reproduction limits

Twelve focused offline tests cover artifact/scope/signature changes, nonTTY/store refusal, safe import, same-block network/key/nonce/state/funding, exclusive identity ordering, FINAL/graph/costs, failed/unknown send, wrong code/config and stale reviews. Four Rust V0 vectors compare exact wire bytes/hashes across boundary nonces, plus one generated Ed25519 signature/corruption check. Child and restricted-agent parity remain unchanged. Commands/results are in BUILD_LOG.md.

Artifact-dependent Node tests explicitly skip in a fresh web checkout without the ignored build cache; that is not a pass for deployment composition. The Linux parity command requires the already-built default WASM. No test reads real human credentials, starts Sandbox or performs a public signature/transaction. No UI/browser/build/deployment claim follows from these helper checks.
