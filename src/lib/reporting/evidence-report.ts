/** Selected canonical report plus explicit evidence axes, not a chain verifier. */
import type { buildProjectReport } from "./project.ts";
import type { ObservedPurchase } from "../near/observation.ts";
export type CanonicalProjectReport = Awaited<ReturnType<typeof buildProjectReport>>;
export function attachReportEvidence(report: CanonicalProjectReport, purchases: readonly ObservedPurchase[]) {
  const byPair = new Map<string, ObservedPurchase>();
  for (const p of purchases) {
    if (p.record.proposal.project_id !== report.project_id) throw Error("REPORT_EVIDENCE_PROJECT_MISMATCH");
    const key = `${p.record.proposal.capsule_id}:${p.record.proposal.request_id}`;
    if (byPair.has(key)) throw Error("REPORT_EVIDENCE_DUPLICATE_REQUEST"); byPair.set(key, p);
  }
  return Object.freeze({ ...report,
    verified_purchase_spend: report.financials ? purchases.filter(p => p.payment_evidence === "SETTLED").reduce((sum, p) => sum + BigInt(p.record.canonical_quote!.input.price), 0n).toString() : null,
    ledger_verification: "REPORTED_LEDGER_IS_NOT_TRANSFER_CALLBACK_PROOF" as const,
    expenses: report.expenses.map(e => ({ ...e, payment_evidence: byPair.get(`${e.capsule_id}:${e.request_id}`)?.payment_evidence ?? "SETTLEMENT_UNVERIFIED" })) });
}
export type EvidenceProjectReport = ReturnType<typeof attachReportEvidence>;
