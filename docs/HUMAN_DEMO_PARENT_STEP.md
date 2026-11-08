# Create the parent demo account — human step

The five human-reported public key records are now validated and bound locally in ignored `.local/human-key-setup/public-demo-keys.json`. No private key or Credential Manager value was read by the agent. The parent is still absent according to the latest read-only testnet RPC check.

## Exact public action

- One POST to the first-party CLI's testnet faucet endpoint: `https://helper.nearprotocol.com/account`.
- Account: `runlatch-demo-1108.testnet`.
- Initial FullAccess public key: `ed25519:4WJHM7chT6geyrN23fRR3sSLJhRaXmRaEjcaZvpUrXuL`.
- Request fields only: `newAccountId` and `newAccountPublicKey`.
- No owner signature/deposit; faucet-sponsored testnet funding. The faucet chooses its grant, so its amount is **not promised**. Confirm the observed balance before child-account funding.
- No other account, contract deployment, key installation, purchase, mainnet action or retry is included. Account/key data becomes public and is disclosed to the faucet.

## Run this yourself

In your own Windows Terminal / PowerShell:

```powershell
cd 'C:\Users\David\RunLatch'
node scripts/setup/human-create-demo-parent.ts
```

The command reads the public bindings and current testnet state, then shows the exact request above. To approve that **one public account-creation request**, type:

```text
CREATE runlatch-demo-1108.testnet
```

Any other response cancels without a faucet call. If the account already exists, the helper checks the expected public key and never calls the faucet again.

Copy the final public result back here. The desired readback status is:

```text
PARENT_ACCOUNT_OBSERVED
```

It includes the exact decimal-string balance and finalized block hash, not private data. A faucet response alone is not account proof. If it says `PARENT_ABSENT`, `FAUCET_OUTCOME_UNCERTAIN` or stops, **do not rerun the creation command**. Run only:

```powershell
node scripts/setup/human-create-demo-parent.ts --check
```

Send that read-only result. Never delete `parent-faucet-attempt.json`, create replacement keys or assume timeout means failure. The helper exclusively writes and syncs that public attempt marker before its single faucet POST and retains it after every response/error.

## What follows

After the actual account/key/balance readback, fill and approve the exact three child-account transactions, contract self-deployment/init and remaining setup/run calls in `DEMO_ACCOUNT_PACKAGE.md`. Human keys stay in your local signer; no full-access key is passed to the agent. Do not claim that parent creation alone completes the Working testnet MVP.

Five focused tests cover public binding, testnet/absence/current-block reads, exact FullAccess key/list matching, permanent exclusive marker and noninteractive refusal. Native fetching is bounded and rejects redirects; test fixtures do not call the faucet. No CLI profile change or new dependency accompanies this step.
