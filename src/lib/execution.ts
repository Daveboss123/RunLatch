/**
 * Canonical execution provenance for every money/policy surface.
 * Provenance describes the data source; it never grants authority or independently verifies a chain.
 */
export type ExecutionMode = "BROWSER_FIXTURE" | "LOCAL_SDK_TEST" | "LOCAL_SANDBOX" | "NEAR_TESTNET";
export type DataProvenance = "seeded_browser_fixture" | "local_sdk_test" | "local_sandbox" | "testnet_observation";

export const EXECUTION = Object.freeze({
  BROWSER_FIXTURE: Object.freeze({
    mode: "BROWSER_FIXTURE", provenance: "seeded_browser_fixture", label: "Browser fixture",
    detail: "Seeded values and TypeScript preview · no contract call, signer, transfer or payment",
    allowed_claim: "Illustrative UI and policy paths only", independently_verified: false, grants_payment_authority: false,
  } as const),
  LOCAL_SDK_TEST: Object.freeze({
    mode: "LOCAL_SDK_TEST", provenance: "local_sdk_test", label: "Local SDK test",
    detail: "Rust contract tests with mocked host promise outcomes",
    allowed_claim: "Contract logic under documented test-harness assumptions", independently_verified: false, grants_payment_authority: false,
  } as const),
  LOCAL_SANDBOX: Object.freeze({
    mode: "LOCAL_SANDBOX", provenance: "local_sandbox", label: "Local Sandbox",
    detail: "Isolated Local NEAR Sandbox execution · not public testnet",
    allowed_claim: "Local runtime behaviour under recorded test setup", independently_verified: false, grants_payment_authority: false,
  } as const),
  NEAR_TESTNET: Object.freeze({
    mode: "NEAR_TESTNET", provenance: "testnet_observation", label: "NEAR testnet",
    detail: "Requires an observed public account/transaction reference; not available in this browser",
    allowed_claim: "Only the exact observed public testnet references", independently_verified: false, grants_payment_authority: false,
  } as const),
});

export const BROWSER_EXECUTION = EXECUTION.BROWSER_FIXTURE;

/** Validated imported source labels remain assertions, not a live event certification. */
export function executionFromSource(source: string) {
  if (["SIMULATED", "BROWSER_SIMULATION", "BROWSER_FIXTURE"].includes(source)) return EXECUTION.BROWSER_FIXTURE;
  if (["LOCAL_SDK_TEST", "LOCAL_CONTRACT_TEST"].includes(source)) return EXECUTION.LOCAL_SDK_TEST;
  if (["LOCAL_NEAR_SANDBOX_OBSERVATION", "LOCAL_SANDBOX"].includes(source)) return EXECUTION.LOCAL_SANDBOX;
  if (source === "NEAR_TESTNET_OBSERVATION") return EXECUTION.NEAR_TESTNET;
  throw new Error("UNKNOWN_EXECUTION_SOURCE");
}
