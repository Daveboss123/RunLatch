# Working testnet MVP — implementation plan

**Requested:** 8 November 2026. **Sequence:** Working testnet MVP first; the new Replay Lab second, only after the human gives a separate go-ahead. The seven-case Replay Lab prompt is retained in the conversation and original blueprint; do not start that feature in this milestone.

## Existing foundations and actual gaps

The current Rust schema2 contract already implements project/revision and capsule authority, canonical provider-authenticated quotes, scoped agent identity, exact approvals, checked immediate/future accounting, native callbacks, owner unused-fund returns and separate provisioning/check/acceptance/report views. LOCAL SDK/Sandbox and browser evidence is documented in BUILD_LOG.md; none is public-testnet execution.

The browser currently imports LOCAL files and prepares unsigned historical drafts. It has no active public-testnet wallet connector, RPC observer or restricted-agent signing runner. No public contract/account/deployment/run target or exact signing consent has been supplied. Reuse the contract and shared validators/report/receipt math; do not build a second policy or settlement authority.

## Smallest complete first task

1. **Read-only network foundation:** explicit credential-free testnet RPC allowlist, named `.testnet` accounts, expected contract code hash/operator/schema, bounded timeouts/bytes/calls, final-block-pinned views and fail-closed errors. Missing config disables calls. Selected canonical project/capsule/provider/quote records only; ledger resolution alone remains unverified settlement.
2. **Transaction evidence:** bind previously submitted transaction identity, agent/owner method, exact args/key, native transfer and private callback receipt actions/outcomes to the request and final state. Distinguish pending/failed/unknown and contract business denial/ABI failure; never resend or release on timeout. Older node/receipt API gaps must be explicit.
3. **Human review/signing:** owner/provider wallet actions show account, receiver, method, exact args/deposit/gas, native purchase amount and full commitment. Re-read current canonical state immediately before eligible actions. Wallet connection does not grant business authority. No full-access secret in app/code/agent; no hosted signer or purchase relay. Do not use a browser access-key plugin that falls back to a broader wallet key.
4. **Restricted local agent:** one separate testnet account/key, only `submit_purchase` on one contract, zero attached deposit, finite positive gas allowance and retained human recovery access. Process-injected restricted secret only; validate on-chain permissions and bound policy before a single exact approved call. Preserve transaction identity for unknown outcomes. No owner/provider/deployer signing in the agent runner.
5. **Agency vertical slice:** exact human-created project/capsule, controlled database/hosting quotes, one registered database purchase, at least two regular-path adverse requests required by MVP (not the new Replay Lab interface), fixture provisioning, fixed objective check, separate owner attestation/acceptance and selected read-only report. Retain the existing LOCAL and illustrative modes without relabelling them.
6. **Verification:** adverse unit/parser/RPC/wallet-adapter/runner tests, applicable Rust/LOCAL integration, root browser/a11y/mobile and clean-checkout checks. Separately approved public execution must produce real network/account/code hash/transaction/receipt/final-state outputs before the first task is called a working testnet MVP.

## External-action gates

Before any account creation, key installation, public contract deployment or transaction, present the exact proposed network/accounts/contract/methods/amounts/gas allowance/actions and obtain approval. Account names/public keys may be supplied; never request private keys or recovery phrases in chat. Existing real accounts/keys are not discovered by opening credential stores. Deployment/signing consent does not authorize a GitHub push, web deployment, public post, submission or private-data disclosure.

Public signing/execution is not yet authorized by the broad implementation request. Local development continues independently. Do not claim a disconnected adapter or SDK mock completes this gate. Do not perform mainnet actions, real-supplier provisioning, fiat conversion or external paid inference.

## API/dependency review

8 November current official HACKATHON.md, NEAR wallet/transaction/access-key docs and Context7 NEAR API JS docs were read. Rules still require exact signing/publication/submission consent. The wallet guide recommends NEAR Connect. `@hot-labs/near-connect`0.12.0 is MIT with no runtime dependencies; `near-api-js`7.4.0 is MIT AND Apache-2.0, Node>=22.22.2, with additional cryptographic dependencies. These are reviewed candidates, **not installed**. Inspect actual package source, network/persistence behavior and licences before admission. Keep SDK signing code out of browser imports. The read-only RPC foundation needs no new dependency.

No `function-call-key-plugin`: its current peer range conflicts with connector0.12.0, it persists a browser key and falls back to wallet authority on denied permissions/removed keys. Those behaviors conflict with the project boundary. Human recovery access remains intact; finite gas is mandatory despite generic docs suggesting unlimited allowance.

Catalog CLIs remain absent and their remote installer lacks consent; no catalog search result, installer, payment or project disclosure is claimed. Required library/API checks used official read-only docs. Before visual implementation, notify the human again, inspect actual Roster hierarchy/controls and apply existing RunLatch tokens/dither/React constraints. No UI/layout work has begun in this audit.

## Second-task stop

After the first task is actually implemented and verified, report exact outputs and remaining limitations. Then tell the human Replay Lab is next and wait for their go-ahead (they may paste the prompt again). Do not silently implement Replay Lab under “anything else necessary.”
