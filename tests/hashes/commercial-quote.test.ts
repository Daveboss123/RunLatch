import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { commercialQuoteBytes, commercialQuoteHash, resourceFingerprint, type CanonicalQuoteTerms } from "../../src/lib/purchasing/hashing.ts";
const golden = JSON.parse(readFileSync(new URL("../../fixtures/hashes/quote-v2.json", import.meta.url), "utf8"));
const terms: CanonicalQuoteTerms = golden.terms;
test("P-06/Q-04: independent v2 commercial encoding matches Rust golden", async () => {
  assert.equal(Buffer.from(commercialQuoteBytes(terms, golden.network, golden.contract)).toString("hex"), golden.expected_bytes_hex);
  assert.equal(await commercialQuoteHash(terms, golden.network, golden.contract), golden.expected_hash);
  assert.equal(await resourceFingerprint(golden.project_id, terms.input, golden.network, golden.contract), golden.expected_resource_fingerprint);
});
test("P-06: every material commercial field changes binding", async () => {
  const base = terms.input.commercial_terms!;
  for (const changed of [{ required_periods: 11 }, { cadence: "ANNUAL" as const }, { auto_renew: true },
    { cancellation_terms_hash: "05".repeat(32) }, { source_evidence_hash: "06".repeat(32) }, { future_obligation_contingent_on_initial_payment: false }]) {
    const value = { ...terms, input: { ...terms.input, commercial_terms: { ...base, ...changed } } };
    assert.notEqual(await commercialQuoteHash(value, golden.network, golden.contract), golden.expected_hash);
  }
  const changed = { ...terms, input: { ...terms.input, resource_key: "other-resource" } };
  assert.notEqual(await commercialQuoteHash(changed, golden.network, golden.contract), golden.expected_hash);
});
test("P-10: resource fingerprint ignores quote ID/price but binds project/vendor/plan/resource", async () => {
  const first = await resourceFingerprint("client-work", terms.input, golden.network, golden.contract);
  assert.equal(await resourceFingerprint("client-work", { ...terms.input, quote_id: "new", price: "65" }, golden.network, golden.contract), first);
  for (const changed of [{ provider_id: "other" }, { service_id: "other" }, { resource_key: "other" }]) {
    assert.notEqual(await resourceFingerprint("client-work", { ...terms.input, ...changed }, golden.network, golden.contract), first);
  }
  assert.notEqual(await resourceFingerprint("other-project", terms.input, golden.network, golden.contract), first);
});
