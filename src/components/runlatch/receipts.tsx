"use client";

import { useState } from "react";
import { PURCHASES, purchaseQuote, paymentLabel } from "@/lib/preview/purchases";
import { calculateCommitment } from "@/lib/purchasing/commitment";
import { formatNear } from "@/lib/preview/money";
import { Tabs } from "./tabs";
import { Status } from "./status";
import { fillStyle } from "@/lib/dither/style";
import { useDemoState } from "./demo-state";

const layers = ["Mandate", "Quote", "Policy decision", "Payment", "Provider evidence", "Validation", "Human acceptance"] as const;

export function Receipts() {
  const { receipt: active, setReceipt: setActive } = useDemoState();
  const [layer, setLayer] = useState<(typeof layers)[number]>("Mandate");
  const purchase = PURCHASES[active === "database" ? 0 : active === "pending" ? 1 : 2];
  const q = purchaseQuote(purchase);
  const full = calculateCommitment(q);
  const evidence: Record<(typeof layers)[number], readonly (readonly [string, string])[]> = {
    Mandate: [["Project", "Fictional booking website"], ["Capsule / revision", "Demo capsule · project revision 1"], ["Authority source", "Seeded browser data; Rust requires owner-authenticated state"], ["Policy", "Immutable per capsule; agent cannot amend it"]],
    Quote: [["Canonical quote ID", q.quote_id], ["Recipient (fictional)", q.recipient_id], ["Asset", "Native NEAR · no fiat peg"], ["Amount, yoctoNEAR", q.price], ["Terms", q.recurring ? "Fixed minimum term; no auto-renew" : "One-time, quantity 1"]],
    "Policy decision": [["Seeded decision", purchase.decision], ["Reason", purchase.reason], ["Authority boundary", "Browser preview cannot authorize a transfer"], ["Replay", "Original records cannot be overwritten by repeated requests"]],
    Payment: [["Seeded payment state", paymentLabel(purchase)], ["Transaction / callback reference", "Unavailable · no public chain observation"], ["What it proves here", "Only the selected fictional state, not actual settlement"], ["Pending handling", "An unknown callback retains the reservation; no timeout release"]],
    "Provider evidence": [["Provisioning", purchase.provision === "FIXTURE_OBSERVED" ? "Controlled fixture observed" : "Not evidenced"], ["Source", "Off-chain browser fixture, not an external provider"], ["Evidence digest", "Unavailable · no invented digest"], ["Truth boundary", "A hash detects changes; it does not prove delivery"]],
    Validation: [["Objective check", purchase.check === "FIXTURE_PASSED" ? "Seeded fixture passed" : "Not checked"], ["Profile", "website-resource-fixture-v1"], ["Human acceptance", "Not recorded · separate authenticated decision"], ["What it does not prove", "Independent delivery, usefulness or client satisfaction"]],
    "Human acceptance": [["Decision", "Not recorded"], ["Reviewer", "Unavailable · no authenticated owner action in this browser"], ["Binding", "Rust binds acceptance to the exact outcome and evidence snapshot"], ["Limit", "Owner acceptance is not automatically client acceptance"]],
  };
  return <div className="receipt-example" data-record={purchase.id}><Tabs id="receipts" label="Outcome Receipt examples" options={[{ value: "database", label: "Settled purchase" }, { value: "pending", label: "Pending payment" }, { value: "denied", label: "Denied request" }]} active={active} onChange={setActive}>
    <div className="receipt-paper"><div className="receipt-heading"><div><span className="quiet">Outcome Receipt</span><h3>{purchase.title}</h3><code>{purchase.id}</code></div><div className="receipt-meta"><span className="demo-tag">Seeded example</span><div className="receipt-seal" data-dither="receipt" aria-hidden="true" style={fillStyle("gradient", { color: "ink", from: .3, to: 0, length: 14 })} /></div></div>
      <dl className="receipt-cost"><div><dt>Due now</dt><dd>{formatNear(q.price)} NEAR</dd></div><div><dt>Full commitment</dt><dd>{formatNear(full.known_minimum_commitment!)} NEAR</dd></div><div><dt>Project revision</dt><dd>1 · demo</dd></div></dl>
      <ol className="receipt-lifecycle">
        <li><span className="lifecycle-node">1</span><div><strong>Authorization</strong><p>{purchase.decision === "APPROVED" ? "Within the seeded capsule's rules" : purchase.reason}</p></div><Status tone={purchase.decision === "DENIED" ? "bad" : "good"}>{purchase.decision === "DENIED" ? "Denied" : "Approved"}</Status></li>
        <li><span className="lifecycle-node">2</span><div><strong>Payment</strong><p>{purchase.payment === "SETTLED" ? "Seeded settled state, not a chain observation" : purchase.payment === "SETTLEMENT_PENDING" ? "Reservation retained; callback outcome unknown" : "No transfer or reservation for this denied request"}</p></div><Status tone={purchase.payment === "SETTLED" ? "good" : purchase.payment === "SETTLEMENT_PENDING" ? "pending" : "neutral"}>{paymentLabel(purchase)}</Status></li>
        <li><span className="lifecycle-node">3</span><div><strong>Provisioning</strong><p>{purchase.provision === "FIXTURE_OBSERVED" ? "Controlled resource-manifest fixture, not a real database" : "No provisioning evidence in this example"}</p></div><Status tone={purchase.provision === "FIXTURE_OBSERVED" ? "good" : "neutral"}>{purchase.provision === "FIXTURE_OBSERVED" ? "Fixture observed" : "Not evidenced"}</Status></li>
        <li><span className="lifecycle-node">4</span><div><strong>Objective check</strong><p>{purchase.check === "FIXTURE_PASSED" ? "Seeded website-resource-fixture-v1 check; no endpoint contacted" : "No objective result for this purchase"}</p></div><Status tone={purchase.check === "FIXTURE_PASSED" ? "good" : "neutral"}>{purchase.check === "FIXTURE_PASSED" ? "Fixture passed" : "Not checked"}</Status></li>
        <li><span className="lifecycle-node">5</span><div><strong>Human acceptance</strong><p>A separate authenticated decision, never implied by a check.</p></div><Status>Not recorded</Status></li>
      </ol>
      <div className="evidence-inspector"><h4>Inspect the evidence layer</h4><div className="evidence-selector" role="group" aria-label="Receipt evidence layers">{layers.map(item => <button key={item} aria-pressed={layer === item} aria-controls="receipt-layer-detail" onClick={() => setLayer(item)}>{item}</button>)}</div><div id="receipt-layer-detail" className="evidence-detail" key={`${active}:${layer}`}><p>{layer} <span>· seeded source, not live evidence</span></p><dl>{evidence[layer].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p className="fine-print">Seeded observation: {purchase.observed}</p></div></div>
      <details className="receipt-source"><summary>Inspect source & exact amounts</summary><dl className="detail-grid"><div><dt>Quote ID</dt><dd><code>{q.quote_id}</code></dd></div><div><dt>Amount due now, yoctoNEAR</dt><dd><code>{q.price}</code></dd></div><div><dt>Source</dt><dd>Browser demo data · fictional project</dd></div><div><dt>Transaction / evidence digest</dt><dd>Unavailable; no fabricated reference</dd></div><div><dt>Seeded observation time</dt><dd>{purchase.observed}</dd></div><div><dt>Policy reference</dt><dd>Demo capsule · immutable authority in Rust</dd></div></dl></details>
    </div>
  </Tabs></div>;
}
