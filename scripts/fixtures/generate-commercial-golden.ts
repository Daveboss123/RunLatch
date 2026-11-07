/** Fixed harmless cross-language golden generation, never keys or deployed evidence. */
import { writeFile } from "node:fs/promises";
import { commercialQuoteBytes, commercialQuoteHash, resourceFingerprint, type CanonicalQuoteTerms } from "../../src/lib/purchasing/hashing.ts";
const terms: CanonicalQuoteTerms = { schema_version: 2, publisher_id: "provider.testnet", input: {
  quote_id: "golden-commercial", provider_id: "database", recipient_id: "provider.testnet", service_id: "database-plan",
  category: "database", resource_key: "booking-database", quantity: 1, price: "20", asset: "near-native", recurring: true,
  expires_at_ns: "50000", previous_quote_id: null, commercial_terms: { billing_model: "FIXED_RECURRING", cadence: "MONTHLY",
    period_charge: "20", required_periods: 12, mandatory_fees: "0", known_taxes: "0", setup_fees: "0", auto_renew: false,
    cancellation_terms_hash: "03".repeat(32), source_evidence_hash: "04".repeat(32), future_obligation_contingent_on_initial_payment: true } } };
const bytes = commercialQuoteBytes(terms, "testnet", "contract.testnet");
const golden = { source: "LOCAL_HASH_FIXTURE_NOT_DEPLOYED", domain: "runlatch.quote.v2", network: "testnet", contract: "contract.testnet", terms,
  expected_bytes_hex: Buffer.from(bytes).toString("hex"), expected_hash: await commercialQuoteHash(terms, "testnet", "contract.testnet"),
  project_id: "client-work", expected_resource_fingerprint: await resourceFingerprint("client-work", terms.input, "testnet", "contract.testnet") };
await writeFile(new URL("../../fixtures/hashes/quote-v2.json", import.meta.url), JSON.stringify(golden, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ source: golden.source, expected_hash: golden.expected_hash, bytes: bytes.length }));
