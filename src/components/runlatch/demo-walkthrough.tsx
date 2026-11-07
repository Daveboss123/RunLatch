"use client";

import { useState } from "react";
import { DEMO_DOMAIN, QUOTES, demoContext } from "@/lib/preview/fixtures";
import { commercialQuoteHash } from "@/lib/purchasing/hashing";
import { calculateCommitment, budgetBreakdown } from "@/lib/purchasing/commitment";
import { evaluateGate } from "@/lib/preview/gate";
import { formatNear } from "@/lib/preview/money";
import { Status } from "./status";

type Phase = "ready" | "eligible" | "denied" | "review" | "pending" | "settled" | "failed" | "unknown";
export function DemoWalkthrough() {
  const [scenario, setScenario] = useState("valid");
  const [phase, setPhase] = useState<Phase>("ready");
  const [callback, setCallback] = useState("success");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reasons, setReasons] = useState<readonly string[]>([]);
  const q = QUOTES[scenario === "recurring" ? 2 : 0].input;
  const commitment = calculateCommitment(q);
  const allocated = "3000000000000000000000000";
  const holding = phase === "pending" || phase === "unknown";
  const paid = phase === "settled";
  const balances = budgetBreakdown({ allocated, spent: paid ? q.price : "0", reserved: holding ? q.price : "0", committed_future: paid || holding ? commitment.committed_future! : "0" });
  const reset = () => { setPhase("ready"); setReasons([]); setError(""); };
  async function evaluate() {
    setBusy(true); setError("");
    try {
      const hash = await commercialQuoteHash({ input: q, publisher_id: q.recipient_id, schema_version: 2 }, DEMO_DOMAIN.network, DEMO_DOMAIN.contract);
      const context = demoContext(q, hash, "3", "valid");
      context.capsule.spent = "0"; context.capsule.reserved = "0";
      if (scenario === "tamper") context.expected_quote_hash = await commercialQuoteHash({ input: { ...q, recipient_id: "altered.fixture.testnet" }, publisher_id: q.recipient_id, schema_version: 2 }, DEMO_DOMAIN.network, DEMO_DOMAIN.contract);
      const result = evaluateGate(context);
      setReasons(result.reasons);
      setPhase(result.decision === "APPROVED" ? "eligible" : result.decision === "DENIED" ? "denied" : "review");
    } catch (error) { setError(error instanceof Error ? error.message : "The fixture could not be evaluated. Start a new fixture."); }
    finally { setBusy(false); }
  }
  const labels: Record<Phase, string> = { ready: "Ready to evaluate", eligible: "Eligible in simulation", denied: "Denied · no payment", review: "Owner approval required · no hold", pending: "Simulated pending reservation", settled: "Simulated settled payment", failed: "Simulated confirmed transfer failure", unknown: "Unproven callback · reservation retained" };
  const tone = phase === "denied" || phase === "failed" ? "bad" : phase === "pending" || phase === "unknown" || phase === "review" ? "pending" : phase === "settled" || phase === "eligible" ? "good" : "neutral";
  return <section className="demo-walkthrough" aria-labelledby="walkthrough-heading">
    <div className="section-heading"><div><h2 id="walkthrough-heading">Step through the control loop.</h2><p>A separate, resettable browser fixture. No contract, transfer or provider is called.</p></div><span className="demo-tag">Simulation only</span></div>
    <div className="walkthrough-grid"><div className="walkthrough-controls"><h3>One purchase, from a fresh capsule</h3><label>Purchase scenario<select disabled={busy || holding || paid} value={scenario} onChange={event => { setScenario(event.target.value); reset(); }}><option value="valid">Valid database quote</option><option value="tamper">Altered recipient hash</option><option value="recurring">Fixed 12-month commitment</option></select></label><dl className="detail-grid"><div><dt>Canonical quote</dt><dd><code>{q.quote_id}</code></dd></div><div><dt>Due now</dt><dd>{formatNear(q.price)} NEAR</dd></div><div><dt>Full commitment</dt><dd>{formatNear(commitment.known_minimum_commitment!)} NEAR</dd></div></dl>
      {phase === "ready" ? <button className="button" disabled={busy} onClick={() => void evaluate()}>{busy ? "Evaluating fixture…" : "Evaluate demo quote"}</button> : null}
      {phase === "eligible" ? <button className="button" onClick={() => setPhase("pending")}>Preview reservation</button> : null}
      {phase === "pending" ? <><label>Native callback fixture<select value={callback} onChange={event => setCallback(event.target.value)}><option value="success">Confirmed success</option><option value="failure">Confirmed transfer failure</option><option value="unknown">Missing or unproven callback</option></select></label><button className="button" onClick={() => setPhase(callback === "success" ? "settled" : callback === "failure" ? "failed" : "unknown")}>Apply callback fixture</button></> : null}
      {phase !== "ready" ? <button className="text-button" onClick={reset}>Start a new fixture</button> : null}
      {error ? <p role="alert" className="field-error">{error}</p> : null}
      <p className="fine-print">These controls change only illustrative browser state. “Apply callback fixture” is not a public settlement resolver. Starting a new fixture is not a real payment retry.</p>
    </div><div className="walkthrough-state"><div role="status" aria-live="polite"><Status tone={tone}>{labels[phase]}</Status></div><dl className="metrics walkthrough-metrics">{[["Allocated", balances.allocated], ["Settled", balances.spent], ["Reserved", balances.reserved], ["Committed future", balances.committed_future], ["Available now", balances.available_now], ["Available to commit", balances.available_to_commit]].map(([label, amount]) => <div key={label}><dt>{label}</dt><dd>{formatNear(amount)}<span>NEAR · simulated</span></dd></div>)}</dl>
      {reasons.length ? <ul className="reason-codes">{reasons.map(reason => <li key={reason}><code>{reason}</code></li>)}</ul> : null}
      {phase === "unknown" ? <p className="terms-note">Unknown is not failed. The simulated reservation stays held; there is no timeout release or resend.</p> : phase === "failed" ? <p className="terms-note">Only a confirmed transfer failure releases this fixture reservation. It does not become spent; a real retry needs a fresh quote and request.</p> : phase === "settled" ? <p className="terms-note">Payment is simulated settled. Provisioning: not evidenced. Objective check: not run here. Human acceptance: not recorded. A payment does not prove delivery.</p> : phase === "review" ? <p className="terms-note">The bounded recurring quote needs exact owner approval. This browser cannot approve it, and holds no money, quote or resource capacity.</p> : <p className="terms-note">Nothing shown here is a public NEAR transaction or actual escrow balance.</p>}
    </div></div>
  </section>;
}
