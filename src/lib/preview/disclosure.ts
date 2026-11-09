import { DEMO_BUDGET } from "./fixtures.ts";
import { PURCHASES, purchaseQuote } from "./purchases.ts";
import { calculateCommitment } from "../purchasing/commitment.ts";
import { BROWSER_EXECUTION } from "../execution.ts";

export interface Disclosure { budget: boolean; expenses: boolean; evidence: boolean }
export const EMPTY_DISCLOSURE: Disclosure = { budget: false, expenses: false, evidence: false };
/** Only pre-reviewed fictional fixtures; not a signed owner/project report. */
export function demoDisclosure(selection: Disclosure) {
  return {
    source: "BROWSER_SIMULATION" as const, title: "Fictional booking website · demo report", period: "7 November 2026 · one project",
    execution: BROWSER_EXECUTION,
    financials: selection.budget ? { ...DEMO_BUDGET, asset: "near-native" } : null,
    expenses: selection.expenses ? PURCHASES.map(p => ({ resource: p.title, purpose: p.purpose, provider_id: purchaseQuote(p).provider_id,
      service_id: purchaseQuote(p).service_id, due_now: purchaseQuote(p).price,
      commitment: calculateCommitment(purchaseQuote(p)).known_minimum_commitment, decision: p.decision, payment: p.payment,
      evidence: selection.evidence ? { provisioning: p.provision, check: p.check, human_acceptance: "NOT_RECORDED" } : null })) : [],
    evidence_included: selection.expenses && selection.evidence,
    limitations: "Seeded preview only. No actual owner approval, public transaction, supplier event, client acceptance or share link.",
  };
}
