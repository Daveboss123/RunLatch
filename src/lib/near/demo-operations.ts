/** Fixed public testnet demo operations. Public identities/terms only; no secret, consent or signer. */
import { parseRestrictedAgentScope } from "./agent-access.ts";
import { parseSetupAction, type SetupAction } from "./setup-review.ts";
import { parseTestnetTarget } from "./testnet-target.ts";

function fixedSetup<M extends SetupAction["method"]>(value: unknown, method: M) {
  const action = parseSetupAction(value);
  if (action.method !== method) throw Error("DEMO_SETUP_METHOD_CHANGED");
  return action as Extract<SetupAction, { method: M }>;
}

export const RUNLATCH_TESTNET_TARGET = parseTestnetTarget({ network: "testnet", rpc_url: "https://test.rpc.fastnear.com/",
  contract_id: "gate.runlatch-demo-1108.testnet", operator_id: "runlatch-demo-1108.testnet",
  expected_code_hash: "F1pev22VSu86qxxWicXpCixtzzNoQxEi1FHRF2eGXjGP" });
export const DEMO_OPERATOR_KEY = "ed25519:4WJHM7chT6geyrN23fRR3sSLJhRaXmRaEjcaZvpUrXuL";
export const DEMO_PROVIDER_KEY = "ed25519:3WYYFFAVric9chaHHF5ed8gFSqBE2DppAtGPrxvx7YXN";
export const DEMO_PROJECT_ID = "project_demo_1110";
export const DEMO_AGENT_SCOPE = parseRestrictedAgentScope({ agent_id: "agent.runlatch-demo-1108.testnet",
  public_key: "ed25519:ABWnTWVgg59wN1p7pYfjcUUf53FFYubzELSBPq57Z2hY",
  recovery_public_key: "ed25519:6JcrDrG1V7GarzGkJF8vCsTcfKHSWqGfcP5BVT5n19C8", max_allowance: "50000000000000000000000" }, RUNLATCH_TESTNET_TARGET);
export const DEMO_PROJECT_ACTION = fixedSetup({ method: "create_project", signer_id: RUNLATCH_TESTNET_TARGET.operator_id,
  public_key: DEMO_OPERATOR_KEY, gas: "50000000000000", args: { project: { project_id: DEMO_PROJECT_ID, organisation_id: "org_demo_1108",
    client_ref: "client_demo_1108", budget_ceiling: "300000000000000000000000", expires_at_ns: "1794506400000000000",
    outcome_definition_hash: "57ad6f579cc08fc614950b7c15151054c564e4b30370077f14bb780cbd34c4b9" } } }, "create_project");
export const DEMO_CAPSULE_ACTION = fixedSetup({ method: "create_capsule", signer_id: RUNLATCH_TESTNET_TARGET.operator_id,
  public_key: DEMO_OPERATOR_KEY, gas: "50000000000000", args: { capsule_id: "capsule_demo_1110", policy: {
    project_id: DEMO_PROJECT_ID, project_revision: "1", task_id: "booking_database_1110", workflow_id: "website-resource-fixture-v1",
    agent_id: DEMO_AGENT_SCOPE.agent_id, agent_public_key: DEMO_AGENT_SCOPE.public_key, budget: "300000000000000000000000",
    per_purchase_limit: "50000000000000000000000", per_commitment_limit: "300000000000000000000000", recurring_policy: "REQUIRE_APPROVAL",
    allowed_provider_ids: ["db_demo_1108"], allowed_service_ids: ["database-plan"], allowed_categories: ["database"], max_quantity: 1,
    approval_threshold: "50000000000000000000000", expires_at_ns: "1794499200000000000",
    validation_spec_hash: "57ad6f579cc08fc614950b7c15151054c564e4b30370077f14bb780cbd34c4b9" },
    storage_credit: "2621440000000000000000000" } }, "create_capsule");
export const DEMO_QUOTE_ACTION = fixedSetup({ method: "publish_quote", signer_id: "db.runlatch-demo-1108.testnet",
  public_key: DEMO_PROVIDER_KEY, gas: "50000000000000", args: { quote: { quote_id: "db_quote_demo_1110", provider_id: "db_demo_1108",
    recipient_id: "db.runlatch-demo-1108.testnet", service_id: "database-plan", category: "database", resource_key: "booking-database",
    quantity: 1, price: "50000000000000000000000", asset: "near-native", recurring: false, expires_at_ns: "1794495600000000000",
    previous_quote_id: null, commercial_terms: null } } }, "publish_quote");
