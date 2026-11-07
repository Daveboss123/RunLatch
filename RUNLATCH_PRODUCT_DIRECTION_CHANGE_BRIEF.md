# RunLatch Product Direction Change Brief

**Document type:** Product strategy, product requirements, architecture guidance, MVP scope, and implementation handoff  
**Project:** RunLatch  
**Target environment:** NEAR Hackathon 2026, NEAR testnet  
**Status:** Proposed product direction to be integrated into the existing RunLatch project  
**Version:** 1.0  
**Date:** 7 November 2026  
**Primary audience:** OpenCode GPT-6.1 Sol acting as the autonomous engineering and product implementation agent

---

## 0. Instructions to the implementation agent

Read this entire document before changing the codebase.

This is a product-direction change for the **existing RunLatch project**. It is not a request to create a second project, start a fresh repository, or discard the existing technical foundation.

The current RunLatch blueprint and this document have different responsibilities:

- The existing `RUNLATCH_PROJECT_BLUEPRINT.md` remains the source for the original project constraints, NEAR requirements, technology preferences, detailed security foundations, visual direction, and any implementation details that do not conflict with this brief.
- This document updates the product positioning, primary customer, product model, purchase policy logic, outcome model, MVP priorities, and demo narrative.
- Where this document explicitly changes the product direction, follow this document.
- Where the original blueprint contains a technical or security constraint that is not changed here, preserve it.
- Hackathon rules and current official NEAR documentation take precedence over either project document if they conflict. Verify current requirements rather than assuming previously researched information is still current.

### 0.1 Work autonomously

You are authorised to inspect, plan, implement, test, debug, and improve the existing RunLatch project without requesting approval for ordinary engineering decisions. Do not stop for permission after every small task. Make reasonable decisions, document them, and continue.

Before implementation:

1. Inspect the existing repository, current branch, files, package manifests, contract structure, tests, and project documentation.
2. Read `AGENTS.md`, `BUILD_LOG.md`, `RUNLATCH_PROJECT_BLUEPRINT.md`, `PRODUCT.md`, `ARCHITECTURE.md`, `DESIGN.md`, `ACCEPTANCE_TESTS.md`, and `HACKATHON_COMPLIANCE.md` if present.
3. Identify what has actually been implemented and tested. Do not assume that a feature exists because an earlier plan described it.
4. Compare the current product and architecture against this brief.
5. Create a short change plan and update the existing product documents so that the repository has one coherent source of truth.
6. Continue into implementation according to the current project stage and the existing build sequence. Do not re-run a completed stage unnecessarily.

Maintain `BUILD_LOG.md` throughout. Record decisions, actual files changed, commands run, test results, unresolved problems, and the exact next step. Never mark a feature complete unless it has been verified.

### 0.2 Actions that still require explicit human approval

Do not do any of the following without explicit human approval:

- Publish or make a GitHub repository public.
- Deploy publicly or expose a public production endpoint.
- Make a mainnet deployment.
- Sign or submit a transaction involving real funds.
- Send real payments or interact with real customer funds.
- Publish posts, contact customers, or make public announcements.
- Submit the hackathon entry.
- Expose, commit, or transmit secrets, credentials, private customer information, or personal data.

Local development, testnet-only experimentation, test accounts, mock provider adapters, unit tests, contract tests, and local demo data are permitted within the project's existing safety constraints.

### 0.3 No fake capability claims

Never present a mock, simulated, locally generated, or manually seeded result as an on-chain event, real payment, external provider confirmation, or independently verified delivery.

Clearly label:

- Mock versus real provider integrations.
- Local simulation versus NEAR testnet execution.
- A payment request versus submitted transaction versus confirmed settlement.
- A provider response versus independently verified evidence.
- Automated task checks versus human acceptance.

If an integration is not available, implement a clearly labelled adapter or fixture for the demo and explain the limitation. Do not invent an integration or fabricate a confirmation.

---

# 1. Executive product decision

## 1.1 The new positioning

RunLatch should evolve from a generic AI-agent spending-control system into:

> **Outcome-bound purchasing and financial accountability for AI-powered businesses.**

The first customer segment should be small AI-native service businesses, especially software-development agencies, AI automation agencies, and digital/creative studios that use AI agents to complete paid client projects.

RunLatch lets these businesses delegate bounded purchasing authority to AI agents while ensuring that:

1. Every purchase is attached to a specific client project or internal work order.
2. Every purchase is authorised by a human-defined mandate.
3. The full financial commitment is considered, not just the amount charged today.
4. The vendor, recipient, quote, price, terms, and purpose are bound to the approval.
5. Duplicate, stale, over-budget, unauthorised, or altered requests are rejected or escalated.
6. Payment status is reconciled accurately.
7. Evidence of what was purchased and what was delivered is attached to the financial record.
8. The business can produce a clear project expense and outcome report for its owner or client.

The central promise is:

> **Give an AI agent a job, not a blank cheque.**

A slightly fuller product description:

> RunLatch gives AI-powered businesses a safe way to delegate purchasing to autonomous agents. Every purchase is tied to an authorised project, every financial commitment is bounded, and every expense leaves an auditable trail showing what was approved, what was paid, and what evidence exists that the expected resource or service was delivered.

## 1.2 What RunLatch is not

RunLatch is not primarily:

- A generic crypto wallet for AI agents.
- A wallet dashboard with arbitrary spending limits.
- A new payment network or consumer checkout product.
- A marketplace for software, cloud services, or suppliers.
- A general-purpose accounting or bookkeeping platform.
- A complete procurement suite for large enterprises.
- An AI agent framework or agent orchestration platform.
- A guarantee that an AI-produced deliverable is factually correct or commercially successful.
- A product that blindly authorises purchases because they fit a numerical budget.

RunLatch is a **project purchasing governance and evidence layer**. It connects delegated authority, project budgets, approved purchasing terms, settlement, and evidence of delivery.

## 1.3 Why this is a stronger direction

Generic agent spending limits are becoming common. Wallet providers, payment networks, agent-payment standards, corporate spending tools, and specialist projects are already addressing agent wallets, budget caps, merchant allowlists, transaction approvals, signed payment mandates, and receipts.

The product opportunity is not to claim that no one else can limit an agent's spending. The opportunity is to connect purchasing authority to the real work a business has promised to deliver.

A business owner needs to know more than whether an agent was allowed to spend $50. They need to know:

- Which client project required the purchase?
- Was that project still active when the agent made the request?
- Was the selected supplier and plan approved?
- Did the price or subscription terms change?
- Did another agent already buy the same thing?
- Does the purchase create future financial obligations?
- Did the payment settle?
- Was the service provisioned or the expected resource received?
- What can be shown to the client as evidence?

RunLatch should answer those questions with deterministic controls and inspectable records.

---

# 2. Initial customer and market focus

## 2.1 Beachhead customer

Focus first on **small AI-powered service businesses** that deliver work for external clients.

Examples:

- AI automation agencies.
- Small software-development agencies.
- Web and product studios.
- Digital and creative production studios.
- Independent technical consultants who use multiple AI agents.

A plausible initial profile is an owner-led business with a small human team, several active client projects, and multiple AI tools or agents performing research, development, procurement, deployment, marketing, or operations tasks. Treat company size as a working assumption, not a validated market fact.

This segment is useful because it has a recognisable buyer, repeated project-based purchases, client budgets, supplier bills, recurring SaaS costs, and a real need to explain expenditure.

## 2.2 Primary persona: owner/operator

The owner/operator:

- Sells a defined outcome to a client.
- Sets the client's project budget or internal cost allowance.
- Uses one or more AI agents to complete work.
- Wants agents to operate without asking permission for every low-risk purchase.
- Cannot accept uncontrolled spending, duplicate subscriptions, or hidden recurring commitments.
- Needs to maintain project margin.
- May need to show clients where project money went.
- Remains responsible when an agent makes a mistake.

Their main fear is not merely a single large transaction. It is losing control of a chain of small, plausible-looking decisions that accumulate into a client, financial, or reputational problem.

## 2.3 Secondary persona: project lead or human reviewer

This person:

- Defines the task and expected result.
- Reviews purchases that exceed policy or introduce new obligations.
- Can pause or cancel the project.
- Reviews unresolved, failed, or suspicious spending requests.
- Checks evidence and accepts or rejects delivery where appropriate.

## 2.4 Agent persona

An agent is an untrusted or partially trusted actor that can propose actions and request purchases within an assigned scope.

The agent may:

- Submit a purchase intent.
- Reference a project and task.
- Provide a reason and expected use.
- Select from approved vendors or registered quotes.
- Submit evidence returned by an external service.

The agent may not:

- Increase its own budget.
- Change its own permissions.
- Approve its own exception.
- Change a canonical quote after approval.
- Declare an external payment settled without settlement evidence.
- Declare a deliverable verified merely by asserting success.
- Reuse an expired, revoked, consumed, or already-settled authorisation.
- Circumvent parent or project-level limits by creating additional sub-agents.

## 2.5 Client persona

The client is initially a **report recipient**, not necessarily a RunLatch account holder.

The client may receive a read-only report containing:

- Approved project budget, if the agency chooses to share it.
- Project-related purchases.
- Supplier and purpose.
- Amount and payment status.
- Relevant receipts or evidence references.
- Provisioning and task-check status.
- Outstanding commitments or renewals.
- Remaining budget or an agreed cost summary.

Do not expose private operational data, wallet details, agent prompts, credentials, confidential vendor terms, or unrelated project records to clients.

## 2.6 Jobs to be done

When an AI agent needs a resource for a client project, the owner wants to authorise a bounded purchase without approving every minor action manually.

When a project changes or is cancelled, the owner wants outstanding purchase authority to become invalid before more money is committed.

When an agent chooses a subscription or usage-based service, the owner wants to understand the full expected commitment and not just the first charge.

When multiple agents work on one project, the owner wants them to share a coherent budget and avoid duplicating purchases.

When the work is finished, the owner wants a reliable record linking each expenditure to its authorisation, settlement, and evidence of delivery.

When the client asks what their money paid for, the owner wants to give a clear, defensible report without manually reconstructing everything from chat messages, email, receipts, and wallet history.

## 2.7 Explicitly deferred customer segments

Do not initially expand into:

- General consumer AI shopping.
- Large enterprise procurement and ERP replacement.
- Global corporate card management.
- All-purpose autonomous finance.
- Human household budgets.
- General-purpose agent-to-agent commerce.

These may become future markets, but they dilute the first use case and require different integrations, compliance, distribution, and support.

---

# 3. Core user problem and scenarios

RunLatch should be built around the following real-world scenarios. The MVP should demonstrate a small but coherent subset of them.

## 3.1 Purchase authorised, project cancelled

An agency authorises an agent to purchase infrastructure for a client website. The client cancels the project, but the agent still has the original instructions and attempts to purchase the resource.

Expected RunLatch behaviour:

- The project or capsule is paused, cancelled, expired, or revoked through an authorised state change.
- Outstanding purchase mandates are invalidated.
- A request referencing an old project revision is rejected.
- The rejection is recorded through the supported transaction/event path. Do not claim a rejected contract call leaves persistent on-chain state if the whole call reverts.

Important: a blockchain contract cannot automatically know that a client cancelled a project in an external conversation. A human owner or an explicitly trusted, authenticated integration must submit the cancellation or state change. Do not pretend that arbitrary WhatsApp, email, or agent text can safely revoke authority without verification.

## 3.2 $20 today hides a $240 annual commitment

An agent finds a service with a $20 introductory monthly charge but a 12-month minimum commitment.

Expected behaviour:

- The purchase intent contains billing cadence and minimum term.
- RunLatch computes the known financial commitment under the policy's declared calculation rules.
- If the commitment exceeds the remaining project authority, the request is rejected or escalated.
- The interface distinguishes the amount due now from the total known or maximum authorised commitment.

## 3.3 Duplicate purchases by separate agents

A development agent and a deployment agent independently request the same database or SaaS service.

Expected behaviour:

- Each agent's request is checked against the same project-level purchase and resource records.
- A deterministic duplicate key or canonical resource/vendor/plan comparison catches exact duplicate intents.
- A likely duplicate with materially different terms can be flagged for review rather than automatically treated as identical.
- Concurrent requests cannot both spend the same remaining budget due to non-atomic check-then-spend logic.

Do not rely only on an AI model to decide whether two purchases are duplicates. AI can suggest a match, but the enforcement decision must use deterministic identifiers and explicit policy.

## 3.4 Quote altered after approval

A supplier quote is approved at $50, but the agent submits a payment request for $65, changes the recipient, or switches the plan.

Expected behaviour:

- The approved quote is immutable or version-bound.
- The approval references a canonical quote hash or identifier and version.
- Any material change invalidates the previous approval and requires a new decision.
- The agent cannot substitute recipient, token, amount, cadence, term, or key contract terms at execution time.

## 3.5 Ambiguous payment failure and unsafe retry

An external payment provider times out. The agent does not know whether the payment was executed and tries again.

Expected behaviour:

- RunLatch records a payment attempt with a unique idempotency key.
- It distinguishes `submitted`, `pending`, `confirmed/settled`, `failed`, and `unknown/reconciliation_required` states as appropriate to the payment rail.
- A timeout does not automatically mean a payment failed.
- A second execution using the same intent/idempotency key is rejected or resolves to the existing attempt.
- Funds remain reserved until the system has sufficient evidence to settle, release, or manually reconcile them.

## 3.6 Agent requests a new recurring subscription

An agent wants to start a new monthly plan that automatically renews.

Expected behaviour:

- Recurring purchases are governed separately from one-time purchases.
- Default policy should require approval for a new recurring commitment unless a specific recurring category and maximum commitment were explicitly authorised.
- Renewal dates and cancellation constraints are recorded.
- A new plan, price increase, longer term, or changed renewal condition triggers re-evaluation.
- RunLatch must not imply that it can cancel a supplier subscription unless it has a verified provider integration that performs cancellation.

## 3.7 Payment succeeded, service not provisioned

The payment settles but the supplier fails to create the database or resource.

Expected behaviour:

- Payment settlement remains true if supported settlement evidence confirms it.
- Provisioning remains unverified or failed.
- The receipt shows the difference.
- A remediation state or follow-up task can be created.
- Do not release or erase a settled payment merely because provisioning failed.

## 3.8 Agent claims completion without sufficient evidence

An agent says a website is deployed, but no endpoint check, deployment event, or human acceptance exists.

Expected behaviour:

- Store the agent's assertion as an unverified claim if useful.
- Do not mark the outcome as independently verified.
- Apply predeclared, deterministic checks where possible.
- Show the level and source of evidence clearly.

---

# 4. Product model and core objects

Use this section to align naming and data structure across frontend, backend, and contract. Adapt names to the existing codebase if equivalent concepts already exist. Avoid redundant entities that do not improve the product.

## 4.1 Organisation

Represents the business using RunLatch.

Potential fields:

- Organisation ID.
- Owner/admin identity.
- Display name.
- Default currency or accounting denomination.
- Policy defaults.
- Created and updated timestamps.

The MVP may use a single demo organisation. Do not build a full multi-tenant enterprise account system unless required by the existing architecture.

## 4.2 Client

Represents the customer whose work is being delivered.

Potential fields:

- Client ID.
- Display name or non-sensitive label.
- Optional internal reference.
- Access/reporting permissions.

For the demo, use a fictional client and avoid personal data.

## 4.3 Project

Represents a defined client engagement or internal work order.

Required concepts:

- Project ID.
- Organisation ID.
- Client reference or internal project label.
- Project name.
- Status: draft, active, paused, cancelled, completed, archived.
- Budget allocation.
- Project revision/version.
- Start and expiry dates where relevant.
- Expected deliverable or outcome definition.
- Assigned agents or agent groups.
- Reporting visibility settings.

The project's state and revision are relevant to purchase authority. A request must not silently remain valid after a material project change.

## 4.4 Client Work Capsule

This is the core authorisation object. It evolves the original Run Capsule concept into a mandate tied to a specific unit of business work.

A capsule should contain or reference:

- Capsule ID.
- Organisation ID.
- Project ID.
- Project revision at creation or last authorisation.
- Human owner/authoriser.
- Assigned agent or permitted agent group.
- Defined task/purpose.
- Expected outcome or acceptance criteria.
- Start time and expiry time.
- Status: draft, active, paused, revoked, expired, completed.
- Allocated budget.
- Permitted vendor categories or explicit vendor allowlist.
- Permitted vendor IDs where available.
- Permitted purchase categories.
- Allowed payment assets/currencies.
- Single-purchase maximum.
- Total commitment ceiling.
- Recurring purchase policy.
- Price variance threshold, if supported.
- Required approval conditions.
- Maximum child allocation, if hierarchical budgets are implemented.
- Policy version/hash.

A capsule should have one clear job or bounded group of closely related tasks. Do not make one capsule an unlimited authority for an entire business.

## 4.5 Agent identity and delegation

Every purchase request must identify the agent or authorised principal submitting it.

The agent's ability to request purchases is separate from its ability to approve or execute them. An agent must not be able to grant itself permissions.

If agents can create child agents:

- The parent must explicitly be allowed to delegate.
- Child authority must be no broader than parent authority.
- Child budget allocation must be within the parent allocation.
- Parent revocation must invalidate relevant child authority.
- Parent and child purchases must count towards the correct shared project totals.

Hierarchical delegation is a design target, but the first MVP may use one or two named demo agents sharing a single capsule budget rather than a general multi-agent delegation marketplace.

## 4.6 Vendor

Represents an approved supplier or service provider.

Potential fields:

- Vendor ID.
- Canonical vendor name.
- Verified recipient or payout destination.
- Vendor category.
- Supported payment methods/assets.
- Integration type and evidence capabilities.
- Trust/verification status.

Do not treat a free-text vendor name supplied by an agent as proof of vendor identity.

## 4.7 Canonical quote

Represents the immutable commercial terms against which a purchase is authorised.

At minimum, bind:

- Quote ID and version.
- Vendor ID.
- Payee/recipient identifier.
- Product/service/plan identifier.
- Description and purchase purpose.
- Amount due now.
- Currency or token.
- Fees, taxes, and known additional charges.
- Billing cadence.
- Minimum contract term.
- Renewal and auto-renew conditions.
- Cancellation terms or known cancellation restrictions.
- Usage-based pricing terms, including an authorised usage ceiling if applicable.
- Total known commitment or maximum authorised commitment.
- Quote expiry.
- Source/evidence reference.
- Canonical quote hash.

A quote should be registered by a trusted application flow, human approval flow, or authenticated provider integration. An agent-submitted quote is not canonical merely because the agent says it came from a supplier.

## 4.8 Purchase intent

A purchase intent is a request to spend under a capsule.

It should reference:

- Intent ID.
- Capsule ID.
- Project ID and project revision.
- Agent identity.
- Canonical quote ID and version/hash.
- Idempotency key.
- Resource/purchase fingerprint for duplicate checks.
- Amount due now.
- Total commitment or maximum exposure.
- Purpose/reason.
- Timestamp.
- Supporting metadata/evidence reference.

All security-critical fields must be validated by deterministic policy, not trusted because they appear in the agent's explanation.

## 4.9 Reservation

Represents funds reserved for an approved purchase while payment is pending or being executed.

Reservation must be created atomically with the relevant authorisation decision where the contract/payment architecture supports it.

The system must be able to distinguish:

- Allocation.
- Amount spent/settled.
- Amount reserved for pending payment.
- Outstanding future financial commitment.
- Available authority to approve a new purchase.

Do not conflate a future contractual commitment with an immediate payment reservation. These are related but different balances.

## 4.10 Payment attempt and settlement

Record each execution attempt separately from the purchase intent.

Potential statuses:

- `not_submitted`
- `submitted`
- `pending`
- `confirmed` / `settled`
- `failed`
- `unknown`
- `reconciliation_required`

Use the payment rail's actual semantics. Do not assume all providers have identical finality or callback guarantees.

## 4.11 Evidence item

Represents evidence supporting a status or outcome.

Potential fields:

- Evidence ID.
- Related project/capsule/intent/receipt.
- Evidence type.
- Source identity.
- Source trust class.
- Timestamp.
- Content hash.
- Off-chain storage reference, if needed.
- Verification method.
- Verification status.

Keep private data and large files off-chain. Store only the minimum required reference/hash on-chain, subject to privacy and hackathon requirements.

## 4.12 Outcome Receipt

Represents the auditable lifecycle of a project-related expense and its associated result.

It should link:

- Project and capsule.
- Human authorisation.
- Agent identity.
- Canonical quote.
- Purchase intent.
- Policy decision.
- Reservation.
- Payment attempt and settlement evidence.
- Provisioning/receipt evidence.
- Objective validation checks.
- Human acceptance or rejection, if used.
- Future obligations/renewals.
- Final status and timestamps.

The receipt must make clear what is proved, what is merely asserted, and what remains unknown.

---

# 5. Financial commitment and budget logic

This is one of the most important changes. RunLatch must not equate a payment's initial charge with the complete financial obligation.

## 5.1 Preserve the original money invariant

Preserve the existing budget invariant wherever applicable:

`available = allocated - spent - reserved`

Use integer amounts in the smallest supported unit. Never use floating-point arithmetic for money.

The invariant continues to describe the immediately available amount under the selected accounting model. However, the product must introduce a separate measure for future commitments so that an annual contract is not treated as a $20 purchase merely because $20 is charged today.

## 5.2 Separate the financial measures

At minimum, distinguish:

- `allocated`: budget authority assigned to the capsule/project.
- `spent`: confirmed settled spend counted against the budget.
- `reserved`: funds reserved for approved transactions that are not yet resolved.
- `available_now`: authority still available for new immediate spend under the existing invariant.
- `committed_future`: known or authorised future obligations not yet charged.
- `available_to_commit`: remaining authority after accounting for immediate use and future commitments under the defined commitment policy.

A candidate model is:

`available_now = allocated - spent - reserved`

`available_to_commit = allocated - spent - reserved - committed_future`

This is a policy model, not permission to double-subtract the same amount. Define exactly whether the current reservation represents the first payment only or the whole known contract obligation. Store the initial payment and future commitment separately.

The UI must explain which balance it displays. Do not label `available_now` as the complete remaining project commitment authority if future commitments exist.

## 5.3 One-time purchases

For a one-time purchase:

`total_commitment = amount_due_now + mandatory_fees + known_taxes + mandatory_additional_charges`

If some charges cannot be determined, the policy must either:

- Require an explicit maximum exposure/cap; or
- Escalate for human approval; or
- Reject the request when the uncertainty violates policy.

Do not silently assume unknown fees are zero.

## 5.4 Fixed recurring subscriptions

For a subscription with a fixed charge and known minimum term:

`known_minimum_commitment = recurring_charge * required_periods + mandatory_setup_fees + known_mandatory_charges`

Use the exact billing-period count and any introductory price changes. Account for annual prepayment, minimum term, taxes, setup fees, and required add-ons where known.

Example:

- $20 per month.
- 12-month minimum term.
- No setup fee.
- Amount due today: $20.
- Known minimum commitment: $240.

The system must show both $20 due today and $240 known minimum commitment.

## 5.5 Indefinite recurring subscriptions

An indefinite auto-renewing subscription does not have a finite lifetime commitment unless the contract or user policy defines a maximum horizon or cancellation event.

Do not claim to calculate its full lifetime cost.

Instead:

- Record the billing cadence.
- Record auto-renew status.
- Record cancellation requirements and known notice period.
- Apply a maximum authorised commitment horizon, such as a user-defined number of billing periods, if supported.
- Define whether the policy permits the subscription at all.
- Require approval if the commitment cannot be bounded adequately.

The product must distinguish `known_minimum_commitment`, `authorised_commitment_cap`, and `unbounded_or_unknown_future_exposure` where relevant.

## 5.6 Usage-based pricing

For variable usage-based products:

- Record the billing unit and rate if known.
- Require a maximum authorised spend or usage quantity.
- Treat the configured cap as a hard policy boundary where enforcement is possible.
- Reconcile provider-reported usage against the cap.
- Escalate if the provider cannot enforce a maximum and the exposure is material.

Do not assume an AI agent can forecast usage reliably enough to replace a hard cap.

## 5.7 Recurring-purchase default policy

Default policy for the MVP:

- A new recurring commitment requires human approval unless an explicit capsule policy permits that category, vendor, cadence, term, and maximum exposure.
- A plan change requires re-evaluation.
- A price increase requires re-evaluation if it exceeds the authorised tolerance.
- A renewal must be represented as a new commitment event or explicitly pre-authorised recurring schedule. Do not treat the first approval as blanket authority for arbitrary future charges.
- The app must not claim it can cancel the subscription unless a real authenticated cancellation integration exists.

## 5.8 Multi-currency and token handling

For the MVP, minimise complexity. Use one clearly defined settlement asset and accounting denomination unless the existing implementation already has a safe and tested multi-asset design.

If multiple currencies/assets are supported:

- Define the conversion source and timestamp.
- Define the maximum permitted FX or price variance.
- Prevent agents from substituting an asset after approval.
- Record both original denomination and settlement denomination.
- Avoid presenting a volatile token value as a guaranteed fiat value.

Never use floating-point arithmetic for on-chain monetary values.

---

# 6. Deterministic purchase authorisation

RunLatch's core value depends on deterministic enforcement. An LLM may help create a purchase proposal or explain a decision, but it must not have final authority to approve its own spending.

## 6.1 Required policy evaluation sequence

A purchase request should pass through checks in a clear, documented order. The exact order may be adapted to the existing contract, but all required controls must be enforced.

1. **Identity:** Is the requesting agent/principal authorised for this capsule?
2. **Organisation/project:** Does the request belong to the correct organisation and active project?
3. **Capsule state:** Is the capsule active, not paused, revoked, expired, or completed?
4. **Revision freshness:** Does the request reference the currently authorised project/capsule/policy revision?
5. **Time validity:** Is the request within the allowed time window, and is the quote still valid?
6. **Replay/idempotency:** Has this intent or payment attempt already been consumed, submitted, or settled?
7. **Canonical quote:** Does the request reference a known, valid, approved quote version/hash?
8. **Vendor and recipient:** Does the supplier identity and payee match the canonical quote and allowlist?
9. **Purpose/category:** Is this purchase category allowed for the capsule and relevant to its defined purpose?
10. **Price and asset:** Do amount, denomination, token, and price tolerance match the authorised terms?
11. **Commitment terms:** Is the one-time, recurring, minimum-term, and maximum-exposure commitment permitted?
12. **Duplicate/resource check:** Is there an existing purchase or active reservation for the same resource/plan within the relevant project scope?
13. **Budget:** Does the request fit within immediate spend and commitment authority?
14. **Approval condition:** Does it qualify for autonomous execution, or does it require human approval?
15. **Atomic reservation:** If approved, reserve the appropriate amount atomically before payment execution.

A request that fails a hard rule must not reach the payment execution path.

## 6.2 Hard denial versus human approval

Use three decision outcomes:

- `allow`: All mandatory policy checks pass and the request is within pre-authorised autonomy.
- `require_approval`: The request is potentially legitimate but exceeds an autonomy threshold or introduces a new risk/commitment that a human must review.
- `deny`: A hard policy rule fails, such as revoked authority, invalid quote binding, unapproved recipient, expired mandate, replay, or insufficient budget.

Do not convert hard security failures into a soft approval prompt. An agent should not be able to persuade a human through generated text to override a non-overridable control without an explicit, separate human policy change.

If a human approves an exception, the exception must be explicit, scoped, time-bound, and recorded. It must not silently modify the base policy.

## 6.3 Project and capsule freshness

Add a version/revision concept.

A purchase intent must reference the project and capsule revision under which it was created or approved.

Material changes should increment the revision or invalidate affected mandates. Material changes include:

- Project cancelled or paused.
- Project scope changed materially.
- Budget reduced.
- Allowed vendors/categories changed.
- Capsule revoked or expiry shortened.
- Expected deliverable or purchasing purpose changed materially.
- Client work order withdrawn.

An old request referencing a stale revision must be rejected.

Do not rely on a model's assessment of whether a project is still active. Use explicit state and version checks.

## 6.4 Duplicate purchase protection

Implement deterministic duplicate protection at a level appropriate to the MVP.

Use:

- Unique intent IDs.
- Idempotency keys for execution attempts.
- Canonical quote IDs/versions.
- A resource or purchase fingerprint derived from stable identifiers such as vendor, product/plan, project, and relevant resource identity.
- Active reservations and completed purchase records.

Exact duplicates should be rejected or resolved to the existing intent. Similar but materially different purchases can be flagged for review.

Do not depend solely on fuzzy AI classification. If semantic similarity is used to warn about possible duplicates, it must be labelled as advisory and must not replace deterministic checks.

## 6.5 Concurrency and atomicity

A shared budget must not be vulnerable to concurrent requests.

The implementation must prove, through tests, that two simultaneous or back-to-back requests cannot each pass based on the same stale balance and cause total commitments to exceed the allocation.

Where state changes occur on NEAR, use contract state transitions and atomic checks appropriate to NEAR's execution model. Where off-chain coordination is used, the contract remains the final enforcement boundary for protected funds and state.

## 6.6 Parent and child budgets

Future-proof the data model for hierarchical budgets:

- Organisation allocation.
- Project allocation.
- Capsule allocation.
- Optional agent/child-capsule sub-allocation.

For the initial MVP, one project-level budget shared by assigned agents may be sufficient. Implement general recursive delegation only if the current architecture already supports it safely and it does not endanger the deadline.

If child budgets are implemented, total child allocations and spend must never exceed parent authority. A child cannot increase parent allocation. Revoking the parent must invalidate dependent authority.

---

# 7. Payment, reservation, and reconciliation lifecycle

The payment lifecycle must remain honest and safe.

## 7.1 Required conceptual lifecycle

A typical purchase should follow:

`intent_created -> policy_evaluated -> approved -> reserved -> submitted -> pending -> settled`

Alternative outcomes include:

- `denied`
- `approval_required`
- `submission_failed`
- `settlement_failed`
- `unknown`
- `reconciliation_required`
- `cancelled_before_submission`
- `reservation_released`

Adapt the exact state names to the actual payment architecture. Document transition rules.

## 7.2 Reservation rules

- Reserve before scheduling or executing the payment where the architecture permits.
- The reservation must bind to the approved intent and canonical quote.
- An agent cannot change the reserved amount, recipient, asset, or quote after reservation.
- Release a reservation only after reliable evidence that payment was not and cannot still be executed, or after an authorised cancellation path.
- A timeout or missing callback is not proof of failure.
- Do not allow a second payment attempt to consume the same intent without a defined, safe retry procedure.

## 7.3 Asynchronous settlement

If settlement is asynchronous:

- Track pending state.
- Verify callbacks or settlement events from the supported payment rail.
- Authenticate any off-chain relayer/provider messages.
- Use idempotent settlement handling.
- Record transaction identifiers and finality evidence.
- Reconcile unknown outcomes before releasing reserves.

Do not mark payment as settled because a frontend button was clicked or because an agent says the transfer succeeded.

## 7.4 NEAR-specific constraints

Follow the existing blueprint and current NEAR documentation. Use the narrowest supported contract design that can be tested reliably for the hackathon.

Preserve these rules:

- Do not claim mainnet functionality when only testnet is implemented.
- Do not describe gas allowance as the purchase budget. Gas allowance is for execution fees; the contract's purchase policy enforces purchase spending.
- A failed/panicking contract call generally rolls back its state changes. Do not claim that an on-chain denial receipt was persisted from a reverted call. Use an off-chain attempted-event log or a separately successful record path if the product needs to record rejected attempts.
- Do not assume an external payment is synchronously settled merely because an on-chain request was accepted.
- Do not assume a contract can revoke a payment that has already been scheduled or irreversibly executed.
- Do not use NEAR Intents, Chain Signatures, TEE, or other deferred infrastructure merely to make the project appear more advanced. Reintroduce them only if current hackathon rules permit them and there is a concrete product requirement.

---

# 8. Delivery evidence and Outcome Receipts

This is a major differentiator. It must be implemented carefully so the product does not overclaim what it knows.

## 8.1 Separate the lifecycle states

At minimum, distinguish:

1. **Requested:** An agent proposed a purchase.
2. **Authorised:** Deterministic rules and, where required, human approval permitted it.
3. **Reserved:** Funds/authority were reserved.
4. **Submitted:** A payment transaction was submitted.
5. **Settled:** Reliable settlement evidence confirms the payment completed.
6. **Provisioned/received:** Evidence indicates the purchased resource or service was provisioned or received.
7. **Task checked:** A predeclared objective check passed or failed.
8. **Human accepted:** A human reviewer accepted the result, if the workflow requires it.

These states are not interchangeable. Payment settlement does not prove provisioning. Provisioning does not prove the whole client project succeeded. A task check does not necessarily prove subjective quality.

## 8.2 Evidence trust levels

Use explicit evidence categories. Suggested model:

- `agent_assertion`: statement made by the agent; unverified.
- `application_observation`: observed by RunLatch or the app; verification scope must be described.
- `provider_signed_event`: authenticated provider event/webhook or signed response.
- `on_chain_settlement`: verified transaction/contract evidence on the relevant network.
- `objective_test`: a reproducible check against a predefined criterion.
- `human_acceptance`: explicit decision by an authorised human.

Do not treat every evidence type as equally strong. Show its source and verification method.

## 8.3 Objective task checks

A capsule may define a small set of objective checks before work begins.

Examples for a website deployment:

- Approved deployment URL responds.
- HTTPS is active.
- Expected health-check endpoint returns the configured success response.
- Required route is reachable.
- Database connection test succeeds.
- A test record can be created and retrieved.

The result must include:

- Which check ran.
- Expected condition.
- Observed result.
- Timestamp.
- Tool or evidence source.
- Pass/fail/error status.
- Any known limitations.

A test that passes proves only that the stated test passed at that time. It does not prove the whole product is secure, bug-free, or satisfactory to the client.

## 8.4 Human acceptance

Some deliverables are subjective or require client judgement. A human acceptance state may be recorded, but it must be an explicit action by an authorised reviewer.

Do not allow an agent to impersonate a human reviewer or set this state through an ordinary agent request.

## 8.5 Outcome Receipt schema

A receipt should include or link to:

- Receipt ID.
- Organisation and project IDs.
- Capsule ID and revision.
- Human authoriser.
- Agent identity.
- Purchase purpose.
- Canonical vendor and quote reference/hash.
- Amount due now.
- Total known/minimum/maximum authorised commitment and the meaning of that value.
- Currency/asset.
- Policy decision and policy version.
- Approval timestamp.
- Reservation reference.
- Payment attempt ID.
- Settlement status and transaction reference.
- Provisioning/receipt evidence references.
- Objective task-check results.
- Human acceptance status, if required.
- Future renewal/obligation information.
- Created/updated timestamps.
- Evidence integrity hashes where appropriate.

Keep large documents, invoices, personal information, credentials, and sensitive project artefacts off-chain. Use hashes and access-controlled references when an integrity anchor is useful.

## 8.6 Example receipt language

Good:

- "Payment settled on NEAR testnet."
- "Provider event confirms the database instance was created."
- "The configured health-check endpoint returned HTTP 200 at 14:03 UTC."
- "Human reviewer accepted the deployment on 7 November 2026."

Bad:

- "The project was successful" when only payment settled.
- "Delivery independently verified" when an agent merely asserted completion.
- "Client received value" without evidence or client acceptance.
- "Payment completed" when a transaction is only pending.

---

# 9. Client-facing Project Expense and Outcome Report

A client-facing report is a key product surface, but it must be read-only and permission-controlled for the MVP.

## 9.1 Report purpose

Help an agency owner explain how an approved project budget was used and what evidence exists for the purchases.

The report should reduce the need to reconstruct project expenditure from chat messages, agent logs, wallet explorers, receipts, and spreadsheets.

## 9.2 Report contents

Include:

- Project name and reporting period.
- Approved project/capsule budget, if shareable.
- Total settled spend.
- Pending reservations.
- Known future commitments.
- Remaining available amount, with calculation explained.
- Expense list.
- Purchase purpose.
- Vendor and plan.
- Amount due now and total commitment.
- Payment status.
- Provisioning/delivery evidence status.
- Task validation results.
- Exceptions, rejected requests, or unresolved issues where the owner chooses to disclose them.
- Receipt IDs and transaction references where safe.

Do not expose:

- Agent system prompts or private reasoning.
- API keys or secrets.
- Private wallet keys.
- Unrelated project data.
- Personal information that is not necessary for the report.
- Internal fraud/security detection details that would create risk.

## 9.3 Report integrity

The client report must be generated from the canonical RunLatch records, not from an LLM summary of arbitrary logs.

An LLM may generate a readable narrative from structured verified data, but totals, statuses, transaction IDs, vendor identities, and evidence status must come from the underlying records. The summary must not change or invent facts.

## 9.4 MVP presentation

A polished in-app report page or exportable demo report is sufficient. Do not build a full invoicing, accounting, or customer portal system for the hackathon.

---

# 10. User experience and interface direction

Preserve the existing visual system in the RunLatch blueprint, including the Roster Finance-inspired quality bar and the dithercn design direction. This product change is not permission to discard the established design concept or copy another project's branding.

## 10.1 Product information architecture

Prefer a simple navigation model such as:

- **Overview:** active projects, total budget, current spend, reserved funds, upcoming commitments, unresolved approvals, and alerts.
- **Projects:** list of client/internal projects and their budget state.
- **Project detail:** work capsules, agents, purchases, budget, and outcome status.
- **Approvals:** requests requiring human review.
- **Purchases:** quote, intent, payment, and settlement lifecycle.
- **Outcome Receipts:** inspectable purchase-to-delivery records.
- **Replay Lab:** security and adversarial test scenarios for the demo.
- **Settings/Policy:** vendor allowlists, spending rules, agent permissions, and organisation policy.

Do not create all of these as separate complex modules if the existing product can present the main workflow more clearly with fewer pages.

## 10.2 Overview screen

The overview must answer immediately:

- How much authority has been allocated?
- How much has settled?
- How much is reserved?
- What future commitments exist?
- Which projects are active?
- What needs human approval?
- Are any payments or outcomes unresolved?

Use clear labels and explanatory tooltips for `spent`, `reserved`, `committed future`, and `available`. Do not put multiple different balances under a vague label such as "remaining".

## 10.3 Project detail screen

Show:

- Project title and status.
- Client label.
- Expected outcome.
- Project budget and financial breakdown.
- Active capsules and assigned agents.
- Permitted supplier/category policy.
- Purchase timeline.
- Future obligations.
- Outstanding approval requests.
- Evidence and receipt status.

## 10.4 Purchase decision screen

Before a user approves an exceptional purchase, show:

- What the agent wants to buy.
- Why it says the purchase is necessary.
- Which project and capsule will pay.
- Canonical vendor and recipient.
- Amount due today.
- Full known/minimum commitment.
- Billing cadence and term.
- Auto-renew and cancellation conditions.
- Effect on immediate available budget.
- Effect on future commitment authority.
- Whether the purchase may duplicate an existing resource.
- Which rules passed and which rule requires approval.

The UI must not hide important recurring or future costs below the fold.

## 10.5 Receipt and report screen

Show a clear lifecycle rather than a generic success tick:

`authorised -> reserved -> submitted -> settled -> provisioned -> task checked -> human accepted`

Only display states supported by evidence. Allow a reviewer to inspect the source of each status.

## 10.6 Dither visual identity

Preserve the established RunLatch palette and visual approach in the existing blueprint:

- Paper: `#F7F7F2`
- Ink: `#171916`
- Muted: `#686D65`
- Lime: `#C6F36B`

Dithering should remain a recognisable visual signature, not a substitute for information hierarchy.

Use it in:

- The hero/signature visual.
- Project budget or resource-allocation visualisation.
- Purchase-to-outcome flow or section transitions.
- Restrained secondary dashboard accents.

Keep amounts, policy decisions, IDs, statuses, transaction references, and evidence labels crisp and readable. Provide reduced-motion and non-WebGL/static fallbacks. Do not make critical information depend on animated effects.

Retain the Roster Finance reference for hierarchy, pacing, interaction quality, and clear explanation of financial mechanisms. Do not copy its logo, text, branding, images, or layout verbatim.

---

# 11. MVP scope for the NEAR Hackathon

The project must be buildable and demonstrable within the existing development window. Prioritise one complete vertical slice over many partial features.

## 11.1 Core MVP story

A small AI development agency gives an agent permission to complete a website deployment for a fictional client. The project has a $300 budget. The agent requests a $50 database purchase. RunLatch verifies the quote and commitment terms, checks project/capsule authority, reserves the relevant amount, and executes a supported NEAR testnet flow. It records settlement and a provider/provisioning or clearly labelled demo evidence event. A project report shows the expense and what has actually been verified.

The demo must include both a valid purchase and at least two adversarial attempts.

## 11.2 Must-have functionality

### Product and project model

- Create one demo organisation.
- Create at least one fictional client project.
- Define a project budget and status.
- Create a Client Work Capsule tied to that project.
- Define a task and objective outcome check.
- Assign one or more demo agents.

### Authorisation and quote binding

- Register a canonical vendor and quote.
- Bind quote identity, recipient, price, asset, and terms.
- Create a purchase intent.
- Enforce agent/capsule/project authority.
- Reject stale, expired, revoked, altered, replayed, or over-budget requests.
- Distinguish immediate price from full known commitment.
- Require human approval for a new recurring commitment unless specifically allowed.

### Financial safety

- Preserve the budget invariant.
- Reserve funds before execution.
- Protect against duplicate execution.
- Handle pending/settled/failed/unknown states accurately.
- Do not release reservations prematurely.
- Ensure concurrent requests cannot overspend the shared budget.

### Evidence and reporting

- Record payment status and supported settlement evidence.
- Record a provider/provisioning event or clearly labelled fixture.
- Run at least one objective task check.
- Generate an Outcome Receipt.
- Show a project expense/outcome report.

### NEAR integration

- Use NEAR testnet only for the hackathon demonstration.
- Clearly show testnet environment and transaction references.
- Keep local simulation distinct from real testnet operations.
- Do not claim real supplier payment if the implementation only performs a testnet transfer or mock adapter flow.

## 11.3 Should-have functionality if time allows

- Multiple agents sharing one project-level budget.
- Basic project pause/revoke control.
- Duplicate resource warning based on deterministic identifiers.
- One subscription/recurring-cost scenario.
- One client-facing read-only report view.
- Downloadable or shareable structured receipt.
- Event timeline and clear policy evaluation explanation.

## 11.4 Defer from MVP

Do not let these distract from the vertical slice:

- Full vendor discovery marketplace.
- Full SaaS subscription management and automatic cancellation.
- Real integrations with many supplier APIs.
- Universal invoice OCR and accounting integrations.
- Full ERP or corporate card replacement.
- Multi-chain payment execution.
- Mainnet funds or real customer money.
- Arbitrary cross-chain agent payments.
- Generic autonomous investment or treasury management.
- Complex DAO governance.
- Recursive agent delegation at unlimited depth.
- Unverified claims of AI quality scoring or project success.

## 11.5 Demo data

Use fictional, internally consistent data:

- Organisation: Northstar Studio (or another clearly fictional agency).
- Client: ACME Demo Client.
- Project: Automated Booking Website.
- Project/capsule budget: $300 equivalent, represented safely in the selected test asset/accounting model.
- Database purchase: $50 one-time demo quote.
- Hosting purchase: optional $20 one-time quote.
- Subscription attack: $20 monthly with a 12-month minimum commitment ($240 known minimum commitment).
- Unapproved vendor attack: a different recipient or vendor ID.
- Altered quote attack: approved $50 quote changed to $65.
- Replay attack: submit the same purchase intent/payment idempotency key twice.
- Project cancellation attack: revoke or increment project revision, then submit a request tied to the old revision.

Do not imply that these vendors are real or that external infrastructure was actually provisioned unless a genuine integration confirms it.

---

# 12. Demo walkthrough and story

A good judge should understand the business problem before seeing the smart contract.

## 12.1 Opening problem statement

"Small AI-powered agencies increasingly delegate real work to autonomous agents. Those agents may need to purchase hosting, databases, API capacity, and software to complete a client project. A simple wallet limit cannot answer whether the purchase belongs to the project, whether the subscription creates hidden future costs, whether another agent already bought the same thing, or whether the client actually received the resource. RunLatch ties every purchase to an authorised project and records the evidence from approval through delivery."

## 12.2 Walkthrough

1. Open the RunLatch overview and show the fictional agency's project budget and outstanding obligations.
2. Open the client project and show its expected outcome and active Client Work Capsule.
3. Show the capsule's assigned agent, allowed purchase categories, budget, expiry, and recurring-purchase policy.
4. Have the agent request a $50 database purchase using a registered canonical quote.
5. Show deterministic checks: correct agent, active project, current revision, valid quote, correct vendor/recipient, acceptable commitment, no duplicate, sufficient budget.
6. Reserve the funds and execute the supported NEAR testnet flow.
7. Show the correct payment state and testnet transaction reference. Label any provider-side step as simulated if it is a fixture.
8. Record provisioning evidence and run the predeclared database/endpoint check.
9. Open the Outcome Receipt and distinguish settlement evidence from provisioning evidence and task-check results.
10. Open the project report and show the purchase, cost, commitment, evidence, and remaining budget.
11. Run the adversarial scenarios.

## 12.3 Adversarial demonstrations

At least two must work reliably:

**Scenario A: altered price**

- Approve a registered quote for $50.
- Attempt execution using $65 or a different recipient.
- Expected: hard rejection because the request no longer matches the canonical approved quote.

**Scenario B: recurring commitment hidden behind first payment**

- Submit a $20 monthly plan with a 12-month minimum commitment.
- Expected: the system recognises $240 known minimum commitment, not simply $20. With default recurring policy, it requires human approval or is denied if the policy does not allow the exposure.

**Scenario C: replay/double execution**

- Submit the same intent or payment attempt again.
- Expected: no second spend; return or reference the existing attempt or reject the replay.

**Scenario D: cancelled/stale project**

- Pause, cancel, revoke, or increment the project/capsule revision.
- Submit a request referencing the old revision.
- Expected: reject as stale or unauthorised.

**Scenario E: duplicate resource**

- Have two agents request the same vendor/plan/resource for the same project.
- Expected: exact duplicate rejected or flagged according to deterministic duplicate policy.

The demo should show readable explanations for rejection without exposing exploitable secrets.

---

# 13. Security, privacy, and trust requirements

## 13.1 Least privilege

- Agents receive only the authority needed for their task.
- Agent credentials/keys must not be able to modify policy or allocate themselves more funds.
- Keep human administrative actions separate from agent purchase actions.
- Use narrow function-call permissions where supported and safe.
- Gas allowance is not spending authority for purchased goods/services.

## 13.2 Prompt injection and untrusted content

Supplier pages, emails, documents, quotes, agent outputs, and external tool results are untrusted data.

A malicious supplier page or prompt must not be able to:

- Modify the capsule budget.
- Change the recipient.
- Override the allowlist.
- Change approval requirements.
- Change a quote after approval.
- Trigger a payment outside policy.

The deterministic authorisation layer must be outside the model's control.

## 13.3 Privacy

- Do not put customer personal data, secrets, API keys, invoice details, or full project documents on a public blockchain.
- Use fictional demo data.
- Store only necessary references/hashes on-chain.
- Apply access controls to client reports.
- Avoid logging secrets in errors or debug output.

## 13.4 Replay and re-entrancy/idempotency considerations

Follow NEAR and payment-provider security guidance relevant to the implemented contract and adapter. Use unique identifiers and state transitions that prevent repeated execution. Test all retry and callback edge cases.

## 13.5 Revocation limitations

Revoking an authorisation can prevent future actions that have not yet become irreversible. It cannot necessarily recall a payment already executed or an external transaction already scheduled. The interface must explain this limitation.

## 13.6 Evidence integrity

- Store hashes or authenticated identifiers for evidence where appropriate.
- Verify source signatures/events when available.
- Do not trust a client-provided or agent-provided status string as independent proof.
- Preserve source and timestamp.
- Make missing or unverified evidence visible.

## 13.7 Failure modes

Explicitly test:

- Contract failure before reservation.
- Payment submission timeout.
- Duplicate callback.
- Missing callback.
- Settlement confirmed after frontend timeout.
- Settlement failure.
- Provider says provisioned but later reports failure.
- Project revoked while a payment is pending.
- Quote expires while approval is being reviewed.
- Concurrent purchase requests.
- Agent attempts to change the recipient or token.
- Agent attempts to use an old policy revision.

---

# 14. Technical architecture guidance

Do not introduce unnecessary new infrastructure. Inspect the actual codebase and preserve compatible work.

## 14.1 On-chain responsibilities

The NEAR contract should enforce the minimum critical state and rules that need independent enforcement, potentially including:

- Capsule/project authorization state or references.
- Agent/principal permission checks.
- Budget allocation and spend/reservation accounting.
- Canonical quote binding or an integrity-verified quote reference.
- Intent uniqueness and replay protection.
- Expiry/revocation/version checks.
- Purchase approval and reservation state transitions.
- Settlement confirmation state where the chosen flow supports it.
- Minimal receipt/evidence commitments or hashes.

The final set must be derived from the existing contract design, NEAR constraints, and hackathon time. Do not put every large business object or private document on-chain.

## 14.2 Off-chain application responsibilities

The application can handle:

- Organisation/client/project UI.
- Agent orchestration and request intake.
- Quote registration workflows.
- Vendor metadata and integrations.
- Full commitment calculations where appropriate, with critical caps independently checked by contract or trusted policy service.
- Provider adapters and authenticated webhooks.
- Evidence storage and objective task checks.
- Client report rendering.
- Human review workflows.
- Readable explanations and summaries.

The application must not become a bypass around contract enforcement for protected funds or authorisations.

## 14.3 LLM responsibilities

An LLM may:

- Convert a natural-language task into a structured purchase proposal.
- Explain a policy result in plain language.
- Suggest vendor/plan alternatives from trusted registered data.
- Summarise structured receipts for a human.
- Identify possible duplicate resources for advisory review.

An LLM must not:

- Change financial authority.
- Override hard rules.
- Invent quote fields.
- Verify settlement without evidence.
- Independently approve its own purchase.
- Determine that an arbitrary deliverable is accepted.
- Write arbitrary on-chain state.

## 14.4 Interoperability and standards

Do not reinvent established mandate formats where an existing standard can be adopted sensibly. Review current versions of agent-payment and authorisation standards, especially Google's Agent Payments Protocol (AP2), relevant payment/network agent identity frameworks, and emerging agent identity/credential standards.

For the hackathon MVP, interoperability should not delay the core vertical slice. Keep a clean internal mandate model that could later map to external standards. Do not claim formal AP2 compatibility unless it is actually implemented and tested against the relevant specification.

## 14.5 Provider adapters

Use a clear adapter interface. Each adapter must declare:

- Whether it is mock, sandbox, or live.
- Supported payment flow.
- Whether it provides quote data.
- Whether it supports a maximum spend or usage cap.
- Whether it has recurring billing.
- Whether it can confirm provisioning.
- Whether it supports cancellation.
- How callbacks/signatures are verified.

For the demo, a mock provisioning adapter is acceptable if it is clearly labelled. Do not describe a fixture as a real provider integration.

---

# 15. Data, observability, and project intelligence

## 15.1 Project cost timeline

Provide a structured timeline of:

- Purchase requests.
- Approvals and denials.
- Reservations.
- Submitted transactions.
- Settlements.
- Releases/reconciliations.
- Provisioning events.
- Objective checks.
- Human acceptance.
- Renewals or future commitments.

Each event should have a timestamp and source.

## 15.2 Cost attribution

Every purchase must be attributed to exactly one project/capsule for the primary budget calculation, unless the product explicitly supports split allocations with deterministic arithmetic and tests.

Do not allow an agent to choose an unrelated project after payment.

## 15.3 Duplicate and waste insights

Potential future intelligence:

- Duplicate vendor/plan detection.
- Unused subscription warnings where reliable usage data exists.
- Unplanned recurring commitment alerts.
- Spend versus project progress.
- Project-level cost variance.
- Repeated failed purchase attempts.
- Stale purchase proposals.

For the MVP, implement only the minimum deterministic duplicate/commitment checks needed for the demo. Do not fabricate financial savings or claim the product optimises budgets without evidence.

## 15.4 No unsupported AI scoring

Avoid an opaque "agent trust score" or "project success score" in the MVP. Prefer transparent facts and policy outcomes. If a future risk score is introduced, explain its inputs, uncertainty, and limitations.

---

# 16. Acceptance criteria

The product direction is successfully implemented only when the following critical flows are demonstrated and tested.

## 16.1 Project and capsule

- [ ] A project can be created with a defined budget and task/outcome.
- [ ] A Client Work Capsule is tied to the project.
- [ ] The capsule includes expiry, permitted agent(s), purchase policy, and budget authority.
- [ ] Project/capsule state and revision can be changed by an authorised human.
- [ ] Agent requests tied to stale, revoked, paused, completed, or expired authority are rejected.

## 16.2 Purchase and quote

- [ ] An agent can submit a structured purchase intent.
- [ ] The intent references a canonical quote.
- [ ] Vendor/recipient/amount/asset/terms are bound to that quote.
- [ ] Material quote alterations invalidate the approval.
- [ ] Unknown or unbounded commitment is escalated or rejected according to policy.
- [ ] A $20 monthly subscription with a 12-month minimum term is recognised as a $240 known minimum commitment, excluding additional fees/taxes where applicable.
- [ ] A new recurring purchase requires approval unless explicitly permitted.

## 16.3 Budget and concurrency

- [ ] Integer arithmetic is used for money.
- [ ] Available, spent, reserved, and future commitment values are not conflated.
- [ ] Reservation happens before payment execution according to the flow.
- [ ] A failed or unknown payment does not cause unsafe release.
- [ ] Two concurrent requests cannot overrun the same budget.
- [ ] Duplicate intent/payment submissions cannot execute twice.

## 16.4 Evidence and receipt

- [ ] Payment status is not marked settled without supported settlement evidence.
- [ ] Provisioning is separate from settlement.
- [ ] Agent assertions are labelled unverified.
- [ ] An objective check can be recorded with its exact scope and result.
- [ ] Outcome Receipt links the authorisation, quote, payment, and evidence.
- [ ] The receipt does not overclaim end-to-end success.

## 16.5 Reporting and interface

- [ ] Project overview shows budget, spent, reserved, future commitments, and available values clearly.
- [ ] Purchase review shows amount due now and total known commitment.
- [ ] User can understand why a request was allowed, denied, or escalated.
- [ ] Client/project report is read-only and permission-controlled.
- [ ] The UI clearly labels mock/simulated versus NEAR testnet actions.
- [ ] Existing RunLatch design direction and accessibility requirements remain intact.

## 16.6 Security and hackathon readiness

- [ ] Tests cover altered quote, replay, stale authority, revoked capsule, over-budget, duplicate purchase, recurring commitment, and ambiguous settlement.
- [ ] No secrets are committed.
- [ ] No mainnet or real-funds claim is made.
- [ ] Official hackathon requirements are rechecked and documented.
- [ ] The complete demo can be performed repeatedly without manual database edits or hidden state changes.

---

# 17. Required test matrix

Implement unit, integration, contract, and end-to-end tests appropriate to the existing stack.

| Test | Setup | Expected result |
|---|---|---|
| Valid one-time purchase | Active capsule, current project revision, canonical $50 quote, sufficient authority | Approved; reservation created; execution proceeds through supported flow |
| Wrong agent | Agent not assigned/authorised | Denied |
| Revoked capsule | Capsule revoked before request | Denied |
| Paused project | Project paused before request | Denied or requires explicit reactivation, according to policy |
| Expired capsule | Request after expiry | Denied |
| Stale revision | Request references earlier project/policy revision | Denied |
| Altered amount | Approved quote $50, request $65 | Denied |
| Altered recipient | Quote recipient differs from request recipient | Denied |
| Altered asset | Approved token differs from execution token | Denied |
| Expired quote | Request after quote expiry | Denied or refresh required |
| Recurring commitment | $20/month, 12-month minimum | $240 known minimum commitment recognised; approval required by default |
| Unbounded subscription | Auto-renew with no bounded authority | Escalated or denied |
| Usage-based expense | Unknown usage and no cap | Escalated or denied |
| Over-budget | Commitment exceeds available authority | Denied |
| Duplicate intent | Same intent/idempotency key twice | No second execution |
| Duplicate resource | Same canonical vendor/plan/resource already active for project | Rejected or flagged per policy |
| Concurrent requests | Two requests each try to use same remaining funds | Total authorised reservations never exceed budget |
| Timeout | Payment submission outcome unknown | Remains pending/unknown; reservation not prematurely released |
| Duplicate callback | Same settlement event received twice | Idempotent; no double counting |
| Settlement failure | Authenticated failure evidence | Correct failure/release/reconciliation transition |
| Provisioning failure | Payment settled, resource not provisioned | Settlement remains true; provisioning shows failed/unverified |
| Agent completion claim | Agent says task passed without test evidence | Claim remains unverified |
| Objective check | Predefined test passes | Only that defined test is marked passed |
| Human acceptance | Authorised human accepts result | Human acceptance event recorded with identity/time |

Where some scenarios cannot be implemented before the deadline, record them as explicit limitations and do not imply they passed.

---

# 18. Competitive positioning and differentiation

## 18.1 Competitive reality

Do not describe RunLatch as the first platform to provide:

- AI-agent wallets.
- Agent spending limits.
- Signed purchase mandates.
- Human approval gates.
- Merchant/vendor allowlists.
- Transaction receipts.
- Project budgets.
- Agent payment infrastructure.

These capabilities already exist in overlapping products, standards, platforms, and developer experiments.

Examples identified during prior research include:

- Coinbase Agentic Wallets.
- Google's Agent Payments Protocol (AP2).
- Mastercard Agent Pay.
- Pleo and adjacent business-spending tools.
- Google Cloud cost controls.
- Harness agent lifecycle and cost-governance capabilities.
- Community projects and discussions about MCP-based spending mandates, hierarchical budgets, parent/child agent limits, and agent payment retry risks.

These examples should be rechecked against their current official product pages and documentation before any public competitive claim is made.

## 18.2 Differentiation thesis

RunLatch should differentiate through the connection between:

1. **Project context:** Which client work/order requires the purchase?
2. **Delegated authority:** Which human-approved task and capsule authorise it?
3. **Full commitment:** What is the known/minimum/maximum future financial exposure?
4. **Freshness:** Is the project, quote, policy, and mandate still current?
5. **Portfolio awareness:** Has another agent already acquired the same resource or committed the budget?
6. **Payment state:** Was the money actually submitted and settled?
7. **Delivery evidence:** Was the purchased resource provisioned and were the specified checks passed?
8. **Client accountability:** Can the business explain the expenditure and evidence to its client?

The strongest product expression is not "AI wallet with limits". It is:

> **Project-bound purchasing authority and outcome evidence for autonomous work.**

## 18.3 Why NEAR matters

NEAR should contribute enforceable financial authority, shared state, auditable state transitions, and verifiable transaction references. It should not be included merely as branding.

If the product can be demonstrated equally well as a conventional database with no meaningful on-chain enforcement, revisit which component truly needs to be on-chain. The hackathon build should make the chain's role visible and technically credible.

---

# 19. Risks and mitigations

| Risk | Why it matters | Mitigation |
|---|---|---|
| Scope becomes too broad | Agency operations, accounting, subscriptions, procurement, and agent orchestration could consume the project | Build one purchase-to-outcome vertical slice |
| Product sounds like a wallet | Competitors already provide agent spending limits | Lead with project-bound purchasing and evidence |
| Full commitment is miscalculated | Taxes, renewals, variable usage, and cancellation terms can be complex | Make assumptions explicit; require caps or human approval when unknown |
| Project cancellation is not propagated | External project state is not automatically visible on-chain | Require authorised state update or authenticated integration; use revisions |
| Duplicate detection is unreliable | Similar purchases may not be identical | Use deterministic identifiers for enforcement; AI similarity only as advisory |
| Payment callback is missing | Premature release can permit double spending | Keep unknown state and reconcile before release |
| Receipt overclaims delivery | Settlement does not prove resource receipt or task quality | Separate evidence states and describe scope precisely |
| Client report leaks data | Project and supplier records may be confidential | Read-only scopes, data minimisation, and access controls |
| Contract complexity grows | Too much on-chain business logic could delay a safe MVP | Keep critical authorisation and budget rules on-chain; sensitive details off-chain |
| Provider integration is fake | Demo credibility and user trust are harmed | Label mock adapters clearly; use real testnet evidence only where available |
| Market demand is assumed | Qualitative discussions do not prove willingness to pay | Validate with real small agency owners after the demo |

---

# 20. Research basis and validation cautions

This direction was formed from prior competitive and problem research. The findings below are useful inputs, not proof that the market has already been validated.

## 20.1 Competitive and standards research discussed

- Coinbase Agentic Wallets: agent wallets and spending/session permissions.
- Google Agent Payments Protocol (AP2): signed mandates, checkout/payment authorisation context, and receipts.
- Mastercard Agent Pay: agent identity, permissions, and payment framework.
- Pleo: business spending, budgets, approvals, expense workflows, and emerging AI/MCP workflows.
- Google Cloud cost controls: limits and governance for cloud/AI spend.
- Harness: agent lifecycle and cost-governance direction.
- NIST agent identity and authorisation work: least privilege, accountability, human approval, identity, and auditability.
- BCG procurement research (July 2026): reported organisational barriers to agentic procurement adoption, including trust, security, accountability, and auditability.

Previously discussed BCG survey figures were approximately 71% trust in autonomous decision-making as a reported barrier, 66% security/IP risk, 53% accountability, and 48% auditability. These are survey responses from the reported respondent group, not population-wide market statistics. Verify the original report, exact question wording, respondent base, and date before reusing any figures externally.

## 20.2 Community research discussed

Prior research surfaced Reddit and Hacker News discussions about:

- Agent spending mandates and MCP spending controls.
- Parent/child budgets for multiple agents.
- Runaway spending and repeated payment attempts.
- Purchases based on stale context.
- Duplicate software/service purchases across teams.
- Ambiguous timeouts and the risk of unsafe payment retries.

Community posts are anecdotal and sometimes promotional. They are useful for discovering failure modes and language used by developers, but should not be presented as representative market research.

## 20.3 Procurement logic

The concept of comparing authorised purchase terms, what was received, and what is invoiced is inspired by established procurement controls such as three-way matching. RunLatch should adapt the useful principle to agent-led service purchases without claiming to replace a complete procurement or accounts-payable system.

## 20.4 Validate the beachhead

Before treating the agency niche as proven, speak to a small number of owners/operators of AI automation, software, web, and creative agencies.

Questions to investigate:

1. Which purchases do your agents make or recommend today?
2. Who currently approves them?
3. Have you had duplicate purchases, unused subscriptions, unexpected renewals, or purchases tied to cancelled projects?
4. How do you attribute AI/tool spending to individual client projects?
5. How do you prove to a client what a tool or service purchase was used for?
6. How do you distinguish a payment from successful provisioning or delivery?
7. What is the most expensive or frustrating failure you have experienced?
8. Would you pay for a tool that binds agent purchasing to project budgets and records outcome evidence? Who would approve that purchase?
9. What integrations would be mandatory for you to adopt it?
10. What would make you refuse to use a blockchain-backed product?

Do not invent interview results. Record direct quotes only with permission and distinguish observed customer evidence from internal hypotheses.

---

# 21. Roadmap after the hackathon MVP

Only pursue these after the core purchase-to-outcome loop is working.

## Phase 2: Agency operating integrations

- Project management integrations.
- Authenticated cancellation/status updates.
- Supplier quote ingestion.
- Invoice and receipt ingestion.
- Provider provisioning webhooks.
- Multiple project/capsule support.
- Read-only client reporting links.

## Phase 3: Stronger procurement intelligence

- Deterministic duplicate resource detection across projects.
- Subscription/renewal tracking.
- Usage-based maximum commitment controls.
- Vendor reliability and evidence history.
- Budget variance reporting.
- Parent/child agent allocation and more advanced delegation.

## Phase 4: Interoperability

- Map internal mandates to AP2 or other established standards where appropriate.
- Work with multiple agent frameworks and payment adapters.
- Add authenticated agent identity and credentials.
- Expand settlement rails only when demand and technical safety justify it.

## Phase 5: Broader markets

Potential later customers include autonomous operations teams, managed service providers, AI-native studios, and businesses that allow agents to buy resources for internal workflows. Validate each segment separately rather than broadening the product prematurely.

---

# 22. Required repository/documentation updates

After reading the current repository, update the existing documents so they reflect one coherent product:

- `AGENTS.md`: autonomous development rules, safety boundaries, product direction, testing expectations, and no fabricated capability claims.
- `PRODUCT.md`: new positioning, beachhead, personas, jobs to be done, product promise, MVP scope, and non-goals.
- `ARCHITECTURE.md`: project/capsule model, quote/commitment model, deterministic purchase flow, reservation/settlement lifecycle, evidence model, and on-chain/off-chain boundary.
- `ACCEPTANCE_TESTS.md`: update the acceptance criteria and test matrix in this document.
- `DESIGN.md`: update page hierarchy and UX flows while retaining the existing dither visual identity and accessible design constraints.
- `HACKATHON_COMPLIANCE.md`: preserve existing findings, re-verify current rules, and identify any new requirements introduced by the product direction.
- `BUILD_LOG.md`: record the change, files changed, decisions, actual tests, unresolved questions, and next development stage.
- `RUNLATCH_PROJECT_BLUEPRINT.md`: either update the relevant product sections or clearly link this change brief as the newer product-direction authority. Do not leave contradictory positioning in active instructions.

Do not create duplicate versions of the same product spec unless the repository has a clear versioning convention. Do not silently delete the original blueprint or historical decisions.

---

# 23. Recommended implementation sequence

Use the existing project stage and actual repository state. If implementation has not begun, use this sequence:

1. **Product/spec reconciliation:** Update the project documents to the new product direction. Resolve contradictions. No unnecessary app rebuild.
2. **Contract/security core:** Confirm the contract can enforce capsule state/revision, quote binding, budget/reservation, and replay protection. Add the necessary contract tests before expanding the UI.
3. **Project and capsule foundation:** Implement the smallest useful project and Client Work Capsule model.
4. **Purchase intent and commitment evaluation:** Implement structured purchase requests, canonical quotes, full commitment calculation, and policy outcomes.
5. **Payment lifecycle:** Implement reservation, supported testnet execution, idempotency, settlement, and reconciliation state.
6. **Evidence and Outcome Receipts:** Implement distinct settlement, provisioning, objective-check, and human-acceptance states.
7. **Core UI and dither identity:** Implement overview, project detail, purchase review, receipt/report, and adversarial demo. Keep visuals polished but never let them replace functionality.
8. **Replay Lab and adversarial scenarios:** Demonstrate altered quote, recurring commitment, stale mandate, replay, duplicate, and concurrency protections.
9. **QA and security:** Run unit, integration, contract, UI, accessibility, and responsive tests that the environment supports. Document untested areas honestly.
10. **Demo and documentation:** Prepare a repeatable testnet demo and clear judge narrative. Do not submit or publish without human approval.

Do not skip tests to meet a visual milestone. Do not implement all roadmap features before the MVP vertical slice is complete.

---

# 24. Definition of done for this product-direction change

The change is complete when:

- The repository describes RunLatch consistently as project-bound purchasing and outcome accountability for AI-powered businesses.
- The initial customer is clearly defined as small AI-powered service businesses, with all market assumptions labelled as hypotheses where not validated.
- The Client Work Capsule is defined and connected to a project, task, agent, budget, expiry, and purchasing policy.
- Purchase authority is tied to a current project/capsule revision.
- Canonical quotes bind vendor, recipient, price, asset, and commercial terms.
- The system evaluates full known/minimum/maximum commitment rather than only the initial payment.
- Recurring purchases are governed explicitly.
- Duplicate/replay/concurrent budget risks are addressed and tested.
- Payment settlement is kept separate from provisioning and outcome verification.
- Outcome Receipts show the evidence and its source without overstating certainty.
- A project expense/outcome report can be generated from canonical structured records.
- The NEAR role is technically meaningful and accurately represented.
- Existing visual direction, security boundaries, and hackathon safety constraints are preserved.
- All relevant project documents have been reconciled.
- `BUILD_LOG.md` states what was actually changed, tested, and left unresolved.

---

# 25. Final instruction

Build **RunLatch as project-bound purchasing authority and outcome accountability for AI-powered businesses**, with small AI-native service agencies as the initial beachhead.

Do not reduce it to a generic spending-limit wallet. Do not turn it into a full accounting platform. Do not add features simply because they sound impressive. Every feature must reinforce at least one of these core promises:

1. The agent can only spend for an authorised project and task.
2. The business can understand and control the full financial commitment.
3. The purchase cannot be silently changed, duplicated, replayed, or executed under stale authority.
4. The payment lifecycle is represented honestly.
5. The business can inspect evidence of what was purchased and what was delivered.

Preserve the existing RunLatch foundation where it is correct. Make the smallest set of architectural changes necessary to support this stronger product. Build a complete, credible, repeatable NEAR testnet demonstration before expanding the scope.

**The product is not about giving AI agents money. It is about making AI delegation financially accountable.**
