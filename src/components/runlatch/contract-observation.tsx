"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { approvalReview, importLocalObservation, quoteExposure, type LocalObservation, type ObservedPurchase } from "@/lib/near/observation";
import { proposalFromQuote, type Proposal } from "@/lib/near/records";
import { Status } from "./status";

const MAX_FILE_BYTES = 1_048_576;
const words = (code: string) => code.toLowerCase().replaceAll("_", " ");
const tone = (code: string) => code === "SETTLED" || code === "VALIDATION_PASSED" || code === "ACCEPTED" ? "good" as const
  : ["DENIED", "SETTLEMENT_FAILED", "VALIDATION_FAILED", "VALIDATION_ERROR", "REJECTED"].includes(code) ? "bad" as const
    : ["APPROVAL_PENDING", "SETTLEMENT_PENDING", "SETTLEMENT_UNVERIFIED"].includes(code) ? "pending" as const : "neutral" as const;

function OwnerReview({ observation, purchase }: { observation: LocalObservation; purchase: ObservedPurchase }) {
  const [review, setReview] = useState<ReturnType<typeof approvalReview> | null>(null);
  const [error, setError] = useState("");
  function inspect() {
    setReview(null); setError("");
    try {
      const p = purchase.record;
      setReview(approvalReview(observation, p.proposal.capsule_id, p.proposal.request_id, p.request_hash));
    } catch { setError("This recorded request is not reviewable at the imported block: authority, expiry, quote or approval binding is no longer eligible. No funds moved."); }
  }
  return <div className="observation-review">
    <button type="button" className="button button-secondary" onClick={inspect}>Inspect exact owner approval</button>
    {error ? <p role="alert">{error}</p> : null}
    {review ? <><p>Historical owner review only. Immediate charge: {review.exposure.amount_due_now} yoctoNEAR. Known minimum commitment: {review.exposure.known_minimum_commitment ?? "unknown"} yoctoNEAR.</p>
      <dl className="observation-fields"><div><dt>Owner</dt><dd><code>{review.account_id}</code></dd></div><div><dt>Canonical recipient</dt><dd><code>{review.canonical_recipient}</code></dd></div><div><dt>Owner method deposit</dt><dd>1 yoctoNEAR, separate from purchase price</dd></div></dl>
      <pre aria-label="Exact unsigned owner approval">{JSON.stringify({ method: review.method, contract_id: review.contract_id, args: review.args, deposit_yocto: review.deposit_yocto, signing_enabled: false }, null, 2)}</pre>
      <p role="status">Review prepared, not approved or signed. Rust must re-check current state at execution.</p></> : null}
  </div>;
}

function ProposalReview({ observation }: { observation: LocalObservation }) {
  const [quoteId, setQuoteId] = useState(observation.quotes[0].terms.input.quote_id);
  const [capsuleId, setCapsuleId] = useState(observation.capsules[0].capsule_id);
  const [requestId, setRequestId] = useState("");
  const [draft, setDraft] = useState<Proposal | null>(null);
  const [error, setError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setDraft(null);
    const capsule = observation.capsules.find(c => c.capsule_id === capsuleId);
    const quote = observation.quotes.find(q => q.terms.input.quote_id === quoteId);
    try {
      if (!capsule || !quote) throw new Error("UNKNOWN_RECORD");
      const proposal = proposalFromQuote(observation.project_id, capsule.project_revision, capsuleId, requestId, quote);
      if (observation.purchases.some(p => p.record.proposal.capsule_id === capsuleId && p.record.proposal.request_id === requestId)) throw new Error("REQUEST_EXISTS");
      setDraft(proposal); setError("");
    } catch { setError("Use a new request ID: 1–64 letters, numbers, underscores or hyphens. This draft is not submitted."); }
  }
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  return <details className="observation-proposal"><summary>Inspect an IDs-only agent draft</summary>
    <p>Read a registered quote, then prepare the exact envelope. There are no receiver, price or authority override fields. This does not request a new quote from a live vendor or call the contract.</p>
    <form onSubmit={prepare} noValidate>
      <label>Recorded capsule<select value={capsuleId} onChange={e => { setCapsuleId(e.target.value); setDraft(null); }}>{observation.capsules.map(c => <option key={c.capsule_id}>{c.capsule_id}</option>)}</select></label>
      <label>Registered quote<select value={quoteId} onChange={e => { setQuoteId(e.target.value); setDraft(null); }}>{observation.quotes.map(q => <option key={q.terms.input.quote_id}>{q.terms.input.quote_id}</option>)}</select></label>
      <label htmlFor="observation-request-id">New request ID</label><input id="observation-request-id" value={requestId} maxLength={64} autoComplete="off" spellCheck={false} aria-invalid={Boolean(error)} aria-describedby="observation-draft-help observation-draft-error" onChange={e => { setRequestId(e.target.value); setDraft(null); setError(""); }} />
      <p id="observation-draft-help">IDs only; preparing a draft neither validates current authority nor reserves funds.</p>
      <p ref={errorRef} id="observation-draft-error" role={error ? "alert" : undefined} tabIndex={-1}>{error}</p>
      <button type="submit" className="button button-secondary">Prepare unsigned agent draft</button>
    </form>
    {draft ? <><pre aria-label="Unsigned agent proposal">{JSON.stringify(draft, null, 2)}</pre><p role="status">Draft prepared. No submit_purchase call, signature or reservation.</p></> : null}
  </details>;
}

function ObservationRecords({ observation }: { observation: LocalObservation }) {
  const financials = observation.report.financials;
  return <div className="observation-records">
    <div className="observation-source"><Status>Imported LOCAL Sandbox records</Status><p>Not public NEAR testnet. Internal consistency checked; not independently verified chain truth. Providers are controlled demo adapters, not external API vendors.</p></div>
    <dl className="observation-fields">
      <div><dt>Project</dt><dd><code>{observation.project_id}</code></dd></div><div><dt>Contract in imported records</dt><dd><code>{observation.contract_id}</code></dd></div>
      <div><dt>Recorded block</dt><dd><code>{observation.block_hash}</code></dd></div><div><dt>Recorded time (nanoseconds)</dt><dd><code>{observation.observed_at_ns}</code></dd></div>
    </dl>
    <h3>Reported project balances</h3><p>All amounts are integer yoctoNEAR (10²⁴ yoctoNEAR = 1 NEAR). Derived from the imported ledger, not independently verified balances. {observation.report.coverage.complete_project ? "All recorded project capsules included." : "Partial capsule coverage only."}</p>
    {financials ? <dl className="observation-balances">{([
      ["Allocated", financials.allocated], ["Spent", financials.spent], ["Reserved now", financials.reserved], ["Future commitment", financials.committed_future],
      ["Available now", financials.available_now], ["Available to commit", financials.available_to_commit],
    ] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : null}
    <p className="fine-print">Available now = allocated − spent − reserved. Available to commit also subtracts future commitments. Clearing this view never changes funds.</p>
    <ul className="observation-capsules">{observation.capsules.map(c => <li key={c.capsule_id}><code>{c.capsule_id}</code><span>Capsule {words(c.status)}; project {words(c.project_status)}. Mandate revision {c.project_revision}; current project revision {c.current_project_revision}.</span></li>)}</ul>
    <details className="observation-catalogue"><summary>Registered providers and canonical quotes ({observation.providers.length} providers, {observation.quotes.length} quotes)</summary>
      {observation.providers.map(p => <div className="observation-provider" key={p.provider_id}><h4>{p.provider_id}</h4><p>{p.provider_id === "failure-fixture" ? "Labelled failed-payment fixture" : "Controlled LOCAL demo provider adapter"}. Registration {p.active ? "active" : "suspended"}. Publisher <code>{p.publisher_id}</code>; recipient <code>{p.recipient_id}</code>.</p>
        {observation.quotes.filter(q => q.terms.input.provider_id === p.provider_id).map(q => { const exposure = quoteExposure(q); return <details key={q.terms.input.quote_id}><summary>{q.terms.input.quote_id} — {q.consumed ? "consumed" : "unconsumed"}</summary>
          <dl className="observation-fields"><div><dt>Service / category</dt><dd>{q.terms.input.service_id} / {q.terms.input.category}</dd></div><div><dt>Canonical recipient</dt><dd><code>{q.terms.input.recipient_id}</code></dd></div>
            <div><dt>Immediate charge (yoctoNEAR)</dt><dd>{exposure.amount_due_now}</dd></div><div><dt>Known minimum commitment (yoctoNEAR)</dt><dd>{exposure.known_minimum_commitment ?? "Unknown — no automatic authority"}</dd></div>
            <div><dt>Quote hash</dt><dd><code>{q.quote_hash}</code></dd></div><div><dt>Expiry (nanoseconds)</dt><dd>{q.terms.input.expires_at_ns} ({BigInt(observation.observed_at_ns) >= BigInt(q.terms.input.expires_at_ns) ? "expired at recorded block" : "not expired at recorded block"})</dd></div></dl>
          <pre aria-label={`Canonical terms ${q.terms.input.quote_id}`}>{JSON.stringify(q.terms, null, 2)}</pre></details>; })}
        {!observation.quotes.some(q => q.terms.input.provider_id === p.provider_id) ? <p>No quotes for this provider in the selected project bundle.</p> : null}
      </div>)}
    </details>
    <h3>Purchase records and outcome evidence</h3><p>Payment evidence requires a matching native-transfer outcome and a successful private callback. A transaction ID, source label or scheduled transfer alone does not prove settlement.</p>
    <ul className="observation-purchases">{observation.purchases.map(p => {
      const record = p.record, expense = observation.report.expenses.find(e => e.capsule_id === record.proposal.capsule_id && e.request_id === record.proposal.request_id);
      return <li key={`${record.proposal.capsule_id}:${record.proposal.request_id}`}><details><summary><span><code>{record.proposal.request_id}</code><small>{record.canonical_quote?.input.service_id ?? "No canonical quote recorded"}</small></span><Status tone={tone(p.payment_evidence === "NOT_ATTEMPTED" ? record.status : p.payment_evidence)}>{words(p.payment_evidence === "NOT_ATTEMPTED" ? record.status : p.payment_evidence)}</Status></summary>
        <dl className="observation-fields"><div><dt>Reported purchase status</dt><dd>{words(record.status)}</dd></div><div><dt>Payment evidence in this file</dt><dd>{words(p.payment_evidence)}</dd></div>
          <div><dt>Immediate reservation (yoctoNEAR)</dt><dd>{record.reserved_amount}</dd></div><div><dt>Future commitment (yoctoNEAR)</dt><dd>{record.committed_future_amount}</dd></div>
          <div><dt>Gate reasons</dt><dd>{record.reason_codes.length ? record.reason_codes.join(", ") : "No denial reasons recorded"}</dd></div><div><dt>Request hash</dt><dd><code>{record.request_hash}</code></dd></div>
          {expense && "provisioning_status" in expense ? <><div><dt>Provisioning observation</dt><dd>{words(expense.provisioning_status)} ({expense.provisioning_trust_class ? words(expense.provisioning_trust_class) : "no evidence"})</dd></div>
            <div><dt>Objective task check</dt><dd>{words(expense.task_check_status)}; {words(expense.task_check_scope)}</dd></div><div><dt>Explicit owner outcome action</dt><dd>{words(expense.human_acceptance)}. Not real client acceptance. {expense.human_acceptance !== "NOT_RECORDED" ? expense.acceptance_matches_current_evidence ? "Matches recorded evidence." : "Does not match current evidence." : ""}</dd></div></> : null}
        </dl><p>Observed initiating milestones: {p.milestones.length ? p.milestones.map(words).join(" → ") : "not evidenced in this file"}. These are receipt milestones, not timer-generated states.</p>
        <p>{p.payment_evidence === "SETTLEMENT_UNVERIFIED" ? "Settlement is unverified: the ledger reports a resolution, but matching transfer/callback proof is missing. No resend or release is enabled." : record.status === "APPROVAL_PENDING" ? "Approval-pending holds no money, quote capacity or resource. Rejection, cancellation or expiry releases nothing." : record.status === "SETTLEMENT_PENDING" ? "Reservation retained. Timeout, expiry, revocation or a browser error cannot release it or trigger a resend." : record.status === "SETTLEMENT_FAILED" ? "Confirmed native transfer failure releases the exact purchase reservation only in a healthy callback. This is not a refund for task quality." : record.status === "SETTLED" ? "Confirmed payment is separate from provisioning, checks and owner acceptance. Poor quality does not reverse settlement." : "No payment or reservation for this request. A denial cannot be overridden here."}</p>
        {record.status === "APPROVAL_PENDING" ? <OwnerReview observation={observation} purchase={p} /> : null}
      </details></li>;
    })}</ul>
    <details className="observation-attempts"><summary>Execution attempts and receipt evidence ({observation.attempts.length})</summary>
      <p>Replay denials refer to the original unchanged request. They are not additional purchases or additional spend. LOCAL IDs have no public explorer links.</p>
      <ol>{observation.attempts.map(a => <li key={a.transaction_id}><strong>{a.proposal.request_id}: {words(a.decision)}</strong><p>{a.reason_codes.join(", ") || "No denial reason"}; {words(a.record_source)}.</p><dl className="observation-fields"><div><dt>Transaction</dt><dd><code>{a.transaction_id}</code></dd></div>
        {([ ["Initiating receipt", a.initial], ["Native transfer receipt", a.transfer], ["Private callback receipt", a.callback] ] as const).map(([label, receipt]) => <div key={label}><dt>{label}</dt><dd>{receipt ? <><code>{receipt.receipt_id}</code> — {receipt.succeeded ? "success recorded" : "failure recorded"}</> : "Not recorded"}</dd></div>)}
      </dl></li>)}</ol>
    </details>
    <ProposalReview observation={observation} />
  </div>;
}

export function ContractObservation() {
  const [observation, setObservation] = useState<LocalObservation | null>(null);
  const [importVersion, setImportVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("No contract records imported. The browser fixtures below are separate.");
  const sequence = useRef(0), fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => { sequence.current++; }, []);
  async function load(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const operation = ++sequence.current;
    setObservation(null); setError(""); setBusy(true); setNotice("Checking local file, quote bindings and receipt outcomes…");
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error("CONTRACT_INPUT_LIMIT");
      const imported = await importLocalObservation(await file.text());
      if (sequence.current !== operation) return;
      setObservation(imported); setImportVersion(operation); setNotice("LOCAL records imported into browser memory. No network call, signature or payment.");
    } catch (cause) {
      if (sequence.current !== operation) return;
      const code = cause instanceof Error && /^[A-Z_]{1,64}$/u.test(cause.message) ? cause.message : "FILE_READ_OR_VALIDATION_ERROR";
      setError(`File not accepted (${code}). Choose a generated LOCAL observation.json, no larger than 1 MiB. No records or funds changed.`); setNotice("No contract records imported.");
    } finally { if (sequence.current === operation) { setBusy(false); if (fileRef.current) fileRef.current.value = ""; } }
  }
  function clear() {
    sequence.current++; setObservation(null); setBusy(false); setError(""); setNotice("Imported records cleared from this view. Contract funds and authority are unchanged.");
    if (fileRef.current) fileRef.current.value = "";
  }
  return <section id="contract-observation" className="contract-observation" aria-labelledby="observation-heading">
    <header><h2 id="observation-heading">Inspect the local contract run.</h2><p>Import the agent harness’s canonical quote and purchase records. Read only: no signer, live vendor or public network is connected.</p></header>
    <p><a href="/intelligence">Open Outcome Receipts and Run Intelligence</a> to select local run files and inspect record-derived costs. Files are not carried between pages or saved.</p>
    <div className="observation-import"><div><label htmlFor="observation-file">LOCAL observation JSON</label><input ref={fileRef} id="observation-file" type="file" accept=".json,application/json" aria-describedby="observation-import-help observation-import-error" aria-invalid={Boolean(error)} onChange={load} />
      <p id="observation-import-help">Select <code>.local/projects/&lt;project-id&gt;/observation.json</code> from a completed agency Sandbox run. Maximum 1 MiB. Explicit file selection only; nothing is uploaded, saved or auto-opened.</p></div>
      <button type="button" className="button button-secondary" onClick={clear} disabled={!observation && !busy && !error}>Clear imported view</button></div>
    <p role="status" className="observation-notice">{notice}</p><p id="observation-import-error" role={error ? "alert" : undefined}>{error}</p>
    <div aria-busy={busy}>{observation ? <ObservationRecords key={importVersion} observation={observation} /> : null}</div>
    <aside className="observation-network" aria-labelledby="observation-network-heading"><h3 id="observation-network-heading">Public testnet remains disconnected.</h3><p>No verified public testnet contract, owner wallet connector or exact deployment/signature consent exists. Importing a file cannot enable these controls. Mainnet is not supported.</p>
      <div className="observation-network-actions"><button type="button" className="button button-secondary" disabled>Connect testnet owner wallet</button><button type="button" className="button button-secondary" disabled>Sign owner approval</button><button type="button" className="button button-secondary" disabled>Submit agent purchase</button></div>
      <p>Owner approval is separate from scoped agent execution. There is no owner-signature fallback, browser agent key, arbitrary receiver or timeout resend.</p></aside>
  </section>;
}
