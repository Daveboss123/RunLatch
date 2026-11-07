import assert from "node:assert/strict";
import { test } from "node:test";
import { validateResourceFixture } from "../../src/lib/validation/resource.ts";
test("objective fixture rejects repeated JSON fields rather than accepting the last status", async () => {
  const text = '{"fixture_version":1,"project_id":"client-work","resource_key":"booking-database","fixture_provider_id":"database-fixture","provisioning_status":"FAILED","provisioning_status":"PROVISIONED","health_status":200,"https_fixture":true,"route":"/health","health_body":"ok","observed_at_ns":"21"}';
  const result = await validateResourceFixture(new TextEncoder().encode(text), { project_id: "client-work", resource_key: "booking-database" }, "30");
  assert.equal(result.status, "VALIDATION_FAILED"); assert.ok(result.checks.every(c => c.status === "VALIDATION_FAILED"));
});
