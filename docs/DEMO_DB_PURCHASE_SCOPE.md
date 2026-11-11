# One restricted database purchase — exact human-approved scope

**11 November2026.** The human explicitly approved **one**0.05native testnet NEAR database purchase after all four setup actions were independently observed FINAL. This is not broad agent authority, a mainnet approval, permission for another request or an owner/recovery-key fallback.

## Exact call and money

- Target: testnet FastNEAR RPC, Gate `gate.runlatch-demo-1108.testnet`, expected code `F1pev22VSu86qxxWicXpCixtzzNoQxEi1FHRF2eGXjGP`.
- Signer: `agent.runlatch-demo-1108.testnet`, only restricted `ed25519:ABWnTWVgg59wN1p7pYfjcUUf53FFYubzELSBPq57Z2hY`.
- Method: one `submit_purchase`,100Tgas, **zero attached deposit**.
- Proposal: Project `project_demo_1110` revision1, Capsule `capsule_demo_1110`, request `db_purchase_demo_1111`, quote `db_quote_demo_1110`, hash `ae846302dbae490ba2352bbce89162821b8882a9c237903f97692ad9007231a3`.
- Rust loads the canonical registered recipient `db.runlatch-demo-1108.testnet`, database-plan/booking-database/quantity1, all-inclusive one-time **0.05 NEAR**, future commitment0. No free recipient, price or asset is supplied in the purchase.
- Funding: Capsule0.30 NEAR; immediate0.05 reservation first. Only a proven successful native transfer/private callback moves that amount to spent, leaving0.25. Gas comes from the separate agent account and finite0.05 allowance; gas/storage are not purchase spending.

No setup, provider publication, owner approval/evidence/acceptance/refund, second purchase, adverse request, mainnet or retry is included. Provisioning remains a labelled controlled fixture, not a live database or provider guarantee.

## Human terminal only

From the project root in your own PowerShell:

```powershell
node scripts/setup/human-db-purchase.ts
```

Inspect the exact fresh review, policy/quote hashes, recipient, amounts, permissions and separate gas/account-cost preflight. If you approve that one call, type:

```text
BUY ONE DATABASE QUOTE db_quote_demo_1110 FOR 0.05 TESTNET NEAR FROM capsule_demo_1110 USING RESTRICTED AGENT KEY
```

The helper reads **only** the fixed restricted WinCred key after typed humanTTY approval, a permanent attempt directory, matching fresh state and exact issued execution consent. It converts to a short-lived private in-memory PKCS#8 slot, consumes the slot synchronously, and disposes the opaque handle after the one run. No key is printed, written to `.env`/files, inherited through `process.env`, put in the browser/chat, or loaded by the agent. Human full-access keys are never purchase signers. Managed-memory erasure is not guaranteed; this is trusted local operator code, not a same-user OS sandbox.

## One send and read-only recovery

The existing restricted runner owns the durable request/key journals and exact signature/hash capture **before** one native `broadcast_tx_async`. An acknowledgement is not inclusion or settlement. The helper separately observes the same exact transaction's FINAL call/native transfer/private callback/historical code/current state; missing or failed evidence stays pending/unverified. No timer releases funds or claims.

Any existing `.local/human-key-setup/demo-db-purchase-attempt/` is permanently readback-only, including pre-send failures. Never delete/edit any attempt/request/key marker, change IDs/nonces, re-sign/resend, choose another endpoint/key or use recovery/owner authority for the purchase.

```powershell
node scripts/setup/human-db-purchase.ts --check
```

`--check` observes only a retained exact public identity (or its already-captured request-journal identity). It cannot adopt an approval, resume signing, release capacity or pay again. `--preflight` reads current state/fees only and creates no key, signature, attempt or consent.

Return public `DB_PURCHASE_SETTLEMENT_OBSERVED` or the pending/stopped result; never paste a private key, DER/base64 secret, environment/profile dump or raw exception. Provisioning, objective check, explicit human acceptance and Outcome Receipt remain separate later steps.

## Verification boundary

New helper control-flow/consent/cost/identity/unknown/concurrency cases use explicit synthetic RPC/runner ports and generated in-memory credential conversion. Existing original restricted runner and independent Node/Rust wire/signature tests are separate evidence; no real combined signature/settlement is inferred from mocks. Exact commands/results and native unsigned preflight are in BUILD_LOG.md. A real public purchase is absent until the human executes this reviewed scope and actual receipt/state evidence is verified.
