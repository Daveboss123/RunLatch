"use client";
import { useEffect, useId, useRef, useState } from "react";
import { createTestnetReader } from "@/lib/near/testnet-rpc";
import { readVerifiedProject, type VerifiedProject } from "@/lib/near/project-evidence";
import { DEMO_CAPTURED_PURCHASE, RUNLATCH_TESTNET_TARGET } from "@/lib/near/demo-operations";
import { parseBoundedJson } from "@/lib/near/records";
import { CanonicalReport } from "./canonical-report";
import type { OutcomeObservation } from "@/lib/intelligence/receipts";

export function PublicProject({ onData }: { onData?: (value: OutcomeObservation | null) => void }) {
  const [project, setProject] = useState(""), [capsules, setCapsules] = useState(""), [providers, setProviders] = useState(""), [quotes, setQuotes] = useState(""), [intents, setIntents] = useState("[]");
  const [permit, setPermit] = useState(false), [budget, setBudget] = useState(false), [expenses, setExpenses] = useState(false), [evidence, setEvidence] = useState(false);
  const [result, setResult] = useState<VerifiedProject | null>(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState("No public data loaded. Reads start only after your permission and click.");
  const seq = useRef(0), abort = useRef<AbortController | null>(null);
  const headingId = useId();
  useEffect(() => () => { seq.current++; abort.current?.abort(); }, []);
  function clear() { seq.current++; abort.current?.abort(); setResult(null); setBusy(false); onData?.(null); }
  function field(set: (v: string) => void, v: string) { clear(); set(v); }
  function loadRecorded() {
    clear(); setProject(DEMO_CAPTURED_PURCHASE.proposal.project_id); setCapsules(DEMO_CAPTURED_PURCHASE.proposal.capsule_id);
    setProviders("db_demo_1108"); setQuotes(DEMO_CAPTURED_PURCHASE.proposal.quote_id); setIntents(JSON.stringify([DEMO_CAPTURED_PURCHASE], null, 2));
    setNotice("Recorded public IDs loaded, not queried. The purchase is unresolved; no signature or retry is possible here.");
  }
  async function read() {
    if (!permit || busy) return; clear(); const operation = seq.current, controller = new AbortController(); abort.current = controller;
    setBusy(true); setNotice("Reading selected current records and captured transaction evidence. No signing or payment…");
    try {
      const ids = (v: string) => v.trim() ? v.split(",").map(x => x.trim()) : [];
      const data = await readVerifiedProject(createTestnetReader(RUNLATCH_TESTNET_TARGET), { selection: { project_id: project,
        capsule_ids: ids(capsules), provider_ids: ids(providers), quote_ids: ids(quotes), disclosure: { project_id: project, budget, expenses, evidence } },
        intents: parseBoundedJson(intents, 16384) }, controller.signal);
      if (operation !== seq.current) return; setResult(data); onData?.(data.outcome);
      setNotice(`${data.source}: selected snapshot and evidence loaded. Unverified payments are not counted as settled costs.`);
    } catch (error) {
      if (operation !== seq.current) return;
      const code = error instanceof Error && /^[A-Z_]{1,64}$/u.test(error.message) ? error.message : "PUBLIC_PROJECT_READ_FAILED";
      setNotice(`Read stopped (${code}). No stale totals, signature, resend or reservation release.`);
    } finally { if (operation === seq.current) setBusy(false); }
  }
  return <section className="public-project" aria-labelledby={headingId}><h3 id={headingId}>Read public testnet project records</h3>
    <p>Separate from browser fixtures and LOCAL files. RPC-reported evidence is not a light-client proof. This read-only view cannot sign, resend or resolve a payment.</p>
    <p>Target <code>{RUNLATCH_TESTNET_TARGET.contract_id}</code> · <code>{RUNLATCH_TESTNET_TARGET.rpc_url}</code></p>
    <button type="button" className="text-button" onClick={loadRecorded} disabled={busy}>Load recorded RunLatch scope</button>
    <div className="testnet-input-grid"><label>Public project ID<input maxLength={64} value={project} autoComplete="off" onChange={e => field(setProject, e.target.value)} /></label>
      <label>Public Capsule IDs<input maxLength={260} value={capsules} autoComplete="off" onChange={e => field(setCapsules, e.target.value)} /></label>
      <label>Public provider IDs<input maxLength={195} value={providers} autoComplete="off" onChange={e => field(setProviders, e.target.value)} /></label>
      <label>Public quote IDs<input maxLength={1040} value={quotes} autoComplete="off" onChange={e => field(setQuotes, e.target.value)} /></label></div>
    <label>Captured purchase intents JSON (at most 4)<textarea rows={6} maxLength={16384} value={intents} spellCheck={false} onChange={e => field(setIntents, e.target.value)} /></label>
    <div className="testnet-disclosure">{([["Include budget in exported report", budget, setBudget], ["Include expenses in exported report", expenses, setExpenses], ["Include outcome evidence in exported report", evidence, setEvidence]] as const).map(([label, checked, set]) => <label key={label}><input type="checkbox" checked={checked} onChange={e => { clear(); set(e.target.checked); }} />{label}</label>)}</div>
    <label><input type="checkbox" checked={permit} onChange={e => { clear(); setPermit(e.target.checked); }} /> I permit these read-only RPC requests. Public IDs and contract data are visible to the RPC operator; no signing or payment is authorized.</label>
    <div className="hero-actions"><button type="button" className="button" disabled={!permit || busy} onClick={() => void read()}>{busy ? "Reading public records…" : "Read selected public records"}</button>
      {busy ? <button type="button" className="button button-secondary" onClick={() => { clear(); setNotice("Read cancelled. No payment or funds changed."); }}>Cancel public read</button> : null}</div>
    <p role="status">{notice}</p>
    {result ? <><p>Final snapshot <code>{result.selected.block.hash}</code> · {result.source}. These are not LOCAL records.</p>
      <ul>{result.evidence.map(e => <li key={e.transaction_hash}><code>{e.transaction_hash}</code>: {e.payment_evidence} · {e.limitation}</li>)}</ul>
      <p>{result.unverified_requests.length} unverified captured attempts. Missing records are unavailable, not zero-cost success or a failed payment.</p>
      <CanonicalReport report={result.report} /></> : null}</section>;
}
