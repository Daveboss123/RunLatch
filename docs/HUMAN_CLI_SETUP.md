# Human-operated NEAR CLI path — review and current blocker

**8 November 2026.** The human chose CLI signing for the first Working testnet MVP. That choice authorizes local path/tool preparation, **not** accounts, key installation, signatures, deployments, funding or a public run. The app remains read-only; Replay Lab remains unstarted.

## Exact reviewed candidate

Official `near-cli-rs` **0.31.1**, release 5 November, source/tag tree `5cdedc38e09b23b84ae9d69f6abbb26568dda579`. Rust minimum1.95; the current stable Windows toolchain is1.99. The package declares **MIT OR Apache-2.0**. The unchanged MIT notice is retained in [licenses/near-cli-rs-MIT.txt](../licenses/near-cli-rs-MIT.txt); both full upstream licenses remain with the private extracted source. No binary distribution, complete transitive license review or security audit is claimed.

The official source archive was verified against published release metadata: **11,079,000 bytes**, SHA-256 `aa0736fa9c23ee6866b39776ba1e9ea7422e8a999be9d2761f7d56a8eccf886a`. Resolved tar entries were checked for bounds/traversal/absolute paths/links before extraction. The source is private/ignored under `.tools/human-cli-0.31.1/near-cli-rs-0.31.1`. No PowerShell remote installer, global npm/Cargo install, PATH edit or security-policy change was performed.

Current Context7 NEAR docs supplied installation/signing context; no exact CLI library was available there, so pinned first-party source governs the behavior below. This is a local developer tool, not another product Rust crate, npm dependency, SDK admission or payment engine.

## Defaults that cannot be silently admitted

- Ordinary sending uses `send_tx` and retries after uncertain errors. **Do not use CLI `send` or `send-signed-transaction` for this MVP.** Preserve the exact identity and use the existing bounded single-send/evidence mechanics after separate approval.
- `sign-with-keychain` falls back to legacy JSON credential files when the secure store is unavailable. Online mode may select another full-access key. The human flow must bind the exact reviewed public key and cannot adopt a broader or plaintext fallback.
- Startup reads/migrates global config **before help/version parsing**, scans legacy credential indexes and saves command history even in quiet mode. A self-update check starts even when `--offline` is selected.
- Offline `transaction sign-transaction` plus explicit signer public key, nonce, block hash and height supports ordinary V0 signing. Its offline nonce is used as supplied—not incremented again. `save-to-file` emits `signed_transaction_as_base64`; it is not submission or settlement. Changed output fields/nonce/action/key must be refused before any send.
- A signed output file is explicitly requested human-held material, not a request/key journal or proof of chain inclusion. A timeout, partial output or CLI error never authorizes re-signing, resending or resetting an attempt.

Human owner/provider keys remain outside the browser and agent. The agent must not run key import, account creation, secret-store lookup or owner/provider signing. A future human-only command must show exact account/receiver/method/arguments/deposit/gas/native exposure and current-state review, with separate exact public consent.

## Private source restriction attempt

`scripts/setup/patch-human-cli.ts` performs exact three-file release-hash checks, prepares every transformation before writing, rejects changed/missing/repeated anchors, and uses exclusive temporary files plus a source re-check. It loads no secret, profile, wallet or network.

Prepared restrictions:

1. `src/main.rs`: remove automatic legacy-index scanning and command-history saving.
2. `src/config/mod.rs`: require `RUNLATCH_HUMAN_CLI_CONFIG`; no global/default/migration fallback; a testnet-only allowlisted RPC profile, no API keys/relayer/extra service configuration, and an empty ordinary legacy directory.
3. `sign_with_keychain/mod.rs`: exact offline ordinary Ed25519 key, no online/gas/meta/legacy fallback; sanitized credential errors and returned public-key mapping check.

The attempted build used `cargo +stable build --locked --release --no-default-features --bin near`, with a dedicated private target directory. No-default-features omits updater/Ledger/BLE/inspect/verify extras; Windows-native keyring remains a core dependency. Cryptography and transaction construction were not replaced.

**Actual result: build failed, exit1.** Windows Application Control blocked execution of the `proc-macro-error` build script (os error4551, never executed). No CLI binary was produced or run. No exception, execution-policy change, antivirus disable, alternate execution of that blocked file or secret-store access was attempted. Preserve that job's existing output; do not rerun uncertain jobs or treat source transformation tests as a working signer.

## Current next gate

The official prebuilt Windows binary is the next candidate, **not yet downloaded/executed/admitted**. Its source defaults above still apply; it cannot be represented as the privately patched build.

Metadata-only inspection initially found an existing global CLI configuration at `C:\Users\David\AppData\Roaming\near-cli\config.toml`. After explicit human approval, its contents were preserved unread by a same-directory rename and a public-only V5 testnet profile was activated. [Exact state and restore command](REVERSIBLE_CLI_PROFILE.md). Original contents were not copied, overwritten, migrated or disclosed; no CLI or credential-store operation was used.

The configuration-handling gate is now complete for that exact local profile change. Next verify the official prebuilt binary and constrained workflow; the new profile alone does not admit signing or fix the CLI's retry/history/update defaults. No real keys or API credentials should be pasted into chat or command arguments. Further config changes, key handling and public actions require their own applicable scope.

Then finish the exact human unsigned-byte/review, signed-output validation/identity capture and shared one-send connection. These are still unfinished. Before any public action, present the exact accounts/roles/code hash/keys/receiver/methods/arguments/gas/deposits/allowance/funding and call count for approval.

## Verification actually completed

- **6/6 synthetic source-transformation tests**, not signing or OS-keychain tests.
- Pinned source patch preparation exit0; WindowsCargo metadata exit0; TypeScript typecheck and explicit setup/test ESLint exit0.
- Private Rust build **failed** as above. No Rust CLI test/pass/binary/hash/runtime/credential-store result exists.
- No npm/contract/SDK dependency, UI/layout or existing preview rebuild/change. No public account/key/deployment/signature/payment/provider action/publication/post/submission.

Detailed hashes, failures, permission boundaries and retained paths are in BUILD_LOG.md section59. A working human signer and actual approved transfer/callback/fixture/check/acceptance/receipt/report evidence remain required before the first task is complete.
