# Testnet signing candidates — package-source review, not admission

**8 November2026.** Neither candidate is installed. `package.json` and the lockfile are unchanged. Package archives were fetched from official npm registry HTTPS URLs with redirects disabled, verified against the registry'sSHA512integrity, and selected package/build files extracted under ignored `.local/testnet-mvp/dependency-source-audit/`. No archive code, lifecycle script or signing operation was executed. This is a source-behavior review, not a security audit.

Current Context7 `/near/near-api-js` and `/near/docs` reads cover low-level action/signing, default retry behavior and ordinary/gas-key RPC permission formats. Catalog CLIs remain absent; their setup executes a remote installer and has no explicit approval. No catalog search/no-fit result, paid call or private project disclosure is claimed. Library-specific checks used official documentation/registry sources.

## NEAR Connect0.12.0 — still not admitted

`@hot-labs/near-connect` declares MIT, no runtime dependencies and no React peer range. This is not proof of the installed React19/Next16/CSP combination. Its archive does not include a standalone LICENSE file; redistribution notice review remains pending. No plugin or skill bundled with the archive was installed or followed as instructions.

Observed `build/NearConnector.js` behavior:

- Defaults to mainnet, auto-connect and local storage. With no supplied object manifest, loads mutable GitHub/jsDelivr manifests; manifest parsing contains a validationTODO.
- Creates its IndexedDB helper; reads/registers persisted debug-wallet manifests. Even the exclusion list specially retains `hot-wallet`.
- Installs parent-window message/injected-wallet discovery handlers. The constructor's parent message registration branch does not itself check source/origin. This is a review concern, not an exploit finding.
- Built-in popup/debug-manifest handling and sandbox wallet paths add behavior beyond the narrow exact-action review.

`build/SandboxedWallet/executor.js` fetches executor JavaScript from manifest URLs, caches/loads code through IndexedDB and supplies it to its iframe. It also bridges namespaced local storage. Pinning only the npm package does not pin the remote manifest/executor code.

**Decision:** do not install or initialize the default connector now. A future admitted wallet integration needs explicit testnet scope, a reviewed fixed wallet/transport, no remote executable/debug-manifest path, no automatic connection/persistence or parent-message authority, and measured browser/CSP/privacy tests. Whether this can be achieved without patching or replacing library behavior is unresolved. Do not add unreviewed third-party wallet code or silently change browser security. The previously excluded function-call-key plugin remains excluded; no broader-wallet fallback is permitted.

Archive integrity: `sha512-aBb1UPGr43tHPsj/uk3fEwCn83Y7+cO6Ct8B6G/dm9EkTwXh9/xntXyWhQ6fA1eSt2WtYqSczOCENXlrBAXZqg==`;51442bytes.

## near-api-js7.4.0 — low-level Node-only candidate, still not admitted

Declares `(MIT AND Apache-2.0)`, Node>=22.22.2, pnpm>=10.4.1; current project Node24.20.0 satisfies the Node requirement. No React peer is declared. The package LICENSE contains MIT permission text while its declared expression also requires Apache2.0; exact upstream notices and dependency licence/peer/engine checks must be resolved before admission, not silently simplified to MIT.

Direct dependencies: `borsh2.0.0`, `@scure/base2.2.0`, `@noble/curves2.2.0`, `@noble/hashes2.2.0`, `is-my-json-valid2.20.6`, `near-seed-phrase0.2.1`, `@noble/post-quantum0.6.1`. Their transitive versions/notices and clean install have **not** been tested in this project. No seed-phrase or post-quantum feature is part of the MVP.

Observed `lib/index.js` behavior:

- Low-level `Signer.signTransaction` encodes/hashes a transaction, checks signer public-key agreement and returns transaction hash plus signed transaction. `KeyPairSigner` holds the supplied key in process memory; this reviewed path itself performs no browser persistence/network call.
- `Account.signAndSendTransaction` defaults to optimistic execution, throwing on execution failure and up to10invalid-nonce retries, with automatic re-signing.
- JSON-RPC fetch has a separate10attempt backoff path and no equivalent of the project's bounded-response/sanitized/cancelled single-send boundary. Configuring account retries alone does not bound transport retries.

**Decision:** do not use convenience Account/provider send APIs for the one-shot runner. After exact dependency/licence admission, prefer isolated Node-only low-level transaction construction/signing using an injected restricted secret, local hash capture **before** a single bounded broadcast, and the existing read-only settlement observer. No SDK import belongs in the browser graph; no owner/provider/deployer/recovery signing belongs in the agent runner. A timeout must preserve the same transaction identity, never trigger a new nonce/signature, release funds or fall back to another key. This path is planned, not implemented or executed here.

Archive integrity: `sha512-n5BDLKC8zEkSZpvDkcMifiJKTZBCR54lVL4qAP4WfP98raRb339YxncRV2kL+h3eDDqA/nVBDCTH8iNvzH5PfA==`;511707bytes.

Before any install, explain the exact version, purpose/peers/licences and changed manifest/lock/Node-only signer/test/doc files, use a reviewed project-local install with lifecycle scripts disabled where appropriate, and verify clean install/type/lint/tests/audit and browser bundle exclusion. None of these candidate observations supplies public-signing or publication consent.

## Transitive follow-up — still no admission

The [exact candidate graph/source review](SDK_TRANSITIVE_SOURCE_REVIEW.md) now covers 68 locations / 67 integrity-verified archives, license/engine/peer metadata, packaged notices and selected ABI/seed/low-level source paths. The version-matching upstream commit supplies the missing SDK Apache text, while **bs584.0.1 and near-seed-phrase0.2.1 exact notice gaps remain**. Isolated candidate audit reports0 current advisories; that is not safety or legal clearance. No root dependency or lock change/install occurred. A separate [offline single-attempt exercise](LOCAL_SINGLE_ATTEMPT_EXERCISE.md) tests journal/uncertainty ordering without an SDK, signer, public adapter or new Gate. It does not finish the planned restricted runner.
