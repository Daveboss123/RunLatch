# Reversible testnet-only CLI profile

**8 November 2026 — explicitly approved local configuration change, completed.** No CLI binary, account, key, credential store, signer or network transaction was used.

## Active state

- Active config: `C:\Users\David\AppData\Roaming\near-cli\config.toml`
- Profile ID: `4f4dfc2b07ce4040a5fbea4101e0cc68`
- Preserved original: `C:\Users\David\AppData\Roaming\near-cli\config.runlatch-preserved-4f4dfc2b07ce4040a5fbea4101e0cc68.toml`
- Empty legacy directory: `C:\Users\David\AppData\Roaming\near-cli\runlatch-empty-legacy-4f4dfc2b07ce4040a5fbea4101e0cc68`
- New public profile SHA-256: `d86238d5bfdcbc7b682f7784f87cba9dfea685f5dbdaa9dd7527bf7755ef282b`

The original **3083-byte file was preserved by a same-directory, no-overwrite rename**. Its contents were not read, printed, hashed, copied, migrated or rewritten. Volume/file identity, size and last-write time matched before and after preservation; its original filesystem object and permissions remain with the preserved file. No secret or full-access key was extracted.

The new 434-byte UTF-8 TOML has `version = "5"`, an explicit empty legacy directory, and exactly one connection:

```toml
[network_connection.testnet]
network_name = "testnet"
rpc_url = "https://rpc.testnet.near.org/"
wallet_url = "https://testnet.mynearwallet.com/"
explorer_transaction_url = "https://explorer.testnet.near.org/transactions/"
```

No mainnet connection, API key, faucet, relayer, auxiliary service, account, signer, allowance or funding fields were added. The format was checked against the pinned NEAR CLI0.31.1 V5 source schema; **the CLI itself has not been run to parse it**. This changes the active settings for other NEAR CLI uses on this Windows user profile until restored. It is configuration—not a network firewall, wallet restriction or grant of spending authority.

## Inspect or restore

Run from `C:\Users\David\RunLatch`:

```powershell
# Read only metadata and the owned public recovery record; never original config contents.
node scripts/setup/human-cli-profile.ts status 4f4dfc2b07ce4040a5fbea4101e0cc68

# Restore only if the active profile and preserved original have not changed.
node scripts/setup/human-cli-profile.ts restore 4f4dfc2b07ce4040a5fbea4101e0cc68
```

Successful restoration reports `ORIGINAL_RESTORED`. It moves the public profile to `config.runlatch-inactive-4f4dfc2b07ce4040a5fbea4101e0cc68.toml`, then moves the same preserved original back to `config.toml`. It retains the recovery record and closed marker; nothing is deleted. It does not invoke NEAR CLI or restore/send any transaction.

If the active config, preserved original, recovery record or destination has changed, restoration **refuses rather than overwriting work**. After any interruption or uncertain move, inspect the existing state; do not repeat activation, clear its claim, manually overwrite the current config or assume failure means no rename happened. Ask for help with the exact reported state, never paste config contents or keys.

Recovery records are private local public-metadata files beside the config, not Git artifacts. Only the newly generated public profile is ever read for byte verification. NTFS can inherit a prior filename's creation timestamp during a rename; creation time is retained as information, while stable volume/file identity, size and last-write time are required. This is trusted local filesystem protection, not a sandbox against an OS administrator or hostile same-process code.

## Actual verification

- **9/9** profile cases pass on Windows, including six actual native filesystem cases: destination collision, apostrophe paths, original identity/byte preservation, restore/retained records, same-size edits, interrupted rename and competing claims. They use synthetic temporary files—not real credentials or accounts. Native cases explicitly skip on other operating systems.
- Full `npm.cmd run test:near`: **151/151**, exit0. Typecheck and explicit setup/test ESLint exit0.
- Real activation exit0; status reports `ACTIVE_TESTNET_PROFILE`, empty legacy directory and no signing authority. Only the new public file/owned record and original metadata were inspected.
- The harness/server restart happened after successful activation. Recovery status confirmed the same active profile; activation was **not repeated**. Both prior loopback preview processes returned exit4 during that restart. Their build artifacts were left unchanged and the processes were not restarted for this task.

The [CLI setup review](HUMAN_CLI_SETUP.md) still governs the next step: verify the official prebuilt CLI and constrain its retry/history/update/credential behavior before admitting a human signing flow. Windows Application Control remains unchanged; its earlier blocked custom build was not retried. No public action or Working testnet MVP completion follows from this profile. Replay Lab remains unstarted.
