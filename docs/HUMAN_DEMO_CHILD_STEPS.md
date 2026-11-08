# Create the three demo child accounts — human-only step

The parent `runlatch-demo-1108.testnet` was created by the human and independently observed with 10 testnet NEAR and the expected operator FullAccess key. Do not repeat the parent faucet request or generate replacement keys.

## Exact scope

This is a **local Node command**, using the already installed, size/SHA-pinned Windows Credential Manager helper. It is not the stock NEAR CLI, a browser wallet, a hosted signer or a broader agent key. The confirmation explicitly selects this local signing path. Only your operator credential is read, in your own terminal process, after approval. No private key is printed, passed to the agent, written to a file or sent to RPC.

Three parent-signed **testnet-only** transactions, in this order:

| Child account | Initial native NEAR | Initial human-controlled FullAccess public key |
| --- | ---: | --- |
| `gate.runlatch-demo-1108.testnet` | 4.5 | `ed25519:9mjERcGtp9pc2oqxZo8zKMrbKa44wuU47KrCquKTbraB` |
| `db.runlatch-demo-1108.testnet` | 0.3 | `ed25519:3WYYFFAVric9chaHHF5ed8gFSqBE2DppAtGPrxvx7YXN` |
| `agent.runlatch-demo-1108.testnet` | 0.1 | `ed25519:6JcrDrG1V7GarzGkJF8vCsTcfKHSWqGfcP5BVT5n19C8` |

Each transaction has **CreateAccount + the exact Transfer above + AddKey(FullAccess, initial action nonce 0)**. The protocol initializes the installed key's nonce; it need not remain zero in account views. Your existing operator public key is `ed25519:4WJHM7chT6geyrN23fRR3sSLJhRaXmRaEjcaZvpUrXuL`.

The total transfer is **4.9 testnet NEAR**, plus native protocol fees. Before approval the command displays exact decimal-string amounts, public keys, transaction nonces, block reference, current gas price and native-action fee estimate. It leaves a 0.03 NEAR fee cushion in the parent, beyond its storage requirement; this is a balance check, **not a protocol-enforced fee cap**. Native actions do not have a FunctionCall prepaid-Tgas argument. Account/code storage and later purchase/storage deposits are separate costs.

This does **not** deploy/init the contract, install the restricted agent key, set up project/quotes, purchase a resource, accept an outcome or send mainnet/real funds. The restricted public key stays uninstalled for this step. Human recovery keys remain intact. Public accounts, public keys, amounts and transaction identities are disclosed on testnet/RPC.

## Run in your own PowerShell terminal

```powershell
cd 'C:\Users\David\RunLatch'
node scripts/setup/human-create-demo-children.ts
```

Check the printed account names, amounts and keys against the table. If correct, type exactly:

```text
CREATE THREE CHILDREN runlatch-demo-1108.testnet USING LOCAL NODE SIGNER
```

Anything else cancels without credential access, signatures or sending. The review expires after two minutes; an expired approval cannot sign. If you do not consent to the local Node signing path, cancel—there is no silent wallet/CLI fallback.

The command sends each transaction **once**, waits for RPC-reported FINAL successful native actions, then checks the child balance, sole expected FullAccess key and exact consumed operator nonce before proceeding. It preserves public hash/nonce/action identity before signing, and an exclusive send-entry marker before RPC. It stops on any error, changed key/state, failed receipt or unknown result. No automatic retry, re-sign, replacement key or funding fallback exists.

On full success, copy the three `CHILD_ACCOUNT_OBSERVED` JSON lines and the final:

```text
THREE_CHILD_ACCOUNTS_OBSERVED
```

Only those **public results** belong in chat. No credential export, private-key value or signed transaction bytes are needed.

## If it stops or the terminal closes

**Do not repeat the creation command.** Do not delete/rename the ignored `.local/human-key-setup/children-attempt/` directory or any marker. Run only:

```powershell
node scripts/setup/human-create-demo-children.ts --check
```

This reads current account state and the saved public transaction identities. It does not sign/send or enable resumption. Copy its public results here. A partially completed batch needs evidence review and a separately approved remaining scope; do not run this full batch again. Unknown status is not proof of failure. Fees can have been spent even if creation failed.

The exclusive attempt records are local safeguards, not tamper-proof storage or a secure-memory guarantee. JavaScript strings/KeyObjects and the OS store remain human-machine trust assumptions. RPC FINAL/account/key readback is not a trustless light-client proof and does not prove a deployed contract or completed Working testnet MVP.

## Local verification

Ten focused cases cover fixed scope/bytes/signature corruption, noninteractive/store refusal, safe read-only imports, generated-record binding, wrong network/key/unsafe nonce/existing child, three sequential success proofs, uncertain/partial responses, altered/incomplete receipt graphs, stale state and retained exclusive markers. Offline Rust compares 12 child V0 byte/hash vectors and three ephemeral signatures; the existing 24-vector/two-signature restricted-agent parity remains unchanged. No real human key/store read or public transaction is part of these tests. See `BUILD_LOG.md` for exact command results and limitations.
