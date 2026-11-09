"use client";

import { calculateCommitment } from "@/lib/purchasing/commitment";
import { RULE_LABELS } from "@/lib/preview/gate";
import { DEMO_CLOCK, QUOTES, SCENARIOS, SCENARIO_CATEGORIES } from "@/lib/preview/fixtures";
import { formatNear } from "@/lib/preview/money";
import { useDemoState } from "./demo-state";
import { ExecutionLabel } from "./execution-label";
import { Status } from "./status";
import { ArrowIcon } from "./icons";
import { fillStyle } from "@/lib/dither/style";

/** Three representative homepage cases; the full grouped catalogue lives on /gate. */
const COMPACT_SCENARIOS = ["valid", "tamper", "stale"] as const;

export function Simulator({ headingLevel = 3, variant = "full" }: { headingLevel?: 2 | 3; variant?: "full" | "compact" }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const GroupHeading = headingLevel === 2 ? "h3" : "h4";
  const { scenario, budget, quoteIndex, current, q, selected, preset, choose, selectQuote, setBudget } = useDemoState();
  const commitment = calculateCommitment(q);
  const result = current && "result" in current ? current.result : null;
  const tone = result?.decision === "DENIED" ? "bad" : result?.decision === "APPROVAL_REQUIRED" ? "pending" : "good";
  const failed = result?.reasons[0] ?? null;
  return <div className={`simulator-workbench${variant === "compact" ? " simulator-compact" : ""}`}>
    <div className="simulator-inputs">
      <div className="workbench-heading"><Heading>Client Work Capsule</Heading><span className="demo-tag">BROWSER_FIXTURE</span></div>
      <p className="quiet">Fictional booking website · one agent · infrastructure scope</p>
      <p className="fixture-clock">Frozen fixture clock: {DEMO_CLOCK.label}. Active quotes expire {DEMO_CLOCK.expiry_label}. Historical test data, not a live quote.</p>
      <div className="scenario-groups">{variant === "compact"
        ? <div><GroupHeading>Three representative cases</GroupHeading><div className="scenario-buttons" role="group" aria-label="Representative Gate scenarios">{SCENARIOS.filter(s => (COMPACT_SCENARIOS as readonly string[]).includes(s.id)).map(s => <button key={s.id} aria-pressed={scenario === s.id} onClick={() => choose(s.id)}>{s.label}</button>)}</div><a className="text-link scenario-more" href="/gate">Open the full Gate Lab: {SCENARIOS.length} scenarios<ArrowIcon /></a></div>
        : SCENARIO_CATEGORIES.map(category => <div key={category}><GroupHeading>{category}</GroupHeading><div className="scenario-buttons" role="group" aria-label={`${category} scenarios`}>{SCENARIOS.filter(s => s.category === category).map(s => <button key={s.id} aria-pressed={scenario === s.id} onClick={() => choose(s.id)}>{s.label}</button>)}</div></div>)}</div>
      {variant === "full" ? <div className="scenario-edge"><GroupHeading>Lifecycle edge cases</GroupHeading><a className="text-link" href="/demo#walkthrough-heading">Inspect success, failure & unknown callbacks<ArrowIcon /></a></div> : null}
      <p className="scenario-description">{selected.description}</p>
      <p className="scenario-expectation"><span>Expected rule</span> <code>{preset.reason ?? preset.expected}</code> · changing any input re-evaluates the local preview.</p>
      <a className="mobile-decision-link" href="#simulator-result">{result ? result.decision === "DENIED" ? "Request denied" : result.decision === "APPROVAL_REQUIRED" ? "Owner approval required" : "Eligible in simulation" : current && "error" in current ? "Check the allocation" : "Evaluating quote…"}<span>Inspect decision<ArrowIcon /></span></a>
      <div className="simulator-fields"><label htmlFor="sim-budget">Hypothetical capsule allocation<span className="input-with-unit"><input id="sim-budget" inputMode="decimal" value={budget} onChange={event => setBudget(event.target.value)} maxLength={40} aria-describedby="budget-help budget-error" aria-invalid={current !== null && "error" in current} /><span>NEAR</span></span></label>
      <label htmlFor="sim-quote">Canonical demo quote<select id="sim-quote" value={quoteIndex} onChange={event => selectQuote(Number(event.target.value))}>{QUOTES.map((quote, index) => <option key={quote.input.quote_id} value={index}>{quote.label}</option>)}</select></label></div>
      <p id="budget-help" className="fine-print">Already settled: 0.50 NEAR. Reserved: 0.20 NEAR. These are fixed demo inputs, not funds in a wallet.{scenario === "concurrent" ? " This case adds 1.30 NEAR reserved by an earlier concurrent request." : ""}</p>
      <p id="budget-error" className="field-error">{current && "error" in current ? current.error : ""}</p>
      <div className="quote-costs"><div><span>Due now</span><strong>{formatNear(commitment.amount_due_now)}<small>NEAR</small></strong></div><div><span>{q.recurring && commitment.bounded ? "12-month minimum" : "Full commitment"}</span><strong>{commitment.known_minimum_commitment === null ? "Unknown" : formatNear(commitment.known_minimum_commitment)}{commitment.known_minimum_commitment !== null ? <small>NEAR</small> : null}</strong></div></div>
      {!commitment.bounded ? <p className="terms-note">No supported finite term. Unknown exposure is a hard denial, even with a larger allocation. No renewal or cancellation service is implemented.</p> : q.recurring ? <p className="terms-note">0.20 NEAR per month × 12. Future portion: 2.20 NEAR. No auto-renew. Future demo obligation is contingent on initial payment; RunLatch does not collect renewals or cancel subscriptions.</p> : <p className="terms-note">All-inclusive one-time fixture price. Quantity: 1. Provider identity, recipient and terms come from the canonical demo quote.</p>}
      <button className="text-button reset" onClick={() => choose("valid")}>Reset simulation</button>
    </div>
    <div id="simulator-result" className="simulator-result" aria-busy={!current}>
      <div className="result-top"><span>Gate decision</span><code>TypeScript preview · BROWSER_FIXTURE</code></div>
      <div className="gate-decision-mark" data-decision={result?.decision ?? "PENDING"} data-dither="decision" aria-hidden="true"><i style={fillStyle("gradient", { color: result?.decision === "APPROVED" ? "--dither-accent" : "ink", from: .7, to: .15, length: 18 })} /><span /></div>
      <div role="status" aria-live="polite" aria-atomic="true" className="decision-announcement" data-decision={result?.decision}>
        {!current ? <><h3>Evaluating quote…</h3><p>Computing the local canonical hash. No payment is submitted.</p></> : "error" in current ? <><h3>Check the allocation</h3><p>The preview is unavailable until the input is valid. No authority changed.</p></> : <><Status tone={tone}>{current.result.decision === "APPROVED" ? "Eligible in simulation" : current.result.decision === "APPROVAL_REQUIRED" ? "Owner approval required" : "Request denied"}</Status><h3>{current.result.decision === "APPROVED" ? "Inside the boundary." : current.result.decision === "APPROVAL_REQUIRED" ? "The owner decides." : "The latch stays closed."}</h3><p>{current.result.decision === "APPROVED" ? `Would reserve ${formatNear(q.price)} NEAR before scheduling a transfer. This browser does neither.` : current.result.decision === "APPROVAL_REQUIRED" ? "An eligible recurring purchase needs exact owner approval. While waiting, it holds no money, quote or resource capacity." : scenario === "tamper" ? "The submitted quote hash differs from the canonical quote. A changed recipient cannot redirect payment." : scenario === "recurring" ? `The full ${formatNear(commitment.known_minimum_commitment!)} NEAR commitment exceeds the ${formatNear(current.balances.available_to_commit)} NEAR available to commit. A small first charge does not make it eligible.` : scenario === "concurrent" ? `An earlier request reserved 1.30 NEAR. Only ${formatNear(current.balances.available_now)} NEAR remains now, so this later request cannot reserve ${formatNear(q.price)} NEAR.` : "A mandatory rule failed. Owner approval cannot override a hard denial."}</p></>}
      </div>
      {current && "result" in current ? <>
        <dl className="preview-effect"><div><dt>Expected with preset inputs</dt><dd>{preset.expected}{preset.reason ? ` · ${preset.reason}` : ""}; changing inputs re-evaluates</dd></div><div><dt>Actual preview</dt><dd>{current.result.decision}</dd></div><div><dt>Failed rule</dt><dd><code>{failed ?? "None · all mandatory checks passed"}</code></dd></div><div><dt>Financial effect</dt><dd>{current.result.decision === "APPROVED" ? `Would hold ${formatNear(q.price)} NEAR now; ${formatNear(commitment.committed_future!)} future` : "No new reservation or commitment"}</dd></div></dl>
        <dl className="gate-inspection"><div><dt>Passed checks</dt><dd>{current.result.checks.filter(check => check.state === "PASSED").length} of {current.result.checks.length}</dd></div><div><dt>Reservation attempted</dt><dd>No</dd></div><div><dt>Transfer attempted</dt><dd>No</dd></div><div><dt>Outcome Receipt created</dt><dd>No</dd></div><div><dt>Contract state changed</dt><dd>None · browser inputs only</dd></div><div><dt>Execution provenance</dt><dd><code>BROWSER_FIXTURE</code></dd></div></dl>
        <dl className="request-summary"><div><dt>Attempted request</dt><dd><code>request-preview-01</code></dd></div><div><dt>Project / revision</dt><dd><code>booking-demo-01 / 1</code></dd></div><div><dt>Agent account</dt><dd><code>agent.fixture.testnet</code></dd></div><div><dt>Canonical quote / recipient</dt><dd><code>{q.quote_id} / {q.recipient_id}</code></dd></div><div><dt>Capsule scope</dt><dd>database & hosting · infrastructure only · quantity 1</dd></div><div><dt>Limits / threshold</dt><dd>{scenario === "concurrent" ? "1.30 NEAR per purchase · no numeric approval threshold in this interleaving fixture" : "1.00 NEAR per purchase · 0.60 NEAR approval threshold"}</dd></div></dl>
        <dl className="result-balances"><div><dt>Available now</dt><dd>{formatNear(current.balances.available_now)} NEAR</dd></div><div><dt>Available to commit</dt><dd>{formatNear(current.balances.available_to_commit)} NEAR</dd></div></dl>
        {current.result.reasons.length ? <ul className="reason-codes">{current.result.reasons.map(reason => <li key={reason}><code>{reason}</code></li>)}</ul> : <p className="passed-message"><Status tone="good">Mandatory preview checks passed</Status></p>}
        <details className="trace"><summary>Inspect {current.result.checks.length} policy checks<ArrowIcon /></summary><ol>{current.result.checks.map(check => <li key={check.rule}><span>{RULE_LABELS[check.rule]}</span><Status tone={check.state === "PASSED" ? "good" : check.state === "FAILED" ? "bad" : "neutral"}>{check.state === "NOT_EVALUATED" ? "Not evaluated" : check.state === "PASSED" ? "Passed" : "Failed"}</Status></li>)}</ol></details>
        <details className="trace quote-binding"><summary>Inspect quote binding<ArrowIcon /></summary><dl><dt>Canonical quote</dt><dd><code>{q.quote_id}</code></dd><dt>Canonical recipient (fictional)</dt><dd><code>{q.recipient_id}</code></dd><dt>Canonical demo hash</dt><dd><code>{current.hash}</code></dd><dt>Submitted demo hash</dt><dd><code>{current.submitted_hash}</code></dd></dl></details>
      </> : null}
      <div className="simulation-boundary"><ExecutionLabel /><p>TypeScript explains. Rust enforces.<br />No signature, transfer, reservation or owner approval is performed here.</p></div>
    </div>
  </div>;
}
