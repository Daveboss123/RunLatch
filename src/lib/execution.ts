/** Provenance describes data; it never grants authority or independently verifies a chain. */
export type ExecutionMode = "browser_fixture" | "local_contract" | "near_testnet";
export type DataProvenance = "seeded_fixture" | "local_execution" | "testnet_observation";
export const EXECUTION = Object.freeze({
  browser_fixture: Object.freeze({ mode: "browser_fixture", provenance: "seeded_fixture", label: "Browser fixture", detail: "Seeded data · no contract call or money movement", independently_verified: false, grants_payment_authority: false } as const),
  local_contract: Object.freeze({ mode: "local_contract", provenance: "local_execution", label: "LOCAL contract", detail: "Isolated execution · not public NEAR testnet", independently_verified: false, grants_payment_authority: false } as const),
  near_testnet: Object.freeze({ mode: "near_testnet", provenance: "testnet_observation", label: "Testnet-labelled input", detail: "Requires independent network/transaction verification; unavailable in this UI", independently_verified: false, grants_payment_authority: false } as const),
});
export const BROWSER_EXECUTION = EXECUTION.browser_fixture;
/** Validated imported source labels remain assertions, not a live event certification. */
export function executionFromSource(source: string) {
  if (["SIMULATED", "BROWSER_SIMULATION"].includes(source)) return EXECUTION.browser_fixture;
  if (source === "LOCAL_NEAR_SANDBOX_OBSERVATION") return EXECUTION.local_contract;
  if (source === "NEAR_TESTNET_OBSERVATION") return EXECUTION.near_testnet;
  throw new Error("UNKNOWN_EXECUTION_SOURCE");
}
