# Policy compiler and validated editor

Local feature requested 7 November 2026. Open `/demo` → **Draft and review purchasing rules** → `/policy`. No LLM key, wallet, deployment or external service is required.

## Try it

1. **Validate draft** → inspect every allocation/payment/commitment limit, scope, quantity, recurring rule, exact approval threshold, expiry, project/revision and fixed fixture recipient.
2. Tick the exact-review checkbox → **Approve local version 1**. See an immutable version labelled **active local demo only**. No money moves and no contract policy activates.
3. Edit instructions or switch draft method → prior draft review/consent is invalidated. A previously approved version is retained unchanged.
4. Use the manual form to lower allocation and full-commitment limit to `2.5` NEAR → validate → approve **version 2**. Version 1 still shows its original terms.
5. Enter `Buy cheap hosting`, add a second `Budget` clause, omit a limit, paste malformed JSON or use an unknown provider → review is blocked with actionable error links. No fallback silently replaces those instructions.

## What the compiler supports

The deterministic compiler supports explicit sentence/newline/semicolon-separated clauses, shown in the initial example:

```text
Budget 3 NEAR. Per purchase 1 NEAR. Per commitment 3 NEAR.
Providers database, hosting. Services database-instance, hosting-instance.
Categories infrastructure. Max quantity 1. Recurring forbidden.
Owner approval above 0.6 NEAR. Expires 1794139200000000000 ns.
```

Alternative explicit clauses: `Recurring requires owner approval` and `Owner approval disabled`. Disabled means a **null amount threshold**, not an override of recurring or other authorization checks. Zero means every positive full commitment crosses the threshold. Comparison is **strictly greater than** the threshold, matching the contract Gate. This small grammar is not general natural-language comprehension. Uninterpreted clauses, multiple definitions, missing conditions and unknown identities fail closed; use the manual form for supported edits.

## Validation and authority boundaries

- `src/lib/policy/schema.ts` defines `PolicyTerms`, validates exact required fields/types and cross-field rules, and rejects unknown fields, repeated JSON keys, malformed/oversized input, wildcards, duplicate scopes, unknown/inactive providers, scope conflicts, invalid quantities, stale project revisions, allocation overflow and expiry. Money is bounded u128 integer yoctoNEAR strings; manual NEAR conversions preserve 24 decimal places. Timestamp strings are bounded u64.
- Input limits: JSON 8 KiB; instructions 4 KiB / 24 clauses; scopes at contract-compatible sizes; at most eight in-memory local approved versions. The editor additionally requires immediate payment cap ≤ full-commitment cap as an explicit **conservative drafting rule**, not a claim about a new Rust restriction.
- Providers/recipients are copied from the two existing canonical database/hosting quotes in `preview/fixtures.ts`. Nothing is inferred from a provider name, URL or prose. The demo uses a fixed clock and a **hypothetical new allocation** with zero existing allocated authority, not the seeded board's current accounting.
- `review.ts` binds review to a draft epoch, exact structured terms and the reviewed project/registry context, including fixed recipients. Approval rechecks current context. Edited drafts, changed recipients, stale authority, replayed approval and exhausted record capacity cannot create a new version. Previous approved versions remain frozen.
- All versions exist only in page memory; reload clears them. There is no storage, telemetry, automatic prompt upload, signing endpoint or purchase dispatch. The Gate simulator remains independent and uses its existing regression fixtures.
- These are purchasing terms, **not a complete deployable Rust `Policy`**. No scoped public key, task/workflow binding or validation-spec hash is invented. Real activation requires the authenticated owner to create/fund a new immutable capsule with those exact bindings, storage funding and the actual `runlatch.policy.v2` Borsh hash. The compiler's canonical review serialization is not that hash. Browser review is not owner authentication or payment authority.

## Optional LLM drafting

No hosted LLM adapter is installed or selected. `.env.example` contains only an empty server-only `AI_PROVIDER_API_KEY` placeholder; a key alone does not configure a service. Real credentials must be privately injected into an approved server process, never committed, exposed as `NEXT_PUBLIC_*`, passed to this editor or written to a real `.env` file under this workflow.

`compiler.ts` exposes a caller-injected `PolicyDraftAdapter` / `draftWithAdapter` integration seam. A future reviewed **server-side** caller can supply an explicitly configured service, a bounded/cancellable draft request and the trusted context. Its output must be a JSON string and is processed by the same strict validator before owner review. Adapter errors/cancellation never create approval. The interface exposes drafting only, not owner actions, tools, recipient substitution, signing or final authorization. No automatic endpoint selection, paid call or private-data disclosure is enabled. Unit tests use local injected mocks, **not real LLM inference**. Connecting an actual provider remains a separate configuration/privacy review.

## Verification

Run `npm.cmd run test:frontend` for compiler/schema/manual/version tests and `npm.cmd run test:browser` with the loopback production preview running. The policy browser cases include explicit approval, stale consent, unchanged prior versions, malformed/missing/conflicting/unknown-provider rejection, unsupported language, actionable errors, desktop/mobile light/dark axe checks, keyboard, reduced/forced colors and no-JavaScript behavior. Exact counts/results and fresh-clone coverage are in `BUILD_LOG.md` section42; screenshots are private under `.local/ui/policy/`. Automated Chromium checks are not manual screen-reader, Safari/iOS or physical-device certification.
