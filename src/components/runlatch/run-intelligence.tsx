"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { importOutcomeObservation, summarizeOutcomes, type OutcomeObservation, type OutcomeReceipt } from "@/lib/intelligence/receipts";
import { illustrativeOutcomes } from "@/lib/intelligence/examples";
import { validateResourceFixture, type ResourceCheckReport } from "@/lib/validation/resource";
import { visualPercent } from "@/lib/preview/money";
import { fillStyle } from "@/lib/dither/style";

const words = (code: string) => code.toLowerCase().replaceAll("_", " ");
const unavailable = "Not recorded";
function Fields({ rows }: { rows: readonly (readonly [string, string | null])[] }) {
  return <dl className="observation-fields">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? unavailable}</dd></div>)}</dl>;
}
function Receipt({ receipt: r }: { receipt: OutcomeReceipt }) {
  const v = r.validation;
  return <details className="outcome-receipt"><summary><span><strong>{r.request_id}</strong><small>{r.capsule_id} · {r.provider_id ?? "no canonical provider"}</small></span><span>{words(r.settlement)}</span></summary>
    <h3>Five separate lifecycle axes</h3>
    <Fields rows={[["Authorization decision", words(r.authorization)], ["Transfer submission", words(r.transfer_submission)], ["Confirmed settlement in selected records", words(r.settlement)],
      ["Task completion (capsule scope)", words(r.completion)], ["Task validation", v ? `${words(v.status)} · ${words(v.scope)}` : "Not checked for this purchase"]]} />
    <p>A final task report means the workflow finished reporting, not that it passed. A resource check applies only to its bound request; other purchases remain unchecked.</p>
    <Fields rows={[["Contract namespace", r.contract_id], ["Project", r.project_id], ["Run / capsule ID", r.capsule_id], ["Quote / request", `${r.quote_id} / ${r.request_id}`], ["Policy version", String(r.policy_version)],
      ["Policy hash", r.policy_hash], ["Request hash", r.request_hash], ["Expected quote hash", r.quote_hash], ["Registered canonical quote hash", r.canonical_quote_hash], ["Canonical amount (yoctoNEAR)", r.amount],
      ["Gate reason codes", r.reason_codes.join(", ") || "None recorded"], ["Transaction reference", r.transaction_id], ["Settlement transfer reference", r.settlement_reference],
      ["Private callback reference", r.callback_reference], ["Request created (ns)", r.created_at_ns], ["Reported resolution (ns)", r.resolved_at_ns], ["File observed (ns)", r.observed_at_ns],
      ["Provisioning evidence", words(r.provisioning)], ["Provisioning observed (ns)", r.provisioning_at_ns], ["Provisioning trust", r.provisioning_source],
      ["Explicit owner acceptance", `${words(r.acceptance)}${r.acceptance !== "NOT_RECORDED" ? r.acceptance_current ? " · matches selected evidence" : " · stale evidence" : ""}`], ["Owner acceptance recorded (ns)", r.acceptance_at_ns]]} />
    {v ? <><h3>Recorded objective validation</h3><Fields rows={[["Validator / version", `${v.validator_id} / ${v.validator_version}`], ["Criteria / hash", `${v.criteria_id} / ${v.criteria_hash}`],
      ["Validation result", v.status], ["Validation reasons", v.reason_codes.join(", ") || "No failed checks recorded"], ["Validation observed (ns)", v.observed_at_ns], ["Owner report recorded (ns)", v.recorded_at_ns],
      ["Bound request / resource", `${v.request_id ?? "capsule scope"} / ${v.resource_key ?? "not resource-scoped"}`], ["Artifact hash", v.artifact_hash], ["Evidence hash", v.evidence_hash], ["Outcome hash", v.outcome_hash], ["Trust source", v.source]]} /></> : null}
    <p>Imported references have no public explorer link. Submission timestamps unavailable in this export are not inferred from resolution time. Payment does not prove provisioning, task success or client acceptance. No release, resend or signature is available.</p>
  </details>;
}

function ManualValidator({ bundles }: { bundles: readonly OutcomeObservation[] }) {
  const bindings = bundles.flatMap(b => b.observation.purchases.flatMap(p => p.record.canonical_quote ? [{ project_id: b.observation.project_id,
    resource_key: p.record.canonical_quote.input.resource_key, capsule_id: p.record.proposal.capsule_id, request_id: p.record.proposal.request_id, observed_at_ns: b.observation.observed_at_ns }] : []));
  const [bindingIndex, setBindingIndex] = useState("0"), [report, setReport] = useState<ResourceCheckReport | null>(null), [notice, setNotice] = useState("");
  const sequence = useRef(0), fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => { sequence.current++; }, []);
  async function check(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0], binding = bindings[Number(bindingIndex)];
    if (!file || !binding) return;
    const operation = ++sequence.current; setReport(null); setNotice("Checking the selected fixture bytes…");
    try {
      if (file.size > 16384) throw new Error("RESOURCE_ARTIFACT_SIZE_LIMIT");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const value = await validateResourceFixture(bytes, binding, binding.observed_at_ns);
      if (sequence.current !== operation) return;
      setReport(value); setNotice("Local check complete. UNATTESTED; analytics and recorded outcomes are unchanged.");
    } catch { if (sequence.current === operation) setNotice("Fixture could not be checked. Select a file at most 16 KiB. No recorded result changed."); }
    finally { if (sequence.current === operation && fileRef.current) fileRef.current.value = ""; }
  }
  return <details className="intelligence-validator"><summary>Repeat the objective fixture checks locally</summary>
    <p>Checks exact JSON fields, project/resource binding, fixture health and the fixture route/body at the selected file’s observation time. Identical bytes and binding yield identical reports. No URL is visited. This does not prove external factual truth or a provider’s work; it cannot attest a contract report or change these analytics.</p>
    <label>Fixture binding<select value={bindingIndex} onChange={e => { sequence.current++; setBindingIndex(e.target.value); setReport(null); setNotice(""); }}>{bindings.map((b, i) => <option key={`${b.capsule_id}:${b.request_id}`} value={i}>{b.project_id} / {b.request_id} / {b.resource_key}</option>)}</select></label>
    <label htmlFor="intelligence-artifact">Resource fixture JSON (16 KiB maximum)</label><input ref={fileRef} id="intelligence-artifact" type="file" accept=".json,application/json" onChange={check} disabled={!bindings.length} />
    <p role="status">{notice}</p>
    {report ? <div className="intelligence-check"><h3>{words(report.status)} · UNATTESTED</h3><ul>{report.checks.map(c => <li key={c.check_id}>{c.check_id}: {c.status}</li>)}</ul>
      <Fields rows={[["Validator / version", `${report.validator_id} / ${report.validator_version}`], ["Criteria hash", report.criteria_hash], ["Artifact hash", report.artifact_hash], ["Evidence hash", report.evidence_hash], ["Observed (ns)", report.observed_at_ns]]} /></div> : null}
  </details>;
}

function Results({ bundles, from, to }: { bundles: readonly OutcomeObservation[]; from: string; to: string }) {
  let data: ReturnType<typeof summarizeOutcomes>;
  try { data = summarizeOutcomes(bundles, { from: from || "0", to: to || ((1n << 64n) - 1n).toString() }); }
  catch { return <p role="alert">Cannot aggregate this selection. Use an ordered range of integer nanoseconds and non-conflicting run snapshots. No stale totals are shown.</p>; }
  const total = data.provider_spend.reduce((sum, p) => sum + BigInt(p.spent), 0n).toString();
  const mixedContracts = new Set(data.provider_spend.map(p => p.contract_id)).size > 1;
  return <div className="intelligence-results">
    <p className="intelligence-sample" role="status">{data.sample_count} selected runs · {data.receipts.length} purchase receipts · {data.excluded.length} excluded from cost cohorts · {data.duplicate_count} duplicate snapshots ignored · {data.filtered_count} outside time range.</p>
    <p>Range: {data.time_range_ns ? `${data.time_range_ns.first}–${data.time_range_ns.last} ns` : "Unavailable — no selected records"}. Finished runs use report-recorded time; unfinished runs use observation time. All amounts below are integer yoctoNEAR, not fiat (10²⁴ yoctoNEAR = 1 NEAR).</p>
    <section aria-labelledby="ledger-heading"><h2 id="ledger-heading">Project ledger position.</h2><p>Selected capsule totals from the observation snapshots, not necessarily the entire project. These are not limited by the time filter. Ledger claims are not independently proven settlement; exact duplicate snapshots are counted once.</p>
      {data.ledger ? <><dl className="intelligence-ledger"><div><dt>Selected ledger spend (yoctoNEAR)</dt><dd>{data.ledger.spent}</dd></div><div><dt>Reserved now (yoctoNEAR)</dt><dd>{data.ledger.reserved}</dd></div><div><dt>Committed future (yoctoNEAR)</dt><dd>{data.ledger.committed_future}</dd></div><div><dt>Allocated authority (yoctoNEAR)</dt><dd>{data.ledger.allocated}</dd></div><div><dt>Pending or unverified settlement receipts</dt><dd>{data.ledger.pending_settlement_receipts}<small>Across the selected snapshots, not the time-filtered list. A missing callback is not confirmed failure.</small></dd></div></dl>
        <p className="fine-print">Source: {data.ledger.observation_count} distinct selected observation{data.ledger.observation_count === 1 ? "" : "s"}, in the source mode selected above. Method: sum canonical-input capsule ledgers after duplicate/conflict checks. Gas, storage credits and owner returns are excluded from spend.</p></> : <p>Not enough data for capsule ledger totals. Missing evidence is unavailable, not zero.</p>}
    </section>
    <section aria-labelledby="provider-spend-heading"><h2 id="provider-spend-heading">Where the recorded spend went.</h2><p>Matching native transfer and successful private callback records only, including selected unfinished runs. File claims are not independent chain proof. Gas, storage and owner returns are excluded.</p>
      {data.provider_spend.length ? <div className="intelligence-table-wrap" tabIndex={0} role="region" aria-label="Provider spend table"><table><caption>Selected evidenced provider spend · {total} yoctoNEAR</caption><thead><tr><th scope="col">Provider</th><th scope="col">Relative spend</th><th scope="col">Spend (yoctoNEAR)</th></tr></thead><tbody>{data.provider_spend.map(p => <tr key={`${p.contract_id}:${p.provider_id}`}><th scope="row">{p.provider_id}{mixedContracts ? <small> · {p.contract_id}</small> : null}</th><td><div className="provider-bar" aria-hidden="true"><span style={{ width: total === "0" ? "0%" : visualPercent(p.spent, total), ...fillStyle("dotted", { color: "--color-accent", cell: 2 }) }} /></div></td><td className="integer">{p.spent}</td></tr>)}</tbody></table></div> : <p>No matched settled provider spend in this selection. This is not a zero-cost success claim.</p>}
    </section>
    <section aria-labelledby="cost-heading"><h2 id="cost-heading">What a finished run cost.</h2><p>Cost per successful run = all eligible finished-run settled spend ÷ passed finished runs. Failed and errored run spend stays in the numerator. “Passed” means the recorded criteria passed, not external truth or real client acceptance.</p>
      {data.costs.cohorts.length ? data.costs.cohorts.map(c => <div className="intelligence-cohort" key={JSON.stringify(c.key)}><h3>{c.key[3]} · validator {c.key[6]}</h3><p>{c.key[0]} / {c.key[1]} · {c.key[2]} · criteria <code>{c.key[4]}</code> · {c.key[5]} · {c.key[7]}</p>
        <dl className="intelligence-costs"><div><dt>Cost per successful run (yoctoNEAR)</dt><dd><span data-testid="cost-per-success">{c.cost_per_success ? c.cost_per_success.floor_yocto : "Unavailable"}</span><small>{c.cost_per_success ? `Exact ratio ${c.cost_per_success.numerator} / ${c.cost_per_success.denominator}; display floors to whole yoctoNEAR.` : "No passed completed runs."}</small></dd></div>
          <div><dt>Failed + errored run cost (yoctoNEAR)</dt><dd><span data-testid="failed-run-cost">{c.failed_run_cost}</span><small>Settled purchase cost, not refundable task quality.</small></dd></div>
          <div><dt>Eligible settled spend (yoctoNEAR)</dt><dd>{c.settled_spend}<small>{c.completed_runs} finished · {c.passed_runs} passed · {c.failed_runs} failed · {c.error_runs} errored</small></dd></div></dl>
        <p>Report range: {c.completion_range_ns.first}–{c.completion_range_ns.last} ns. Cohorts separate source, network, contract, workflow, criteria, validator and asset.</p></div>) : <p>No eligible finished-run cost cohort. Missing evidence is unavailable, never zero or infinity.</p>}
      {data.excluded.length ? <ul className="intelligence-exclusions">{data.excluded.map(e => <li key={e.capsule_id}>{e.capsule_id}: {e.reason}</li>)}</ul> : null}
    </section>
    <div className="intelligence-secondary"><section aria-labelledby="blocked-heading"><h2 id="blocked-heading">Blocked attempts.</h2><p>Unique recorded execution attempts by reason, including replay denials. A single attempt may have multiple reasons; these counts are not additional purchases.</p>
      {data.blocked_reasons.length ? <table><caption>Recorded denial reasons</caption><thead><tr><th scope="col">Reason</th><th scope="col">Attempts</th></tr></thead><tbody>{data.blocked_reasons.map(r => <tr key={r.reason}><th scope="row">{r.reason}</th><td className="integer">{r.count}</td></tr>)}</tbody></table> : <p>No denied execution attempts recorded in this selection.</p>}</section>
      <section aria-labelledby="quotes-heading"><h2 id="quotes-heading">Quote changes.</h2><p>Only selected canonical predecessor quotes with comparable provider, service, resource, quantity and commercial terms. No trend or vendor score is inferred.</p>
        <details><summary>Inspect quote comparison availability ({data.quote_changes.length})</summary><ul className="intelligence-quotes">{data.quote_changes.map((q, i) => <li key={`${q.project_id}:${q.quote_id}:${i}`}><strong>{q.quote_id}</strong><span>{q.delta_yocto === null ? `Unavailable: ${q.unavailable_reason}` : `${q.previous_amount} → ${q.current_amount} yoctoNEAR; signed delta ${q.delta_yocto}`}</span></li>)}</ul></details></section></div>
    <section aria-labelledby="outcome-receipts-heading"><h2 id="outcome-receipts-heading">Outcome Receipts.</h2><p>One purchase, separate consequences. Open a receipt for policy, references, reasons and objective-check evidence. Owner acceptance is not real client acceptance.</p>
      {data.receipts.map(r => <Receipt key={`${r.project_id}:${r.capsule_id}:${r.request_id}`} receipt={r} />)}{!data.receipts.length ? <p>No receipt records selected.</p> : null}
    </section>
    <ManualValidator key={JSON.stringify([bundles.map(b => b.observation.project_id), from, to])} bundles={bundles} />
  </div>;
}

export function RunIntelligence() {
  const [source, setSource] = useState(""), [bundles, setBundles] = useState<readonly OutcomeObservation[]>([]), [selected, setSelected] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("Choose a sample or import LOCAL records. No analytics are loaded."), [error, setError] = useState("");
  const [from, setFrom] = useState(""), [to, setTo] = useState("");
  const [importVersion, setImportVersion] = useState(0);
  const sequence = useRef(0), fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => { sequence.current++; }, []);
  function reset(nextSource = source) {
    sequence.current++; setSource(nextSource); setBundles([]); setSelected([]); setBusy(false); setError(""); setFrom(""); setTo("");
    setNotice("Selection cleared. Contract funds and authority are unchanged."); if (fileRef.current) fileRef.current.value = "";
  }
  async function load(files?: FileList, kind = source) {
    const operation = ++sequence.current; setBundles([]); setSelected([]); setError(""); setBusy(true); setNotice("Checking selected records…");
    try {
      let imported: readonly OutcomeObservation[];
      if (kind === "illustrative") imported = await illustrativeOutcomes();
      else {
        const list = Array.from(files ?? []);
        if (!list.length || list.length > 16 || list.some(f => f.size > 1048576)) throw new Error("OUTCOME_FILE_LIMIT");
        imported = await Promise.all(list.map(async f => importOutcomeObservation(await f.text())));
      }
      summarizeOutcomes(imported);
      if (sequence.current !== operation) return;
      setBundles(imported); setSelected(imported.map(b => b.observation.project_id)); setImportVersion(operation);
      setNotice(kind === "illustrative" ? "Illustrative sample loaded. All references and metrics are invented fixtures, not execution evidence." : "Selected LOCAL records loaded into memory. No upload, persistence, network call or signature.");
    } catch (cause) {
      if (sequence.current !== operation) return;
      const code = cause instanceof Error && /^[A-Z_]{1,64}$/u.test(cause.message) ? cause.message : "FILE_READ_OR_VALIDATION_ERROR";
      setError(`Selection rejected (${code}). Use generated LOCAL observation files (up to 16 files, 1 MiB each). No stale records are shown.`); setNotice("No records loaded.");
    } finally { if (sequence.current === operation) { setBusy(false); if (fileRef.current) fileRef.current.value = ""; } }
  }
  const chosen = bundles.filter(b => selected.includes(b.observation.project_id));
  return <div id="run-intelligence" className="run-intelligence">
    <section className="intelligence-source" aria-labelledby="intelligence-source-heading"><h2 id="intelligence-source-heading">Choose the evidence, not a headline.</h2>
      <p>Read-only selected records. No chain oracle, live vendor, signer, upload or public testnet connection. Imported source labels are claims; consistency checks do not authenticate them.</p>
      <label>Record source<select value={source} onChange={e => reset(e.target.value)}><option value="">Choose a data source</option><option value="local">Imported LOCAL Sandbox files</option><option value="illustrative">Illustrative browser fixtures</option></select></label>
      <div className="intelligence-import">{source === "" ? <div className="intelligence-source-choice"><div><h3>Load a labelled sample</h3><p>One click. Fabricated references and sample metrics, never described as chain or Sandbox evidence.</p><button type="button" className="button button-secondary" onClick={() => { reset("illustrative"); void load(undefined, "illustrative"); }}>Load sample project</button></div><div><h3>Import LOCAL Sandbox observations</h3><p>Use generated <code>.local/projects/&lt;project-id&gt;/observation.json</code> files. Up to 16 files, 1 MiB each.</p><button type="button" className="button button-secondary" onClick={() => reset("local")}>Choose LOCAL files</button></div></div>
        : source === "local" ? <div><label htmlFor="intelligence-files">LOCAL outcome observation JSON files</label><input ref={fileRef} id="intelligence-files" type="file" accept=".json,application/json" multiple onChange={e => { if (e.currentTarget.files?.length) void load(e.currentTarget.files); }} aria-invalid={Boolean(error)} aria-describedby="intelligence-import-help intelligence-import-error" /><p id="intelligence-import-help">Explicitly select .local/projects/&lt;project-id&gt;/observation.json. Up to 16 files, 1 MiB each. Replacement is atomic; nothing is auto-opened, saved or uploaded.</p></div>
        : <div><p className="fine-print">Illustrative sample: invented references and metrics. Not a LOCAL Sandbox or public testnet result.</p><button type="button" className="button button-secondary" onClick={() => void load(undefined, "illustrative")}>Load illustrative sample</button></div>}
        <button type="button" className="button button-secondary" onClick={() => reset()} disabled={!bundles.length && !busy && !error}>Clear intelligence view</button></div>
      <p role="status">{notice}</p><p id="intelligence-import-error" role={error ? "alert" : undefined}>{error}</p>
    </section>
    {bundles.length ? <><div className="intelligence-source-label">{source === "illustrative" ? "Illustrative only — fabricated references and sample metrics, not product results." : "Imported LOCAL Sandbox records — not public NEAR testnet or independent chain proof."}</div>
      <fieldset className="intelligence-selection"><legend>Selected project bundles</legend>{bundles.map((b, i) => <label key={`${b.observation.project_id}:${i}`}><input type="checkbox" checked={selected.includes(b.observation.project_id)} onChange={e => setSelected(previous => e.target.checked ? [...previous, b.observation.project_id] : previous.filter(id => id !== b.observation.project_id))} />{b.observation.project_id}</label>)}</fieldset>
      <div className="intelligence-filters"><label>From time (integer ns)<input value={from} maxLength={20} inputMode="numeric" placeholder="No lower bound" onChange={e => setFrom(e.target.value)} /></label><label>Through time (integer ns)<input value={to} maxLength={20} inputMode="numeric" placeholder="No upper bound" onChange={e => setTo(e.target.value)} /></label></div>
      <div aria-busy={busy}><Results key={importVersion} bundles={chosen} from={from} to={to} /></div></> : <p className="intelligence-empty">{source === "" ? "Choose the labelled sample or import LOCAL records. Empty is unavailable, not a fabricated zero." : "Select evidence to see spend, finished-run cost, blocked attempts and receipts. Empty is unavailable, not a fabricated zero."}</p>}
  </div>;
}
