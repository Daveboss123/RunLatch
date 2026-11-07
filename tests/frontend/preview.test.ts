import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { formatNear, parseNear, visualPercent } from "../../src/lib/preview/money.ts";
import { evaluateGate } from "../../src/lib/preview/gate.ts";
import { parityContext } from "../../src/lib/preview/parity.ts";
import { demoDisclosure, EMPTY_DISCLOSURE } from "../../src/lib/preview/disclosure.ts";
import { QUOTES, demoContext, type Scenario } from "../../src/lib/preview/fixtures.ts";

const fixtures: { id: string; decision: string; reasons: string[] }[] = JSON.parse(await readFile(new URL("../../fixtures/preview/gate-cases.json", import.meta.url), "utf8"));
for (const fixture of fixtures) test(`D-05/T-06 local Gate vector: ${fixture.id}`, () => {
  const result = evaluateGate(parityContext(fixture.id));
  assert.equal(result.decision, fixture.decision);
  assert.deepEqual(result.reasons, fixture.reasons);
  assert.equal(result.checks.length, 29);
  assert.equal(result.grants_payment_authority, false);
  if (fixture.id === "tamper") assert.equal(result.checks[20].state, "NOT_EVALUATED");
});
test("T-01 exact native amounts retain all24 decimals above Number precision", () => {
  for (const amount of ["0.000000000000000000000001", "3.14", "90071992547409.123456789012345678901234"]) assert.equal(parseNear(formatNear(parseNear(amount))), parseNear(amount));
  assert.equal(formatNear(parseNear("0.5")), "0.50");
  for (const invalid of ["-1", "1e3", "01", "NaN", "1.0000000000000000000000001", " 3"]) assert.throws(() => parseNear(invalid));
  assert.throws(() => parseNear("900719925474099.123456789012345678901234"), /OVERFLOW/u);
});
test("D-14 budget geometry is separate from exact financial accounting", () => {
  assert.equal(visualPercent("1", "3"), "33.33%");
  assert.throws(() => visualPercent("4", "3"));
  assert.throws(() => visualPercent("0", "0"));
});
test("P-19 demo disclosure defaults to no financials/expenses/evidence", () => {
  const report = demoDisclosure(EMPTY_DISCLOSURE);
  assert.equal(report.financials, null); assert.deepEqual(report.expenses, []); assert.equal(report.evidence_included, false);
  assert.equal(JSON.stringify(report).includes("fixture.testnet"), false);
  const selected = demoDisclosure({ budget: true, expenses: true, evidence: true });
  assert.equal(selected.financials!.spent, parseNear("0.5"));
  assert.equal(selected.expenses[2].decision, "DENIED");
  assert.equal(selected.financials!.committed_future, "0");
  assert.equal(selected.expenses[0].evidence!.human_acceptance, "NOT_RECORDED");
});

for (const [scenario, reason] of [["expired", "QUOTE_EXPIRED"], ["unregistered", "UNKNOWN_PROVIDER"], ["cancelled", "PROJECT_INACTIVE"]] as const satisfies readonly (readonly [Scenario, string])[]) test(`Motion brief: explicit ${scenario} fixture is denied without authority`, () => {
  const q = QUOTES[scenario === "expired" ? 3 : 0].input;
  const result = evaluateGate(demoContext(q, "0".repeat(64), "3", scenario));
  assert.equal(result.decision, "DENIED");
  assert.ok(result.reasons.includes(reason));
  assert.equal(result.checks.length, 29);
  assert.equal(result.grants_payment_authority, false);
  assert.equal(QUOTES[0].input.expires_at_ns, "1794139200000000000");
});
