import { demoContext, QUOTES, DEMO_EXPIRY, type Scenario } from "./fixtures.ts";
import { parseNear } from "./money.ts";

export function parityContext(id: string) {
  const scenario: Scenario = ["valid", "tamper", "over-budget", "stale", "recurring", "revoked", "replay", "duplicate"].includes(id) ? id as Scenario : "valid";
  const recurring = id === "recurring" || id === "recurring-review";
  const context = demoContext(QUOTES[recurring ? 2 : 0].input, "a".repeat(64), id === "recurring-review" ? "4" : id === "over-budget" ? "0.8" : "3", scenario);
  if (id === "tamper") context.expected_quote_hash = "b".repeat(64);
  if (id === "wrong-agent") context.agent.signer_key = "other-public-fixture-key";
  if (id === "missing-quote") context.quote = null;
  if (id === "unbounded") context.quote!.future_commitment = null;
  if (id === "threshold-equal") context.quote!.price = parseNear("0.6");
  if (id === "threshold-above") context.quote!.price = parseNear("0.7");
  if (id === "expired") context.now_ns = DEMO_EXPIRY;
  // Expired quote vector leaves capsule/project unexpired, as in the Rust adapter.
  if (id === "expired") { context.project.expires_at_ns = (BigInt(DEMO_EXPIRY) + 1n).toString(); context.capsule.expires_at_ns = context.project.expires_at_ns; }
  return context;
}
