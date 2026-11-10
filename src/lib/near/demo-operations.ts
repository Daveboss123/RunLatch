/** Fixed public testnet demo operations. Public identities/terms only; no secret, consent or signer. */
import { parseRestrictedAgentScope } from "./agent-access.ts";
import { parseSetupAction } from "./setup-review.ts";
import { parseTestnetTarget } from "./testnet-target.ts";

export const RUNLATCH_TESTNET_TARGET = parseTestnetTarget({ network: "testnet", rpc_url: "https://test.rpc.fastnear.com/",
  contract_id: "gate.runlatch-demo-1108.testnet", operator_id: "runlatch-demo-1108.testnet",
  expected_code_hash: "F1pev22VSu86qxxWicXpCixtzzNoQxEi1FHRF2eGXjGP" });
export const DEMO_OPERATOR_KEY = "ed25519:4WJHM7chT6geyrN23fRR3sSLJhRaXmRaEjcaZvpUrXuL";
export const DEMO_PROVIDER_KEY = "ed25519:3WYYFFAVric9chaHHF5ed8gFSqBE2DppAtGPrxvx7YXN";
export const DEMO_AGENT_SCOPE = parseRestrictedAgentScope({ agent_id: "agent.runlatch-demo-1108.testnet",
  public_key: "ed25519:ABWnTWVgg59wN1p7pYfjcUUf53FFYubzELSBPq57Z2hY",
  recovery_public_key: "ed25519:6JcrDrG1V7GarzGkJF8vCsTcfKHSWqGfcP5BVT5n19C8", max_allowance: "50000000000000000000000" }, RUNLATCH_TESTNET_TARGET);
export const DEMO_CAPSULE_ACTION = parseSetupAction({ method: "create_capsule", signer_id: RUNLATCH_TESTNET_TARGET.operator_id,
  public_key: DEMO_OPERATOR_KEY, gas: "50000000000000", args: { capsule_id: "capsule_demo_1109", policy: {
    project_id: "project_demo_1108", project_revision: "1", task_id: "booking_database_1109", workflow_id: "website-resource-fixture-v1",
    agent_id: DEMO_AGENT_SCOPE.agent_id, agent_public_key: DEMO_AGENT_SCOPE.public_key, budget: "300000000000000000000000",
    per_purchase_limit: "50000000000000000000000", per_commitment_limit: "300000000000000000000000", recurring_policy: "REQUIRE_APPROVAL",
    allowed_provider_ids: ["db_demo_1108"], allowed_service_ids: ["database-plan"], allowed_categories: ["database"], max_quantity: 1,
    approval_threshold: "50000000000000000000000", expires_at_ns: "1794328520864706128",
    validation_spec_hash: "b48e78d7a71b252e8d752fe4d36a9209dcd9087711eafde655a7fd7f995b6a6b" },
    storage_credit: "2621440000000000000000000" } });
export const DEMO_QUOTE_ACTION = parseSetupAction({ method: "publish_quote", signer_id: "db.runlatch-demo-1108.testnet",
  public_key: DEMO_PROVIDER_KEY, gas: "50000000000000", args: { quote: { quote_id: "db_quote_demo_1109", provider_id: "db_demo_1108",
    recipient_id: "db.runlatch-demo-1108.testnet", service_id: "database-plan", category: "database", resource_key: "booking-database",
    quantity: 1, price: "50000000000000000000000", asset: "near-native", recurring: false, expires_at_ns: "1794324920864706128",
    previous_quote_id: null, commercial_terms: null } } });
