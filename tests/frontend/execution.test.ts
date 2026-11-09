import test from "node:test";
import assert from "node:assert/strict";
import { BROWSER_EXECUTION, EXECUTION, executionFromSource } from "../../src/lib/execution.ts";
import { SCENARIOS, SCENARIO_PRESETS, QUOTES, demoContext } from "../../src/lib/preview/fixtures.ts";
import { evaluateGate } from "../../src/lib/preview/gate.ts";
import { demoDisclosure, EMPTY_DISCLOSURE } from "../../src/lib/preview/disclosure.ts";

test("Canonical provenance has exactly four frozen modes and never grants payment authority", () => {
  const modes = [EXECUTION.BROWSER_FIXTURE, EXECUTION.LOCAL_SDK_TEST, EXECUTION.LOCAL_SANDBOX, EXECUTION.NEAR_TESTNET];
  assert.deepEqual(modes.map(mode => mode.mode), ["BROWSER_FIXTURE", "LOCAL_SDK_TEST", "LOCAL_SANDBOX", "NEAR_TESTNET"]);
  assert.deepEqual(modes.map(mode => mode.provenance), ["seeded_browser_fixture", "local_sdk_test", "local_sandbox", "testnet_observation"]);
  for (const mode of modes) {
    assert.equal(mode.independently_verified, false);
    assert.equal(mode.grants_payment_authority, false);
    assert.equal(Object.isFrozen(mode), true);
    assert.ok(mode.allowed_claim.length > 0);
  }
});

test("Execution labels never certify an imported source or grant payment authority", () => {
  const modes = ["SIMULATED", "LOCAL_SDK_TEST", "LOCAL_NEAR_SANDBOX_OBSERVATION", "NEAR_TESTNET_OBSERVATION"].map(executionFromSource);
  assert.deepEqual(modes.map(m => m.mode), ["BROWSER_FIXTURE", "LOCAL_SDK_TEST", "LOCAL_SANDBOX", "NEAR_TESTNET"]);
  for (const mode of modes) { assert.equal(mode.independently_verified, false); assert.equal(mode.grants_payment_authority, false); assert.equal(Object.isFrozen(mode), true); }
  assert.throws(() => executionFromSource("live"));
  assert.throws(() => executionFromSource("NEAR_TESTNET"));
  assert.deepEqual(demoDisclosure(EMPTY_DISCLOSURE).execution, BROWSER_EXECUTION);
  assert.equal(JSON.stringify(demoDisclosure(EMPTY_DISCLOSURE)).includes("fixture.testnet"), false);
});

for (const scenario of SCENARIOS) test(`Shared scenario preset: ${scenario.id}`, () => {
  const preset = SCENARIO_PRESETS[scenario.id], q = QUOTES[preset.quote_index].input;
  const context = demoContext(q,"a".repeat(64),preset.allocation,scenario.id);
  if(scenario.id==="tamper") context.expected_quote_hash="b".repeat(64);
  const before = JSON.stringify(context);
  const result = evaluateGate(context);
  assert.equal(result.decision,preset.expected);
  if(preset.reason) assert.ok(result.reasons.includes(preset.reason));
  if(scenario.id === "concurrent") {
    assert.deepEqual(result.reasons, ["INSUFFICIENT_AVAILABLE_BUDGET", "INSUFFICIENT_COMMITMENT_BUDGET"]);
    context.capsule.reserved = "200000000000000000000000";
    assert.equal(evaluateGate(context).decision, "APPROVED");
    context.capsule.reserved = "1500000000000000000000000";
  }
  assert.equal(JSON.stringify(context),before);
  assert.equal(result.grants_payment_authority,false);
});
