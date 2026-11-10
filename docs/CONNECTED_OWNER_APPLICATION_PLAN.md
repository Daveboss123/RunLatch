# Connected owner application — admitted scope

**9 November 2026. Active implementation plan.** The human explicitly requested an operational owner application, completion of the public testnet vertical slice, concise page guidance without renaming existing sections, and replacement of inert controls. This plan narrows that request to the existing single-operator RunLatch MVP; it does not create a generic wallet, hosted signer, multi-tenant SaaS, marketplace or unsafe settlement override.

## Product path

1. **Product** — inspect one project, its Capsule, purchases and evidence. Seeded and imported LOCAL records remain labelled and separate.
2. **The Gate** — challenge one proposed purchase and understand the exact rule/financial consequence. Browser decisions remain simulations; Rust is authority.
3. **Intelligence** — select receipt evidence and derive project spend/outcome reports without treating missing evidence as zero.
4. **Evidence** — inspect reproducible contract, test and source boundaries.
5. **Docs** — understand roles, accounting, failure behavior and reproduction.
6. **Testnet owner workspace** — connect an admitted testnet wallet, prepare a fresh exact action, explicitly approve one transaction, then inspect returned identity and current state.

Each page gets one compact “Use this page” strip with three concrete steps and a result. Existing navigation names remain unchanged.

## Browser-wallet admission

The current official NEAR guide recommends `@hot-labs/near-connect` 0.12.0. Its default connector dynamically loads mutable remote manifests/executors, initializes IndexedDB/local-storage behavior, registers parent/injected discovery listeners and defaults to auto-connect/mainnet unless configured. The prior source audit therefore remains valid: the default package is **not** installed or initialized.

RunLatch instead admits a minimal compatibility bridge for the connector’s documented injected-wallet interface:

- testnet only; explicit user click starts bounded discovery;
- accepts only an injected wallet reporting testnet, sign-in-without-key and single-transaction features;
- no remote manifest/executor, package, WalletConnect, iframe, parent-frame bridge, debug wallet or arbitrary plugin;
- no automatic connection, polling, persistence, browser key generation or local/session storage;
- wallet stays in React memory and owns the human key; no private key enters RunLatch;
- exact connected account and exposed public key must match the freshly reviewed on-chain signer key;
- only one allowlisted RunLatch human method is converted to one FunctionCall action;
- receiver, method, args, gas and deposit come from the current issued review, never free wallet fields;
- sign requires explicit review-hash consent and an immediate second final-block read; changed state stops;
- wallet return supplies a bounded public transaction identity only. It is not settlement, provisioning or acceptance.

Synthetic injected wallets test the bridge. Public execution still requires a compatible wallet containing the intended existing testnet account. Existing human-terminal one-call helpers remain the safe fallback for accounts held only in Windows Credential Manager. No credential import into the app is requested.

## Public vertical slice

Completed and immutable: accounts, default Gate deployment/init, project and provider registration. Remaining order:

1. operator creates one funded immutable Capsule;
2. provider publishes one canonical one-use database quote;
3. human recovery owner installs one finite `submit_purchase`-only key on the agent account;
4. restricted local agent submits one exact valid purchase, followed only by the separately reviewed adverse attempts;
5. observer proves the native transfer and private callback or retains unknown/pending state;
6. owner records labelled fixture provisioning, exact objective check and explicit acceptance;
7. browser reads the public Outcome Receipt and selected report.

Every owner/provider/AddKey signature remains an external human wallet or own-terminal action. The restricted agent signs only after its exact call/exposure review. Any uncertain transaction stops for readback; no repeat signing, resend, timeout release or account fallback.

## Recovery and organisation boundary

- MVP organisation access is the one authenticated operator account and on-chain roles. No email/password identity, general team RBAC or multi-tenant database is introduced.
- “Reconciliation” is evidence collection and fail-closed status for a known transaction. The current contract has no public/operator settlement setter. A missing/unproven callback never becomes a human-declared failure or releases capacity.
- A future state-changing catastrophic-recovery method requires a separately reviewed contract design/deployment and adversarial tests. It is not smuggled into this UI milestone.

## Completion evidence

Code is not called operational until wallet discovery/connect/signing tests, exact-review tests, browser accessibility/responsive checks, bundle/privacy scans and a production build pass. Public testnet claims require actual transaction/receipt/final-state readback. Deployment and documentation must continue to distinguish browser fixtures, LOCAL Sandbox and NEAR_TESTNET evidence.
