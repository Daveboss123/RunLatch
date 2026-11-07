import assert from "node:assert/strict";
import { test } from "node:test";
import { compileInstructions, SAMPLE_INSTRUCTIONS, draftWithAdapter } from "../../src/lib/policy/compiler.ts";
import { POLICY_DEMO_CONTEXT as context } from "../../src/lib/policy/demo.ts";
import { canonicalPolicy, parsePolicyJson, validatePolicy } from "../../src/lib/policy/schema.ts";
import { approveLocalVersion, initialPolicyState, invalidateReview, setPolicyReview } from "../../src/lib/policy/review.ts";
import { toManual, validateManual } from "../../src/lib/policy/manual.ts";
import { parseNear } from "../../src/lib/preview/money.ts";

const sample = compileInstructions(SAMPLE_INSTRUCTIONS, context);
assert.equal(sample.ok, true);
if (!sample.ok) throw new Error("SAMPLE_INVALID");
const policy = sample.policy;
function codes(result: ReturnType<typeof validatePolicy>) { assert.equal(result.ok, false); return result.issues.map(issue => issue.code); }

test("deterministic sample compiles exact decimal-string limits without a key", () => {
  assert.equal(policy.budget, parseNear("3")); assert.equal(policy.approval_threshold, parseNear("0.6"));
  assert.equal(policy.recurring_policy, "FORBIDDEN"); assert.deepEqual(policy.allowed_provider_ids, ["database", "hosting"]);
  assert.equal(Object.isFrozen(policy), true); assert.equal(Object.isFrozen(policy.allowed_provider_ids), true);
});
test("malformed JSON, arrays, primitives and oversized input fail closed", () => {
  for (const text of ["{", '{"budget":}', '```json\n{}\n```']) assert.ok(codes(parsePolicyJson(text, context)).includes("MALFORMED_JSON"));
  for (const text of ["null", "[]", "true", '"hello"']) assert.ok(codes(parsePolicyJson(text, context)).includes("INVALID_POLICY_OBJECT"));
  assert.ok(codes(parsePolicyJson(" ".repeat(8193), context)).includes("POLICY_TOO_LARGE"));
});
test("all limits and conditions are required, including an explicit nullable threshold", () => {
  for (const field of Object.keys(policy)) {
    const input: Record<string, unknown> = { ...policy }; delete input[field];
    assert.ok(codes(validatePolicy(input, context)).includes("MISSING_FIELD"), field);
  }
});
test("duplicate JSON keys cannot silently override rules, including escaped key spellings", () => {
  const text = JSON.stringify(policy);
  for (const appended of ['"budget":"1"', '"bu\\u0064get":"1"']) assert.ok(codes(parsePolicyJson(`${text.slice(0, -1)},${appended}}`, context)).includes("DUPLICATE_JSON_FIELD"));
});
test("structured policy validation refuses accessors without executing supplied code", () => {
  let called = false;
  const input = { ...policy };
  Object.defineProperty(input, "budget", { get: () => { called = true; return "1"; }, enumerable: true });
  assert.ok(codes(validatePolicy(input, context)).includes("INVALID_POLICY_OBJECT")); assert.equal(called, false);
});
test("conflicting spending, commitment and threshold limits are rejected", () => {
  for (const edit of [{ per_purchase_limit: parseNear("4") }, { per_commitment_limit: parseNear("4") },
    { per_commitment_limit: parseNear("0.5") }, { approval_threshold: parseNear("4") }]) {
    assert.ok(codes(validatePolicy({ ...policy, ...edit }, context)).includes("CONFLICTING_LIMITS"));
  }
});
test("unknown/suspended providers, invented recipients and authorization fields fail", () => {
  assert.ok(codes(validatePolicy({ ...policy, allowed_provider_ids: ["invented"] }, context)).includes("UNKNOWN_PROVIDER"));
  assert.ok(codes(validatePolicy(policy, { ...context, providers: context.providers.map(provider => ({ ...provider, active: false })) })).includes("PROVIDER_SUSPENDED"));
  for (const edit of [{ recipient_id: "attacker.fixture.testnet" }, { decision: "APPROVED" }, { owner_approved: true }, { agent_public_key: "made-up" }]) assert.ok(codes(validatePolicy({ ...policy, ...edit }, context)).includes("UNKNOWN_FIELD"));
  assert.equal(context.providers[0].recipient, "database.fixture.testnet");
});
test("scope conflicts, unknown services/categories, duplicates and wildcards reject", () => {
  for (const edit of [{ allowed_provider_ids: ["database"], allowed_service_ids: ["hosting-instance"] }, { allowed_service_ids: ["unknown"] },
    { allowed_categories: ["unknown"] }, { allowed_provider_ids: ["database", "database"] }, { allowed_provider_ids: ["*"] }]) assert.equal(validatePolicy({ ...policy, ...edit }, context).ok, false);
});
test("amounts stay bounded integer strings, quantity is bounded, expiry and allocation are current", () => {
  for (const budget of [3, 3.1, "-1", "1.1", "01", "0", ((1n << 128n)).toString()]) assert.equal(validatePolicy({ ...policy, budget }, context).ok, false);
  for (const max_quantity of [0, 51, 1.5, "1"]) assert.equal(validatePolicy({ ...policy, max_quantity }, context).ok, false);
  assert.ok(codes(validatePolicy({ ...policy, expires_at_ns: context.now_ns }, context)).includes("POLICY_EXPIRED"));
  assert.ok(codes(validatePolicy({ ...policy, expires_at_ns: (BigInt(context.project_expires_at_ns) + 1n).toString() }, context)).includes("EXCEEDS_PROJECT_EXPIRY"));
  assert.ok(codes(validatePolicy(policy, { ...context, allocated_authority: "1" })).includes("PROJECT_ALLOCATION_EXCEEDED"));
});
test("ambiguous, conflicting and unsupported instructions never fall back to the sample", () => {
  for (const input of ["Buy something cheap", `${SAMPLE_INSTRUCTIONS} Buy only on Tuesdays.`, `${SAMPLE_INSTRUCTIONS} Budget 2 NEAR.`, `${SAMPLE_INSTRUCTIONS} Recurring requires owner approval.`]) assert.equal(compileInstructions(input, context).ok, false);
  assert.ok(codes(compileInstructions("Buy something cheap", context)).includes("AMBIGUOUS_INSTRUCTION"));
  assert.ok(codes(compileInstructions(`${SAMPLE_INSTRUCTIONS} Budget 2 NEAR.`, context)).includes("CONFLICTING_INSTRUCTIONS"));
  assert.ok(codes(compileInstructions("x".repeat(4097), context)).includes("INSTRUCTIONS_TOO_LARGE"));
});
test("missing language limits reject; explicit threshold disable does not disable recurring approval", () => {
  assert.ok(codes(compileInstructions("Budget 3 NEAR.", context)).includes("MISSING_FIELD"));
  const result = compileInstructions(SAMPLE_INSTRUCTIONS.replace("Owner approval above 0.6 NEAR", "Owner approval disabled").replace("Recurring forbidden", "Recurring requires owner approval"), context);
  assert.equal(result.ok, true); if (result.ok) { assert.equal(result.policy.approval_threshold, null); assert.equal(result.policy.recurring_policy, "REQUIRE_APPROVAL"); }
});
test("manual form round trip preserves exact terms; malformed limits are not coerced", () => {
  const result = validateManual(toManual(policy), context); assert.equal(result.ok, true);
  if (result.ok) assert.equal(canonicalPolicy(result.policy), canonicalPolicy(policy));
  for (const input of [{ budget: "1e3" }, { max_quantity: "1.0" }, { per_purchase_limit: "" }]) assert.equal(validateManual({ ...toManual(policy), ...input }, context).ok, false);
});
test("explicit owner review is required and cannot transfer across edited drafts", () => {
  const state = setPolicyReview(initialPolicyState, sample, context);
  assert.throws(() => approveLocalVersion(state, state.epoch, false, context), /OWNER_APPROVAL_REQUIRED/u);
  assert.throws(() => approveLocalVersion(initialPolicyState, 0, true, context), /STALE_OR_INVALID_REVIEW/u);
  const edited = invalidateReview(state);
  assert.throws(() => approveLocalVersion(edited, state.epoch, true, context), /STALE_OR_INVALID_REVIEW/u);
});
test("approved local versions are immutable and new terms require a new approval", () => {
  const reviewed = setPolicyReview(initialPolicyState, sample, context);
  const first = approveLocalVersion(reviewed, reviewed.epoch, true, context);
  assert.equal(first.versions[0].version, 1); assert.equal(first.versions[0].grants_payment_authority, false); assert.equal(first.review, null);
  assert.equal(Object.isFrozen(first.versions[0]), true);
  const duplicate = setPolicyReview(first, sample, context);
  assert.throws(() => approveLocalVersion(duplicate, duplicate.epoch, true, context), /POLICY_VERSION_ALREADY_APPROVED/u);
  const nextReview = setPolicyReview(invalidateReview(first), validatePolicy({ ...policy, budget: parseNear("2.5"), per_commitment_limit: parseNear("2.5") }, context), context);
  const second = approveLocalVersion(nextReview, nextReview.epoch, true, context);
  assert.equal(second.versions[1].version, 2); assert.equal(second.versions[0].canonical_content, first.versions[0].canonical_content);
  assert.equal(second.versions[1].policy.budget, parseNear("2.5"));
  assert.equal(second.active_version, 2);
});
test("approval rechecks project revision/status/funding against the current trusted context", () => {
  const state = setPolicyReview(initialPolicyState, sample, context);
  for (const edit of [{ project_revision: "2" }, { project_active: false }, { allocated_authority: "1" }, { now_ns: context.project_expires_at_ns }]) assert.throws(() => approveLocalVersion(state, state.epoch, true, { ...context, ...edit }), /CURRENT_CONTEXT_INVALID/u);
});
test("review cannot approve a silently changed registry recipient", () => {
  const state = setPolicyReview(initialPolicyState, sample, context);
  const changed = { ...context, providers: context.providers.map(provider => ({ ...provider, recipient: "changed.fixture.testnet" })) };
  assert.throws(() => approveLocalVersion(state, state.epoch, true, changed), /REVIEW_CONTEXT_CHANGED/u);
});
test("local versions have bounded records, and rejected ninth approval keeps existing state", () => {
  let state = initialPolicyState;
  for (let i = 0; i < 8; i++) {
    state = setPolicyReview(state, validatePolicy({ ...policy, max_quantity: i + 1 }, context), context);
    state = approveLocalVersion(state, state.epoch, true, context);
  }
  const ninth = setPolicyReview(state, validatePolicy({ ...policy, max_quantity: 9 }, context), context);
  assert.throws(() => approveLocalVersion(ninth, ninth.epoch, true, context), /LOCAL_VERSION_LIMIT/u);
  assert.equal(state.versions.length, 8); assert.equal(state.active_version, 8);
});
test("optional adapter drafts only: malformed, malicious and cancelled output cannot approve", async () => {
  for (const json of ["{", JSON.stringify({ ...policy, decision: "APPROVED" }), JSON.stringify({ ...policy, allowed_provider_ids: ["invented"] })]) {
    const output = await draftWithAdapter({ label: "local test mock, not inference", draft: async () => json }, "explicit instruction", context, new AbortController().signal);
    assert.equal(output.ok, false); assert.equal(initialPolicyState.versions.length, 0);
  }
  const valid = await draftWithAdapter({ label: "local mock", draft: async () => JSON.stringify(policy) }, "explicit", context, new AbortController().signal);
  assert.equal(valid.ok, true); assert.equal(initialPolicyState.versions.length, 0);
  const signal = AbortSignal.abort(); let called = false;
  assert.equal((await draftWithAdapter({ label: "local mock", draft: async () => { called = true; return "{}"; } }, "explicit", context, signal)).ok, false);
  assert.equal(called, false);
});
