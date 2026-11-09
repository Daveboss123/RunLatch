"use client";

import { useEffect, useState } from "react";
import { DEMO_BUDGET } from "@/lib/preview/fixtures";
import { PURCHASES, paymentLabel, purchaseQuote } from "@/lib/preview/purchases";
import { calculateCommitment } from "@/lib/purchasing/commitment";
import { formatNear } from "@/lib/preview/money";
import { fillStyle } from "@/lib/dither/style";
import { BudgetPartition } from "./budget";
import { Status } from "./status";
import { ArrowIcon } from "./icons";
import { useDemoState } from "./demo-state";

export function RunBoard({ dashboard = false }: { dashboard?: boolean }) {
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const { setReceipt } = useDemoState();
  const rows = PURCHASES.filter(p => filter === "all" || p.payment === filter);
  const purchase = PURCHASES.find(p => p.id === selected);
  useEffect(() => { if (purchase) setReceipt(purchase.payment === "SETTLED" ? "database" : purchase.payment === "SETTLEMENT_PENDING" ? "pending" : "denied"); }, [purchase, setReceipt]);
  const metrics = [
    ["Allocated", DEMO_BUDGET.allocated], ["Settled", DEMO_BUDGET.spent], ["Reserved", DEMO_BUDGET.reserved],
    ["Committed future", DEMO_BUDGET.committed_future], ["Available now", DEMO_BUDGET.available_now], ["Available to commit", DEMO_BUDGET.available_to_commit],
  ];
  return <div className={`run-board ${dashboard ? "board-dashboard" : ""}`}>
    <div className="board-top"><div><span className="board-agency">Northstar Studio <span className="quiet">/</span> ACME Demo Client</span><h3>Automated Booking Website</h3><p>One project. One Client Work Capsule. A visible spending boundary.</p></div><span className="demo-tag">Demo data</span></div>
    <div className="board-meta"><span>Project <code>booking-demo-01</code></span><span>Revision <code>1</code></span><Status tone="good">Capsule active · seeded</Status><span className="meta-right">Unit: native NEAR<span className="meta-separator" aria-hidden="true"> · </span>Execution: browser fixture</span></div>
    <dl className="metrics">{metrics.map(([label, value]) => <div key={label} className={label === "Available to commit" ? "metric-available" : ""}><dt>{label}</dt><dd>{formatNear(value)}<span>NEAR</span></dd></div>)}</dl>
    <BudgetPartition budget={DEMO_BUDGET} />
    <div className="board-table-heading"><h4>Purchases & requests</h4><label>Show<select value={filter} onChange={event => { setFilter(event.target.value); setSelected(null); }} aria-label="Filter purchases"><option value="all">All requests</option><option value="SETTLED">Settled</option><option value="SETTLEMENT_PENDING">Pending settlement</option><option value="NOT_ATTEMPTED">Not attempted</option><option value="SETTLEMENT_FAILED">Failed settlement</option></select></label></div>
    {rows.length ? <><div className="table-scroll" role="region" aria-label="Demo purchase table; scroll horizontally on small screens" tabIndex={0}><table>
      <caption className="sr-only">Fictional project purchases, not live transactions. Amounts in native NEAR.</caption>
      <thead><tr><th scope="col">Resource / purpose</th><th scope="col">Due now</th><th scope="col">Full commitment</th><th scope="col">Decision</th><th scope="col">Payment</th><th scope="col"><span className="sr-only">Inspect</span></th></tr></thead>
      <tbody>{rows.map(p => { const q = purchaseQuote(p), c = calculateCommitment(q); return <tr key={p.id} className={selected === p.id ? "row-selected" : ""}>
        <th scope="row">{p.title}<span>{p.purpose}</span></th><td className="amount">{formatNear(q.price)}</td><td className="amount">{formatNear(c.known_minimum_commitment!)}<span>{q.recurring ? "12-month minimum" : "One-time"}</span></td><td><Status tone={p.decision === "DENIED" ? "bad" : "good"}>{p.decision === "DENIED" ? "Denied" : "Approved"}</Status></td><td><Status tone={p.payment === "SETTLED" ? "good" : p.payment === "SETTLEMENT_PENDING" ? "pending" : "neutral"}>{paymentLabel(p)}</Status></td><td><button className="inspect-button" aria-expanded={selected === p.id} aria-controls="board-inspector" aria-label={`Inspect ${p.title}`} onClick={() => setSelected(selected === p.id ? null : p.id)}><ArrowIcon /></button></td>
      </tr>; })}</tbody>
    </table></div><ul className="mobile-purchases" aria-label="Demo purchase requests">{rows.map(p => { const q = purchaseQuote(p), c = calculateCommitment(q); return <li key={p.id} className={selected === p.id ? "row-selected" : ""}><div className="mobile-purchase-title"><div><h4>{p.title}</h4><p>{p.purpose}</p></div><button className="inspect-button" aria-label={`Inspect ${p.title}`} aria-expanded={selected === p.id} aria-controls="board-inspector" onClick={() => setSelected(selected === p.id ? null : p.id)}><ArrowIcon /></button></div><dl><div><dt>Due now</dt><dd>{formatNear(q.price)} NEAR</dd></div><div><dt>Full commitment</dt><dd>{formatNear(c.known_minimum_commitment!)} NEAR</dd></div><div><dt>Decision</dt><dd><Status tone={p.decision === "DENIED" ? "bad" : "good"}>{p.decision === "DENIED" ? "Denied" : "Approved"}</Status></dd></div><div><dt>Payment</dt><dd><Status tone={p.payment === "SETTLED" ? "good" : p.payment === "SETTLEMENT_PENDING" ? "pending" : "neutral"}>{paymentLabel(p)}</Status></dd></div></dl></li>; })}</ul></> : <div className="empty-state"><div aria-hidden="true" className="empty-texture" data-dither="interface" style={fillStyle("gradient", { color: "grey", from: .25, to: 0, length: 24 })} /><h4>No failed settlements in this demo</h4><p>This sample has a pending payment, not a confirmed failure.</p><button className="text-button" onClick={() => setFilter("all")}>Show all requests</button></div>}
     <div id="board-inspector" className={purchase ? "board-inspector" : ""}>
      {purchase ? <><div className="inspector-title"><h4>{purchase.title}: decision detail</h4><button className="text-button" onClick={() => setSelected(null)}>Close detail</button></div><p className={purchase.decision === "DENIED" ? "danger-text" : ""}>{purchase.reason}</p><dl className="detail-grid"><div><dt>Request</dt><dd><code>{purchase.id}</code></dd></div><div><dt>Canonical quote</dt><dd><code>{purchaseQuote(purchase).quote_id}</code></dd></div><div><dt>Provisioning evidence</dt><dd>{purchase.provision === "FIXTURE_OBSERVED" ? "Seeded fixture observation" : "Not evidenced"}</dd></div><div><dt>Objective check</dt><dd>{purchase.check === "FIXTURE_PASSED" ? "Seeded resource fixture passed" : "Not checked"}</dd></div><div><dt>Human acceptance</dt><dd>Not recorded</dd></div><div><dt>Transaction reference</dt><dd>Unavailable · simulated record</dd></div></dl><p className="fine-print">Seeded timestamp: {purchase.observed}. This is inspectable demo data, not an observed network event.</p></> : null}
    </div>
    <div className="board-bottom"><span>Approval is not settlement. Settlement is not delivery.</span><span>No wallet connected</span></div>
  </div>;
}
