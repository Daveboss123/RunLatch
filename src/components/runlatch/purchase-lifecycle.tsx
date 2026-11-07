"use client";

import { useState } from "react";
import { Status } from "./status";
import { useDemoState } from "./demo-state";
import { PURCHASES, paymentLabel } from "@/lib/preview/purchases";

const stages = [
  { title: "Authorize", state: "Human authority", detail: "The owner defines current project authority and an immutable capsule policy. The agent cannot raise its budget or approve itself." },
  { title: "Verify quote", state: "Canonical terms", detail: "The Rust Gate loads the registered quote, authenticates the caller and checks scope, freshness, uniqueness and full commitment." },
  { title: "Reserve", state: "Immediate hold", detail: "An eligible, exactly approved request atomically reserves only the initial native transfer. Future commitment is retained separately." },
  { title: "Submit", state: "Not settlement", detail: "Scheduling a transfer or seeing RPC inclusion does not prove the native payment succeeded. The reservation remains pending." },
  { title: "Reconcile", state: "Actual callback outcome", detail: "Confirmed success moves reserved funds to spent. Confirmed failure releases the purchase reservation. Unknown or unproven callbacks retain the hold: no timeout resend." },
  { title: "Provision", state: "Separate delivery evidence", detail: "A resource manifest or provisioning observation is separate from payment. Current demo adapters are controlled fixtures, not real database or hosting providers." },
  { title: "Check", state: "Objective result", detail: "An objective check records what its bounded inputs show. A fixture pass is not independent proof of real-world delivery or usefulness." },
  { title: "Accept", state: "Explicit human decision", detail: "Human acceptance is an authenticated record of its own. Neither settlement nor an objective check implies that the client accepted the work." },
] as const;

export function PurchaseLifecycle() {
  const [active, setActive] = useState(3);
  const { receipt, setReceipt } = useDemoState();
  const purchase = PURCHASES[receipt === "database" ? 0 : receipt === "pending" ? 1 : 2];
  return <div className="purchase-lifecycle" data-record={purchase.id}>
    <div className="lifecycle-selection"><span>Inspect a seeded record</span><div role="group" aria-label="Lifecycle receipt example">{[{value:"database",label:"Settled example"},{value:"pending",label:"Pending example"},{value:"denied",label:"Denied example"}].map(item=><button key={item.value} aria-pressed={receipt===item.value} onClick={()=>setReceipt(item.value)}>{item.label}</button>)}</div></div>
    <div className="lifecycle-tracks">{[{label:"Financial authority & payment",from:0,to:5},{label:"Delivery & acceptance",from:5,to:8}].map(track=><div key={track.label}><h3>{track.label}</h3><ol className="lifecycle-rail" start={track.from+1} aria-label={track.label}>{stages.slice(track.from,track.to).map((stage,offset)=>{const index=track.from+offset;return <li key={stage.title}><button aria-pressed={active===index} onClick={()=>setActive(index)}><span>{index+1}</span><strong>{stage.title}</strong></button></li>;})}</ol></div>)}</div>
    <div className="lifecycle-record"><strong>{purchase.title}</strong><span>Financial: {purchase.decision} · {paymentLabel(purchase)}</span><span>Delivery: {purchase.provision === "FIXTURE_OBSERVED" ? "Fixture observed / fixture check passed" : "Not evidenced / not checked"} · acceptance not recorded</span></div>
    <div className="lifecycle-explanation" key={active}><Status tone={active === 3 || active === 4 ? "pending" : "neutral"}>{stages[active].state}</Status><p>{stages[active].detail}</p><span className="fine-print">Stage explanation, not progress. Selected record is shared with the Outcome Receipt below; no live event stream.</span></div></div>;
}
