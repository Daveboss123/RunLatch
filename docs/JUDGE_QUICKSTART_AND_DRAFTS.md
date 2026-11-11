# Judge quick-start and unpublished demo drafts

> **Historical guide. Current entry point, 11 November 2026:** use [the Option C recording guide](OPTION_C_DEMO_SCRIPT.md), [README](../README.md) and BUILD_LOG.md sections 85–87. The site is live and the repository is public. Four testnet setup transactions are FINAL; the one signed purchase is unresolved, not failed or settled. The end-to-end workflow uses separately labelled LOCAL Sandbox evidence. Older counts, deployment-absence statements and drafts below describe their original checkpoint, not the current build. No default setup/purchase command may be repeated; no X post or submission has been made.

Local-only prototype. These are preparation materials, not a submitted payload or a published post. Public repository, deployment, signing, X media and submission each require separate human approval.

Release-hardening checkpoint:42 browser/36 frontend Node/115 backend Node pass, with140 Rust/SDK/15parity vectors and all-mode LOCAL Sandbox evidence separately recorded.16 read-only checks confirm default-empty/selected report export against the three existing generated canonical cases; they do not rerun contract execution or verify a public chain. Latest exact results, clone reproduction and remaining licence/privacy/platform limitations: [release record](release/RELEASE_STATUS.md) and BUILD_LOG.md section41. Human visual review remains deferred.

## 90-second product path: do X → see Y

Prerequisite: Node 24.20+, `npm.cmd ci`, `npm.cmd run dev`, open `http://127.0.0.1:3000`. No wallet or `.env` credentials. Use `npm` instead of `npm.cmd` on Linux/macOS. Do not start another server on port 3000.

1. **Try the Gate → `/gate`.** Valid request is eligible **in simulation**, with canonical demo hash, exact amount and actual preview checks. No money is held or transferred.
2. **Alter recipient → `QUOTE_TERMS_MISMATCH`.** Inspect quote binding: the changed submitted hash cannot replace canonical terms. Hard denials are not approval opportunities.
3. **Hidden term → full commitment denial.** 0.20 NEAR now + 2.20 future = 2.40 minimum. Existing settled/reserved fixtures leave 2.30 available to commit. Set hypothetical allocation to 4 → owner approval required, still no hold.
4. **Uncapped exposure → `UNBOUNDED_COMMITMENT`.** Larger allocation does not make an unknown recurring term eligible.
5. **Inspect a project → `/demo`.** Evaluate fresh database fixture → Preview reservation → choose missing/unproven callback → Apply callback fixture. The simulated 0.50 reservation remains; starting a new fixture is not a payment retry.
6. **Landing Outcome Receipt → Pending payment / Payment layer.** Transaction reference unavailable; provisioning and check not evidenced; acceptance not recorded. Lifecycle selection and receipt selection refer to the same seeded record.
7. **Select report fields → download JSON.** Default contains no budget/expenses. Explicit selection adds only fictional reviewed fields and source metadata. Nothing uploaded; no client-login/share service.

## Actual Rust evidence, separately

Browser steps above do **not** execute Rust or NEAR. To reproduce authoritative local checks:

```powershell
npm.cmd test
npm.cmd run test:frontend
npm.cmd run test:preview-parity
wsl --distribution Ubuntu-24.04 --user runlatch --exec sh /mnt/c/Users/David/RunLatch/scripts/setup/test-contract-linux.sh
wsl --distribution Ubuntu-24.04 --user runlatch --exec sh /mnt/c/Users/David/RunLatch/scripts/setup/test-sandbox-linux.sh all
```

The WSL paths/user are this approved setup, not portable defaults. On an already prepared Linux checkout use `sh scripts/setup/test-contract-linux.sh` and `sh scripts/setup/test-sandbox-linux.sh all`; follow README and scripts/sandbox/README for native tool/artifact/fixture preparation. SDK tests mock host outcomes. Sandbox starts an isolated loopback NEAR runtime with ephemeral identities, performs real local native-transfer receipts, and checks adverse authorization, callback quarantine, resource/commitment invariants and agency outcomes. It is not public testnet.

Check `.local/projects/latest.json` for the actual generated project IDs; never invent one. `node scripts/workflow/export-project-local.ts <generated-project-id> --budget --expenses --evidence` → selected source-labelled canonical report. No signer, upload or public network is involved. Generated private/local artifacts remain ignored. Never publicly deploy the callback-fault WASM.

## 90–110 second recording script

| Time | Show | Say |
| --- | --- | --- |
| 0–12s | Hero, real scrolling budget partition | “RunLatch gives an AI studio's agent a project-bound purchasing mandate. This website is a credential-free browser fixture.” |
| 12–28s | Valid Gate preview, hash/trace | “The quote fixes the provider, recipient and terms. TypeScript explains eligibility; it does not authorize payment.” |
| 28–45s | Alter recipient, then Hidden term | “A changed hash is denied. A small first charge also fails if the full fixed-term commitment does not fit.” |
| 45–65s | Demo reservation and unknown callback fixture | “Unknown is not failed. The reservation remains held; there is no timer refund or blind resend.” |
| 65–85s | Linked pending receipt, payment/provider/acceptance layers | “Approval, payment, delivery evidence, objective checks and owner acceptance are separate facts. This example has no public transaction reference.” |
| 85–110s | Recorded actual LOCAL agency/contract test output; dated checkpoint | “The Rust contract on NEAR enforces the boundary. These SDK and isolated Sandbox results are local, not a deployed testnet or commercial provider. Source and reproduction commands make that distinction inspectable.” |

Run slow contract/Sandbox checks before recording, retain their exact logs and show them as recorded results, never fake an instantaneous run. Include browser fixture and terminal LOCAL labels in media. No personal data/keys/private client files in the frame. Local-only eligibility requires a human-published X **video**, not screenshots alone.

## Draft project description (not submitted)

RunLatch is project-bound purchasing authority and outcome accountability for AI-powered businesses. A Client Work Capsule gives an agent bounded authority for one client task. One Rust contract on NEAR loads provider-published canonical quotes and checks agent identity, current project revision, scope, duplicates, available funding and full recurring commitment before reserving a native transfer. Private callbacks distinguish confirmed settlement from unknown outcomes. Outcome Receipts separate payment, controlled provisioning fixtures, objective checks and explicit owner acceptance. The current UI is a credential-free browser simulation; authoritative contract and agency workflows are tested in an isolated LOCAL NEAR Sandbox. No public testnet deployment, commercial supplier integration, mainnet custody or security audit is claimed.

## Draft X text (human publishes only after approval)

> Give an AI agent a client job, not a blank cheque.
>
> Built RunLatch at NEAR HACKATHON: a Rust contract bounds project purchases, full commitments and settlement callbacks; receipts separate payment from delivery evidence.
>
> Demo: browser fixtures + isolated LOCAL NEAR Sandbox, not a public testnet deployment.
>
> @NEARProtocol #NEARHackathon

Before posting: attach reviewed video, add real approved public repo/demo links, check platform length, re-check every claim against final execution evidence. No placeholder links, invented accounts, partner claims or submission requestId. This draft is not posted.

## Remaining release checklist

- [ ] Human final UI review.
- [ ] Public repository approval, LICENSE/reuse/privacy/asset review and reproducible source publication by 14 November 2026 23:59 UTC; remain public through judging.
- [ ] If public testnet execution is desired: exact account/key/receiver/method/budget/network/signing consent, deploy default artifact only, independently observe receipts. Do not silently substitute owner signatures for restricted agent execution.
- [ ] Human eligibility/team/other-project disclosure/payout account/contact consent, collected only when needed and never in Git.
- [ ] Human-reviewed video and public X post with required wording/tags.
- [ ] Re-check live organizer rules/links/selected tracks. Security is primary; agents needs actual supported workflow; business remains conditional. No mandatory Intents/TEE/Chain Signatures.
- [ ] Exact submission payload approval, single saved requestId, uncertain-response check before retry; never submit examples or a duplicate entry.
