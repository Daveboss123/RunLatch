import { QUOTES } from "./fixtures.ts";

export interface DemoPurchase {
  id: string; quote_index: number; title: string; purpose: string; decision: "APPROVED" | "DENIED";
  payment: "SETTLED" | "SETTLEMENT_PENDING" | "NOT_ATTEMPTED";
  provision: "FIXTURE_OBSERVED" | "NOT_EVIDENCED"; check: "FIXTURE_PASSED" | "NOT_CHECKED";
  reason: string; observed: string;
}
export const PURCHASES: readonly DemoPurchase[] = [
  { id: "purchase-db-demo-01", quote_index: 0, title: "Database instance", purpose: "Store booking requests", decision: "APPROVED", payment: "SETTLED", provision: "FIXTURE_OBSERVED", check: "FIXTURE_PASSED", reason: "Within capsule authority", observed: "7 Nov 2026, 12:02 UTC" },
  { id: "purchase-host-demo-01", quote_index: 1, title: "Website hosting", purpose: "Serve the booking website", decision: "APPROVED", payment: "SETTLEMENT_PENDING", provision: "NOT_EVIDENCED", check: "NOT_CHECKED", reason: "Callback outcome not observed", observed: "7 Nov 2026, 12:04 UTC" },
  { id: "purchase-term-demo-01", quote_index: 2, title: "12-month hosting plan", purpose: "Alternative hosting proposal", decision: "DENIED", payment: "NOT_ATTEMPTED", provision: "NOT_EVIDENCED", check: "NOT_CHECKED", reason: "INSUFFICIENT_COMMITMENT_BUDGET", observed: "7 Nov 2026, 12:05 UTC" },
];
export const paymentLabel = (purchase: DemoPurchase) => ({ SETTLED: "Settled", SETTLEMENT_PENDING: "Settlement pending", NOT_ATTEMPTED: "Not attempted" })[purchase.payment];
export const purchaseQuote = (purchase: DemoPurchase) => QUOTES[purchase.quote_index].input;
