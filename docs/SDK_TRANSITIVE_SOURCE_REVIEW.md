# near-api-js 7.4.0 — exact candidate graph review

**8 November 2026. Not installed or admitted.** Complements [the signing-candidate review](TESTNET_SIGNING_DEPENDENCY_REVIEW.md). This records archive integrity, package metadata, notices and selected source behavior, **not a security audit, exhaustive source review or legal clearance**.

## Resolution and retained evidence

A new ignored `.local/testnet-mvp/sdk-graph-review/` directory contains a private source-review manifest with only `near-api-js:7.4.0`. `npm.cmd install --package-lock-only --ignore-scripts --no-audit --no-fund --engine-strict --registry=https://registry.npmjs.org/` exited 0. It generated a candidate lock without installing `node_modules` or changing the project's manifest/lock. Current Node 24.20.0 satisfied npm's checked engine constraints; no declared peer dependencies were found in the candidate packages. No lifecycle code was executed and no pnpm migration was made.

Candidate lock SHA-256: `eb02f4143c40684ca469df51e89ccdf5838dc4dde3b9d077e8c581d0cf178c78`.

The graph has **68 locations / 67 distinct name-version pairs**. All 67 official npm archives (2,531,943 compressed bytes total) were independently SHA-512 checked against the lock, path/link checked before extraction, and package name/version checked. Metadata and 66 license/notice files were collected. The first extraction pass rejected three nonstandard archive roots (`node/` for old Node types; a bare `package` directory entry for the two NEAR seed/key packages). Those failed entries were retained; a separate completion pass rechecked their existing archive integrity and admitted only the explicitly inspected roots, without permitting traversal/links or refetching/rerunning uncertain downloads. This was a local inspection-tool constraint, not evidence of a malicious package.

Original and completed reports, archives and scripts remain ignored. The table below records exact candidate versions; it does not claim those files are installed. Re-resolve and compare the graph before eventual root admission, since range-resolved transitives may change. All packages declare license metadata; this alone does not satisfy every notice obligation.

`npm.cmd audit --package-lock-only --json --registry=https://registry.npmjs.org/` exited 0 and reported **0 advisories** for this isolated graph. The first report parser expected UTF-8 but PowerShell had saved UTF-16LE; decoding the existing BOM-marked result recovered the report without repeating the audit. Zero advisories is time-specific database output, not safety proof. Only package/dependency data was sent for this check, not private work orders, account credentials or artifacts.

## Source and notice decisions

- SDK root `README.md` explicitly says both MIT and Apache 2.0. The upstream version-matching commit **`08d29f447abcb8b8c9bec35645638fbf3d979257`** has package version 7.4.0, the same runtime dependency pins/license expression, byte-identical MIT `LICENSE` and a separate `LICENSE-APACHE`. Its complete root tree has no `NOTICE` entry. This resolves where the SDK's omitted Apache text is available; it does not prove a reproducible archive build or every bundled component's licensing.
- Pinned MIT file: 1023 bytes, SHA-256 `23f18e03dc49df91622fe2a76176497404e46ced8a715d9d2b67a7446571cca3`. Pinned Apache file: 9723 bytes, SHA-256 `62c7a1e35f56406896d7aa7ca52d0cc0d272ac022b5d2796e7d6905db8a3636a`. Exact official bytes and manifest capture are retained under the ignored `upstream/` folder. Preserve **both** terms if admitted; do not relabel the SDK as MIT-only.
- Three packages lack separately named archive notice files. `isarray:1.0.0` contains its full MIT notice in `README.md` (including Julian Gruber attribution), resolving that collection gap. `bs58:4.0.1` declares MIT and includes credits/MIT label but no full license text. `near-seed-phrase:0.2.1` declares MIT with no packaged notice or notice in its short README. **Those latter two exact-notice gaps remain unresolved, and installation remains deferred.** Attempted source paths returned 404; that is not license permission or proof a notice does not exist elsewhere.
- Selected hand-read sources confirm `is-my-json-valid` compiles schemas through `generate-function`'s `Function.apply` path. The SDK root imports the validator, but its ABI `RawContract` path invokes it. This is **not admitted** as a way to consume remote ABI/code. A future runner must import/use only reviewed low-level transaction/signing functions; no ABI, `Account`, provider send, keystore or retry path.
- The SDK root statically imports post-quantum code even though the MVP only needs Ed25519. Seed-phrase functionality is a separate export; its declared dependency still expands the installed graph with older crypto/stream/Node-type packages. Its entry computes/returns mnemonic/private-key material, not an MVP feature. No seed API, post-quantum signer, derived human key, browser storage or recovery secret is permitted in the runner.
- Reviewed SDK low-level calls encode/hash locally and check signer-public-key agreement. A future adapter must additionally verify the exact encoded action/receiver/deposit/gas/proposal, capture identity before a single bounded broadcast, retain it on uncertainty and reject broader key fallback. No such adapter was executed or installed here.

The first attempted `v7.4.0` tag lookup returned 404; the subsequently found version-matching commit is used instead. No tag completeness, release provenance audit, maintenance judgment or package security claim is inferred from those lookups.

## Candidate versions and declared terms

| Package | Version | Declared terms |
| --- | --- | --- |
| @noble/ciphers | 2.2.0 | MIT |
| @noble/curves | 2.2.0 | MIT |
| @noble/hashes | 2.2.0 | MIT |
| @noble/post-quantum | 0.6.1 | MIT |
| @scure/base | 2.2.0 | MIT |
| @types/node | 11.11.6 | MIT |
| available-typed-arrays | 1.0.7 | MIT |
| base-x | 3.0.11 | MIT |
| bip39 | 3.0.2 | ISC |
| bip39-light | 1.0.7 | ISC |
| borsh | 2.0.0 | Apache-2.0 |
| bs58 | 4.0.1 | MIT |
| call-bind | 1.0.9 | MIT |
| call-bind-apply-helpers | 1.0.2 | MIT |
| call-bound | 1.0.4 | MIT |
| cipher-base | 1.0.7 | MIT |
| core-util-is | 1.0.3 | MIT |
| create-hash | 1.2.0 | MIT |
| create-hmac | 1.1.7 | MIT |
| define-data-property | 1.1.4 | MIT |
| dunder-proto | 1.0.1 | MIT |
| es-define-property | 1.0.1 | MIT |
| es-errors | 1.3.0 | MIT |
| es-object-atoms | 1.1.2 | MIT |
| for-each | 0.3.5 | MIT |
| function-bind | 1.1.2 | MIT |
| generate-function | 2.3.1 | MIT |
| generate-object-property | 1.2.0 | MIT |
| get-intrinsic | 1.3.0 | MIT |
| get-proto | 1.0.1 | MIT |
| gopd | 1.2.0 | MIT |
| has-property-descriptors | 1.0.2 | MIT |
| has-symbols | 1.1.0 | MIT |
| has-tostringtag | 1.0.2 | MIT |
| hash-base | 3.1.2 | MIT |
| hasown | 2.0.4 | MIT |
| inherits | 2.0.4 | ISC |
| is-callable | 1.2.7 | MIT |
| is-my-ip-valid | 1.0.1 | MIT |
| is-my-json-valid | 2.20.6 | MIT |
| is-property | 1.0.2 | MIT |
| is-typed-array | 1.1.15 | MIT |
| isarray | 1.0.0 | MIT |
| isarray | 2.0.5 | MIT |
| jsonpointer | 5.0.1 | MIT |
| math-intrinsics | 1.1.0 | MIT |
| md5.js | 1.3.5 | MIT |
| near-api-js | 7.4.0 | MIT AND Apache-2.0 |
| near-hd-key | 1.2.1 | MIT |
| near-seed-phrase | 0.2.1 | MIT |
| pbkdf2 | 3.1.7 | MIT |
| possible-typed-array-names | 1.1.0 | MIT |
| process-nextick-args | 2.0.1 | MIT |
| randombytes | 2.1.0 | MIT |
| readable-stream | 2.3.8 | MIT |
| ripemd160 | 2.0.3 | MIT |
| safe-buffer | 5.1.2 | MIT |
| safe-buffer | 5.2.1 | MIT |
| set-function-length | 1.2.2 | MIT |
| sha.js | 2.4.12 | MIT AND BSD-3-Clause |
| string_decoder | 1.1.1 | MIT |
| to-buffer | 1.2.2 | MIT |
| tweetnacl | 1.0.3 | Unlicense |
| typed-array-buffer | 1.0.3 | MIT |
| util-deprecate | 1.0.2 | MIT |
| which-typed-array | 1.1.24 | MIT |
| xtend | 4.0.2 | MIT |

Future admission still requires explaining exact manifest/lock/Node-only adapter/test/notice changes, resolving the remaining notices and bundled-source scope, reviewed script-disabled installation, clean-install/type/lint/tests and browser graph exclusion. No public account, wallet, signer, network action, payment, publication or third-party contact is authorized by this review.
