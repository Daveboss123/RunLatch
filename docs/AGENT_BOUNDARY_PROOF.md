# Agent boundary and approval — implementation proof

**9 November 2026.** This page maps the claim "an agent can buy inside one project boundary, but cannot grant itself authority" to actual Rust code and executed tests. It is not a security audit.

## 1. One small scripted agent

- **LOCAL Sandbox agency workflow:** `scripts/sandbox/src/agency_cases.rs` runs the same defined project task end to end: create project/capsule, register controlled providers, publish canonical quotes, submit a valid purchase, submit altered and over-commitment attempts, resolve the callback, record provisioning, run the fixed fixture check, record explicit human acceptance and build a read-only report. It is a scripted fixture agent, not an LLM.
- **Restricted testnet runner:** `scripts/near/restricted-testnet-runner.ts` is the one Node-only path prepared for a future approved testnet call. It requires an issued exact review and human confirmation, a process-injected restricted key, one `submit_purchase`, zero deposit, one send, no retry/resend and durable unknown-result markers.
- **Browser:** `/demo` and `/gate` remain TypeScript previews and imported LOCAL inspectors. They never sign, submit or move money.

No agent framework, autonomous planner or model-driven signing is added. A model may propose a purchase off-chain; Rust remains the only authority.

## 2. Rust enforcement map

| Boundary | Code | Test evidence |
| --- | --- | --- |
| Direct caller, signer and bound public key must equal the capsule agent | `contracts/runlatch/src/lib.rs` `submit_purchase` checks predecessor, signer and signer public key | `g02_proposed_wrong_identity_or_key_is_denied`, `g02_actual_submit_requires_exact_runtime_account_key_and_zero_deposit`, `g02_g13_actual_proxy_cannot_inherit_original_agent_signer` |
| Zero attached deposit for agent calls | Same function requires exactly 0 yoctoNEAR | `g02_actual_submit_requires_exact_runtime_account_key_and_zero_deposit` |
| Agent cannot be the owner or provider account | Capsule policy validation rejects role collapse and duplicate/empty scope | `c05_owner_or_provider_account_cannot_be_the_agent`, `c05_unknown_duplicate_and_empty_scope_cannot_activate`, `c05_bad_limits_and_expiry_are_rejected` |
| Agent cannot approve, reject, cancel or close | `approve_purchase`, `reject_purchase`, `cancel_purchase`, `close_capsule` call `assert_operator`; approval requires 1 yocto and the exact stored request hash | `a05_only_owner_deposit_capable_action_can_approve_reject_or_cancel`, `s05_refund_callback_and_close_cannot_be_called_by_agent` |
| Hard denial cannot be overridden | Approval re-evaluates current stored state and returns `DENIED` without reserving | `a09_hard_denial_cannot_be_overridden_by_exact_owner_hash` |
| Agent cannot record evidence or acceptance | `record_provisioning`, `record_task_check`, `record_human_acceptance` in `evidence.rs` call `assert_operator` and require 1 yocto | `p16_p18_agent_cannot_record_provisioning_task_check_or_human_acceptance` |
| Agent cannot forge a callback or refund | `resolve_purchase` and `resolve_owner_refund` are `#[private]` | `s05_external_caller_cannot_forge_callback_success` |
| Requests are unique and idempotent | Existing purchase key returns `REQUEST_REPLAY`; consumed quote and resource fingerprint block reuse | `g09_concurrent_pending_purchases_cannot_split_past_budget`, `p10_p11_fresh_quote_cannot_bypass_exact_resource_claim` |
| Current state is re-checked at authorization | `evaluate_stored` re-runs identity, project revision/status, capsule status/expiry, quote state, budget and commitment rules | `p02_only_owner_with_exact_revision_can_change_project_authority`, `p03_revision_invalidates_pending_approval_and_policy_stays_immutable` |
| Cancelled or stale project stops purchases | Project cancellation and revision checks block old authority | `p03_cancelled_project_blocks_old_purchase_and_cannot_reopen`, `p03_pending_transfer_settles_after_project_revocation` |
| No unrestricted `pay` or arbitrary recipient transfer | Only `authorize_request` schedules the canonical quote's recipient and amount | Rust source inspection; `s05` tests; contract test count |

## 3. Approval path

A purchase above the immutable policy threshold, or any recurring purchase, becomes `APPROVAL_PENDING`. It holds no money, quote capacity or resource claim. `approve_purchase`:

1. requires the operator account and exactly 1 yoctoNEAR;
2. requires the exact stored `request_id` and `expected_request_hash`;
3. rejects an expired approval window;
4. re-evaluates the current project, capsule, quote, budget and commitment state;
5. returns `DENIED` without reserving when a hard rule now fails;
6. only then records `approved_by` as the operator and atomically reserves before scheduling the transfer.

The browser shows this distinction but cannot approve or reserve. The public testnet sequence in [TESTNET_VERTICAL_SLICE_PLAN.md](TESTNET_VERTICAL_SLICE_PLAN.md) uses an auto-approved 0.05 NEAR purchase; exact-approval execution on public testnet is not part of that first sequence and is not claimed.

## 4. Reproduce

```powershell
wsl --distribution Ubuntu-24.04 --user runlatch --exec sh /mnt/c/Users/David/RunLatch/scripts/setup/test-contract-linux.sh
npm.cmd run test:near
npm.cmd run test:frontend
```

Observed 9 November 2026: 147 Rust tests pass, Clippy and format pass; 244 NEAR-path and 200 frontend Node tests pass. The LOCAL Sandbox agency workflow prints `AGENCY_WORKFLOW_CHECKS_PASSED` with `public_testnet:false`.

## 5. Limitations

- The restricted testnet runner has synthetic tests but no public execution.
- No public capsule, quote, restricted key, purchase, callback, provisioning, task check, acceptance or report exists.
- Imported LOCAL records are claims, not independent chain proof.
- Owner acceptance means the operator's recorded decision, not verified client satisfaction.
- No security audit, formal verification, light-client proof or production custody is claimed.
