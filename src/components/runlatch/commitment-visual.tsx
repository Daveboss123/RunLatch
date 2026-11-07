"use client";

import { QUOTES } from "@/lib/preview/fixtures";
import { budgetBreakdown, calculateCommitment } from "@/lib/purchasing/commitment";
import { formatNear, parseNear } from "@/lib/preview/money";
import { fillStyle } from "@/lib/dither/style";
import { BudgetPartition } from "./budget";
import { Status } from "./status";
import { useDemoState } from "./demo-state";

export function CommitmentVisual() {
  const { quoteIndex, selectQuote, budget: selectedBudget, setBudget } = useDemoState();
  const recurring = quoteIndex === 2;
  // Invalid free-form preview input never makes an invalid explainer ledger.
  let allocation = selectedBudget;
  try { if (BigInt(parseNear(allocation)) < BigInt(parseNear("0.7"))) allocation = "3"; } catch { allocation = "3"; }
  const q = QUOTES[recurring ? 2 : 1].input;
  const commitment = calculateCommitment(q);
  const budget = budgetBreakdown({ allocated: parseNear(allocation), spent: parseNear("0.5"), reserved: parseNear("0.2"), committed_future: "0" });
  const full = commitment.known_minimum_commitment!;
  const fits = BigInt(full) <= BigInt(budget.available_to_commit);
  return <div className="commitment-visual">
    <div className="capsule-account">
      <div className="capsule-account-top"><h3>Client Work Capsule</h3><span className="demo-tag">Hypothetical</span></div>
      <p>Booking website · infrastructure only</p>
       <div className="capsule-allocation"><label htmlFor="commitment-allocation">Hypothetical allocation</label><select id="commitment-allocation" value={allocation} onChange={event => setBudget(event.target.value)}>{!["3", "4"].includes(allocation) ? <option value={allocation}>{formatNear(parseNear(allocation))} NEAR</option> : null}<option value="3">3.00 NEAR</option><option value="4">4.00 NEAR</option></select></div>
      <dl className="capsule-balances"><div><dt>Settled</dt><dd>{formatNear(budget.spent)} NEAR</dd></div><div><dt>Reserved</dt><dd>{formatNear(budget.reserved)} NEAR</dd></div><div><dt>Available now</dt><dd>{formatNear(budget.available_now)} NEAR</dd></div><div><dt>Available to commit</dt><dd>{formatNear(budget.available_to_commit)} NEAR</dd></div></dl>
      <BudgetPartition budget={budget} />
      <div className="account-invariants"><code>available_now = allocated − spent − reserved</code><code>available_to_commit = available_now − committed_future</code></div>
      <dl className="capsule-scope"><div><dt>Allowed providers</dt><dd>Database & hosting fixtures</dd></div><div><dt>Scope</dt><dd>Infrastructure · one assigned agent</dd></div><div><dt>Fixture expiry</dt><dd>8 November 2026, 12:00 UTC</dd></div><div><dt>Authority</dt><dd>Immutable policy · current project revision</dd></div></dl>
    </div>
    <div className="commitment-exposure">
      <div className="quote-switch" role="group" aria-label="Compare canonical hosting quotes"><button aria-pressed={!recurring} onClick={() => selectQuote(1)}>One-time quote</button><button aria-pressed={recurring} onClick={() => selectQuote(2)}>12-month quote</button></div>
      <p className="commitment-question">Same first charge. Different obligation.</p>
      <dl className="commitment-totals"><div><dt>Due now</dt><dd>{formatNear(commitment.amount_due_now)}<span>NEAR</span></dd></div><div><dt>Full commitment</dt><dd>{formatNear(full)}<span>NEAR</span></dd></div></dl>
      <div className="commitment-term" data-recurring={recurring} role="img" aria-label={recurring ? "12 charges of 0.20 NEAR: 0.20 due now and 2.20 future; total 2.40 NEAR" : "One charge of 0.20 NEAR; no future commitment"}>{Array.from({ length: 12 }, (_, index) => <div key={index} data-included={recurring || index === 0} data-initial={index === 0}><i aria-hidden="true" style={fillStyle(index === 0 ? "solid" : "gradient", { color: index === 0 ? "ink" : "--dither-accent", from: .6, to: .2, length: 16 })} /><span>{index + 1}</span></div>)}</div>
      <div className="term-legend"><span>First payment</span><span>{recurring ? "11 future periods · 2.20 NEAR" : "No future periods"}</span></div>
      <div className="commitment-decision" key={`${recurring}:${allocation}`} aria-live="polite"><Status tone={!fits ? "bad" : recurring ? "pending" : "good"}>{!fits ? "Full commitment exceeds available authority" : recurring ? "Fits the budget · exact owner approval still required" : "Fits this illustrative budget"}</Status><p>{!fits ? `${formatNear(full)} NEAR does not fit inside ${formatNear(budget.available_to_commit)} NEAR available to commit. The first payment alone is not the test.` : recurring ? "Approval-pending holds no money. This explainer grants no approval and creates no obligation." : "The 0.20 NEAR price is all-inclusive for this one-time fixture quote."}</p></div>
       <p className="fine-print">Shared with the Gate preview, not the seeded project ledger. Canonical fixture quotes, native NEAR; monthly fixed term, no auto-renew, cancellation terms represented by a fixture hash. Unknown usage, uncapped fees and indefinite renewals are unsupported and denied. No renewal collection or supplier cancellation.</p>
    </div>
  </div>;
}
