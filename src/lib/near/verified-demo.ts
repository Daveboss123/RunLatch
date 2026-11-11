/**
 * Public, recorded NEAR testnet facts for the demo workspace.
 * Values are RPC-observed FINAL references retained in local attempt records.
 * A hash, block height or FINAL status is not settlement, provisioning or acceptance.
 */
export type VerifiedStepState = "FINAL" | "UNRESOLVED";
export interface VerifiedStep {
  readonly step: string;
  readonly label: string;
  readonly state: VerifiedStepState;
  readonly summary: string;
  readonly details: readonly (readonly [string, string])[];
  readonly transaction_hash: string | null;
  readonly block_height: number | null;
}

export const VERIFIED_TESTNET = Object.freeze({
  network: "testnet",
  contract_id: "gate.runlatch-demo-1108.testnet",
  operator_id: "runlatch-demo-1108.testnet",
  recorded_on: "11 November 2026",
  steps: Object.freeze([
    Object.freeze({ step: "01", label: "Work order", state: "FINAL",
      summary: "The owner created one project: active, revision 1, a 0.30 NEAR ceiling and nothing allocated yet.",
      details: [["Project", "project_demo_1110"], ["Status", "ACTIVE · revision 1"], ["Ceiling", "0.30 NEAR"], ["Allocated", "0"]] as const,
      transaction_hash: "FMKZhn3JU6k7KxEE9BLezanQoZmHufCHrrqHwSZudBza", block_height: 277134275 }),
    Object.freeze({ step: "02", label: "Capsule", state: "FINAL",
      summary: "One task capsule was allocated 0.30 NEAR under an immutable policy. No money is spent or reserved.",
      details: [["Capsule", "capsule_demo_1110"], ["Policy hash", "f5e891042ba5cbf5ef0d0ba3b4516d5f28c53eecea7f1b8ecebae1f002934535"],
        ["Allocated", "0.30 NEAR"], ["Spent / reserved", "0 / 0"]] as const,
      transaction_hash: "AeNBkfXrftqN85JEFgJAwXdnHnbr4Nb8A65ysi4drKKj", block_height: 277134741 }),
    Object.freeze({ step: "03", label: "Canonical quote", state: "FINAL",
      summary: "The registered provider published one fixed-price, one-use quote. It has not been consumed.",
      details: [["Quote", "db_quote_demo_1110"], ["Quote hash", "ae846302dbae490ba2352bbce89162821b8882a9c237903f97692ad9007231a3"],
        ["Price", "0.05 NEAR · quantity 1"], ["Consumed", "No"]] as const,
      transaction_hash: "2TYs5yEFkjFRWiAMTuMqETQ2FosvoaLZnKhjRZEWF1Pn", block_height: 277136000 }),
    Object.freeze({ step: "04", label: "Restricted agent key", state: "FINAL",
      summary: "The agent account received a submit-only function-call key with a finite gas allowance. The recovery key remains full access.",
      details: [["Agent", "agent.runlatch-demo-1108.testnet"], ["Method scope", "submit_purchase only"],
        ["Gas allowance", "0.05 NEAR"], ["Recovery key", "retained"]] as const,
      transaction_hash: "H4cqJTWvx2GvSAaFMPt4JUjPk2EvrjsbpoYUuLfWufMK", block_height: 277138478 }),
    Object.freeze({ step: "05", label: "Purchase attempt", state: "UNRESOLVED",
      summary: "The restricted key signed exactly one 0.05 NEAR purchase. No on-chain record was found in three independent read-only checks. The recorded contract snapshot shows no spend or reservation; settlement remains unverified.",
      details: [["Request", "db_purchase_demo_1111"], ["Terms", "0.05 NEAR · 100 Tgas · 0 deposit"],
        ["Three reads", "FastNEAR · official NEAR RPC · NEAR Blocks v3"], ["Recorded snapshot", "0.30 available · quote unconsumed"]] as const,
      transaction_hash: "3N98awqyrxUbGqA7zGVsZtpT28pmdJf5j2cdXR8c3GkP", block_height: null }),
  ] as const),
  limitation: "Recorded RPC-reported references, not a light-client proof. An unresolved attempt is not a failure, a refund or permission to re-sign, resend or release; RunLatch keeps it fail-closed.",
});

export function verifiedSteps(): readonly VerifiedStep[] {
  return VERIFIED_TESTNET.steps;
}
