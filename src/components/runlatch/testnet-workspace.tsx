"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createTestnetReader, type ProjectSelection } from "@/lib/near/testnet-rpc";
import { parseTestnetTarget } from "@/lib/near/testnet-target";
import { object, parseBoundedJson } from "@/lib/near/records";
import { parsePurchaseObservationIntent } from "@/lib/near/testnet-evidence";
import { HUMAN_WORKSPACE_METHODS, exportHumanWorkspaceReview, readHumanWorkspaceReview, type HumanWorkspaceReview } from "@/lib/near/human-workspace";
import { fillStyle } from "@/lib/dither/style";
import { Status } from "./status";

type ReportRead = Awaited<ReturnType<ReturnType<typeof createTestnetReader>["readProject"]>>;
type ReceiptRead = Awaited<ReturnType<ReturnType<typeof createTestnetReader>["observePurchase"]>>;
const LABELS = ["Create project", "Register provider", "Publish canonical quote", "Create capsule", "Review exact purchase approval",
  "Record fixture provisioning", "Record objective task check", "Record human acceptance"];
const words = (s: string) => s.toLowerCase().replaceAll("_", " ");
function ExactFields({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return <dl className="testnet-fields">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}
function ReviewSheet({ value }: { value: HumanWorkspaceReview }) {
  const r = value.review;
  return <article className="testnet-review" aria-labelledby="exact-review-heading">
    <div className="testnet-divider" aria-hidden="true" data-dither="human-review" style={fillStyle("gradient", { color: "grey", edge: "left", from: .25, to: .0625, length: 60 })} />
    <Status>Unsigned {words(r.transport_source)}</Status><h3 id="exact-review-heading">Exact human-action review</h3>
    <p>No action was signed or sent. This is RPC consistency evidence, not human authentication or contract approval. Re-read immediately before any separately approved signing action; Rust can still deny.</p>
    <ExactFields rows={[["Network", r.call.network], ["Account being reviewed", r.call.signer_id], ["Public key", r.call.public_key],
      ["Receiver contract", r.call.receiver_id], ["Expected deployed code hash", r.target.expected_code_hash], ["Method", r.call.method],
      ["Attached deposit (yoctoNEAR)", r.call.attached_deposit], ["Gas limit (gas units, not purchase funds)", r.call.gas],
      ["Final block hash", r.reviewed_block.hash], ["Final block height", String(r.reviewed_block.height)],
      ["Review expiry (nanoseconds)", r.expires_at_ns], ["Exact review hash", r.review_hash]]} />
    {value.kind === "setup" ? <><h4>Funding and commercial exposure</h4><ExactFields rows={[
      ["Purchase funding (yoctoNEAR)", value.review.funding.purchase_funding], ["Storage credit (yoctoNEAR)", value.review.funding.storage_credit],
      ["Project ceiling (yoctoNEAR)", value.review.funding.project_ceiling ?? "Not set by this call"],
      ["Purchase payment scheduled", "No — setup or quote publication is not purchase approval"]]} />
      {value.review.exposure ? <ExactFields rows={[["Quoted immediate charge (yoctoNEAR)", value.review.exposure.amount_due_now],
        ["Quoted future commitment (yoctoNEAR)", value.review.exposure.committed_future ?? "Unknown"],
        ["Quoted full minimum commitment (yoctoNEAR)", value.review.exposure.known_minimum_commitment ?? "Unknown"]]} /> : null}</> : null}
    {value.kind === "approval" ? <><h4>Canonical commercial exposure</h4><ExactFields rows={[["Canonical recipient", value.review.exposure.recipient_id],
      ["Immediate purchase charge (yoctoNEAR)", value.review.exposure.amount_due_now], ["Future commitment (yoctoNEAR)", value.review.exposure.future_commitment ?? "Unknown"],
      ["Full minimum commitment (yoctoNEAR)", value.review.exposure.total_commitment ?? "Unknown"]]} />
      <pre aria-label="Complete canonical commercial terms">{JSON.stringify(value.review.canonical_quote.terms, null, 2)}</pre></> : null}
    {value.kind === "owner" ? <p>Provisioning, objective checks and acceptance are separate owner attestations. A passed fixture check is not real-provider delivery or client acceptance. Payment facts and reservations are unchanged by preparing this review.</p> : null}
    <h4>Exact call arguments</h4><pre aria-label="Exact unsigned call arguments">{JSON.stringify(r.call.args, null, 2)}</pre>
    <p className="fine-print">{r.limitation}</p>
  </article>;
}

export function TestnetWorkspace() {
  const [rpc, setRpc] = useState("https://rpc.testnet.near.org/");
  const [contract, setContract] = useState(""), [operator, setOperator] = useState(""), [codeHash, setCodeHash] = useState("");
  const [allowRead, setAllowRead] = useState(false), [tab, setTab] = useState<"review" | "receipt" | "report">("review");
  const [method, setMethod] = useState<typeof HUMAN_WORKSPACE_METHODS[number]>("create_project");
  const [signer, setSigner] = useState(""), [publicKey, setPublicKey] = useState(""), [gas, setGas] = useState("");
  const [args, setArgs] = useState(""), [intentText, setIntentText] = useState("");
  const [project, setProject] = useState(""), [capsules, setCapsules] = useState(""), [providers, setProviders] = useState(""), [quotes, setQuotes] = useState("");
  const [budget, setBudget] = useState(false), [expenses, setExpenses] = useState(false), [evidence, setEvidence] = useState(false);
  const [artifact, setArtifact] = useState<Uint8Array | null>(null), [artifactLabel, setArtifactLabel] = useState("");
  const [review, setReview] = useState<HumanWorkspaceReview | null>(null), [receipt, setReceipt] = useState<ReceiptRead | null>(null), [report, setReport] = useState<ReportRead | null>(null);
  const [exportAllowed, setExportAllowed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [notice, setNotice] = useState("No target selected. No network call or wallet connection.");
  const operation = useRef(0), controller = useRef<AbortController | null>(null), errorRef = useRef<HTMLParagraphElement>(null);
  const artifactRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => { operation.current++; controller.current?.abort(); }, []);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  function invalidate(message = "Inputs changed. Previous reads cleared; no contract state or funds changed.") {
    operation.current++; controller.current?.abort(); controller.current = null;
    setBusy(false); setReview(null); setReceipt(null); setReport(null); setExportAllowed(false); setError(""); setNotice(message);
  }
  function edit(set: (v: string) => void, v: string) { invalidate(); set(v); }
  function clear() {
    invalidate("Workspace cleared from browser memory. No reservation released, payment retried or authority changed.");
    setAllowRead(false); setContract(""); setOperator(""); setCodeHash(""); setSigner(""); setPublicKey(""); setGas(""); setArgs(""); setIntentText("");
    setProject(""); setCapsules(""); setProviders(""); setQuotes(""); setBudget(false); setExpenses(false); setEvidence(false);
    setArtifact(null); setArtifactLabel(""); if (artifactRef.current) artifactRef.current.value = "";
  }
  async function read(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    invalidate(); const seq = operation.current, abort = new AbortController(); controller.current = abort;
    setBusy(true); setNotice("Reading the selected testnet target. No signing or payment…");
    try {
      if (!allowRead) throw new Error("EXPLICIT_READ_DISCLOSURE_REQUIRED");
      const target = parseTestnetTarget({ network: "testnet", rpc_url: rpc, contract_id: contract, operator_id: operator, expected_code_hash: codeHash });
      const reader = createTestnetReader(target);
      if (tab === "review") {
        const body = object(parseBoundedJson(args, 16_384));
        const action = method === "approve_purchase" ? { method, signer_id: signer, public_key: publicKey, gas, ...body }
          : { method, signer_id: signer, public_key: publicKey, gas, args: body };
        // Approval body must not substitute identity/method/gas supplied in the visible fields.
        if (method === "approve_purchase" && Object.keys(body).some(k => !["proposal", "expected_request_hash"].includes(k))) throw new Error("INVALID_APPROVAL_REVIEW_BODY");
        const value = await readHumanWorkspaceReview(reader, action, method === "record_task_check" ? { artifact } : undefined, abort.signal);
        if (seq !== operation.current) return; setReview(value);
        setNotice("Unsigned review prepared at the displayed final block. Not signed, approved or sent.");
      } else if (tab === "receipt") {
        const intent = parsePurchaseObservationIntent(parseBoundedJson(intentText, 16_384));
        const value = await reader.observePurchase(intent, abort.signal);
        if (seq !== operation.current) return; setReceipt(value);
        setNotice("Captured transaction inspected once. Unknown outcomes retain reservations; no resend or release is available.");
      } else {
        const ids = (v: string) => v.trim() ? v.split(",").map(s => s.trim()) : [];
        const selection: ProjectSelection = { project_id: project, capsule_ids: ids(capsules), provider_ids: ids(providers), quote_ids: ids(quotes),
          disclosure: { project_id: project, budget, expenses, evidence } };
        const value = await reader.readProject(selection, abort.signal);
        if (seq !== operation.current) return; setReport(value);
        setNotice("Selected read-only report prepared. Ledger resolution alone does not prove settlement.");
      }
    } catch (cause) {
      if (seq !== operation.current) return;
      const code = cause instanceof Error && /^[A-Z_]{1,64}$/u.test(cause.message) ? cause.message : "WORKSPACE_READ_FAILED";
      setError(`Read not accepted (${code}). Check the selected target and exact inputs. No signature, retry or release occurred.`);
      setNotice("No current result. Do not treat an earlier review as fresh authority.");
    } finally { if (seq === operation.current) { setBusy(false); controller.current = null; } }
  }
  async function loadArtifact(file: File | undefined) {
    invalidate(); setArtifact(null); setArtifactLabel(""); if (!file) return;
    const seq = operation.current;
    try {
      if (file.size > 16_384) throw new Error("SIZE_LIMIT");
      const bytes = new Uint8Array(await file.arrayBuffer()); if (seq !== operation.current) return;
      setArtifact(bytes); setArtifactLabel(`${bytes.byteLength} bytes selected locally; never sent to RPC.`);
    } catch { if (seq === operation.current) setError("Fixture artifact not accepted. Select at most 16 KiB; nothing was uploaded."); }
    finally { if (artifactRef.current) artifactRef.current.value = ""; }
  }
  function download() {
    if (!review || !exportAllowed || busy) return;
    const url = URL.createObjectURL(new Blob([exportHumanWorkspaceReview(review)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "unsigned-human-review.json"; a.click(); URL.revokeObjectURL(url);
    setExportAllowed(false); setNotice("Unsigned review exported by your request. It is not signing consent and contains no fixture artifact.");
  }
  return <div className="testnet-workspace">
    <aside className="testnet-boundary"><Status>Read-only · testnet only</Status><h2>Human authority stays outside the agent.</h2>
      <p>No wallet is connected and no signing adapter is admitted. This workspace prepares exact reviews, inspects a previously captured purchase and reads a selected project report. It cannot create accounts, deploy, install keys or send a transaction.</p>
      <p>Never paste a private key, seed phrase or credential. Only public account IDs, public keys, exact contract arguments and explicitly selected fixture bytes belong here.</p></aside>
    <form onSubmit={read} noValidate>
      <fieldset className="testnet-target"><legend>Explicit testnet target</legend><div className="testnet-input-grid">
        <label>Read-only RPC<select aria-label="Read-only RPC" value={rpc} onChange={e => edit(setRpc, e.target.value)}><option>https://rpc.testnet.near.org/</option><option>https://test.rpc.fastnear.com/</option></select></label>
        <label>Contract account<input autoComplete="off" spellCheck={false} maxLength={64} value={contract} onChange={e => edit(setContract, e.target.value)} /></label>
        <label>Operator account<input autoComplete="off" spellCheck={false} maxLength={64} value={operator} onChange={e => edit(setOperator, e.target.value)} /></label>
        <label>Expected deployed code hash<input autoComplete="off" spellCheck={false} maxLength={44} value={codeHash} onChange={e => edit(setCodeHash, e.target.value)} /></label>
      </div><label className="testnet-check"><input type="checkbox" checked={allowRead} onChange={e => { invalidate(); setAllowRead(e.target.checked); }} /><span>I permit read-only RPC requests to this target. Selected public IDs and contract data are visible to the RPC operator. This does not authorize signing or payment.</span></label></fieldset>
      <label className="testnet-mode">Workspace task<select aria-label="Workspace task" value={tab} onChange={e => { invalidate(); setTab(e.target.value as typeof tab); }}>
        <option value="review">Prepare a human-action review</option><option value="receipt">Inspect a captured purchase</option><option value="report">Read a selected project report</option></select></label>
      {tab === "review" ? <fieldset><legend>Exact owner or provider action</legend><div className="testnet-input-grid">
        <label>Action<select aria-label="Action" value={method} onChange={e => { invalidate(); setMethod(e.target.value as typeof method); setArgs(""); setArtifact(null); setArtifactLabel(""); }}>{HUMAN_WORKSPACE_METHODS.map((m, i) => <option key={m} value={m}>{LABELS[i]}</option>)}</select></label>
        <label>Signer account<input value={signer} maxLength={64} autoComplete="off" spellCheck={false} onChange={e => edit(setSigner, e.target.value)} /></label>
        <label>Human wallet public key<input value={publicKey} maxLength={52} autoComplete="off" spellCheck={false} onChange={e => edit(setPublicKey, e.target.value)} /></label>
        <label>Exact gas limit (gas units)<input inputMode="numeric" value={gas} maxLength={20} autoComplete="off" onChange={e => edit(setGas, e.target.value)} /></label>
      </div><label>Exact {method === "approve_purchase" ? "proposal and expected request hash" : "arguments"} JSON<textarea value={args} maxLength={16_384} spellCheck={false} autoComplete="off" rows={9} onChange={e => edit(setArgs, e.target.value)} /></label>
        <p className="fine-print">Use the existing documented method schema. Amounts and nanoseconds are decimal strings; never floating-point money. Deposits are derived by the existing review, not a free payment field. No submit_purchase or administrative bypass is exposed.</p>
        {method === "record_task_check" ? <div><label>Explicit local fixture artifact (optional only for a report validated against missing bytes)<input ref={artifactRef} type="file" onChange={e => void loadArtifact(e.target.files?.[0])} /></label><p>{artifactLabel || "No artifact selected. A passed report cannot be prepared without its exact valid artifact."}</p></div> : null}
      </fieldset> : tab === "receipt" ? <fieldset><legend>Previously captured purchase identity</legend><label>Exact observation intent JSON<textarea rows={10} value={intentText} maxLength={16_384} spellCheck={false} autoComplete="off" onChange={e => edit(setIntentText, e.target.value)} /></label>
        <p>Use the captured transaction hash, sender/public key, method, gas, proposal and expected request hash. A hash alone never proves settlement. Only one explicit status lookup; no polling, resend or re-sign.</p></fieldset>
        : <fieldset><legend>Owner-selected report scope</legend><div className="testnet-input-grid">
          <label>Project ID<input value={project} maxLength={64} autoComplete="off" onChange={e => edit(setProject, e.target.value)} /></label>
          <label>Capsule IDs (comma-separated, at most 4)<input value={capsules} maxLength={260} autoComplete="off" onChange={e => edit(setCapsules, e.target.value)} /></label>
          <label>Provider IDs (comma-separated, at most 3)<input value={providers} maxLength={195} autoComplete="off" onChange={e => edit(setProviders, e.target.value)} /></label>
          <label>Quote IDs (comma-separated, at most 16)<input value={quotes} maxLength={1040} autoComplete="off" onChange={e => edit(setQuotes, e.target.value)} /></label></div>
          <div className="testnet-disclosure">{([["Show budget", budget, setBudget], ["Show expenses", expenses, setExpenses], ["Show evidence", evidence, setEvidence]] as const).map(([label, checked, set]) => <label key={label} className="testnet-check"><input type="checkbox" checked={checked} onChange={e => { invalidate(); set(e.target.checked); }} />{label}</label>)}</div>
          <p>All visibility flags start off. The RPC still reads the selected canonical records to check consistency; these flags control the report shown here, not on-chain confidentiality.</p></fieldset>}
      <div className="testnet-actions"><button type="submit" className="button button-primary" disabled={busy || !allowRead}>{busy ? "Reading selected records…" : tab === "review" ? "Read and prepare unsigned review" : tab === "receipt" ? "Inspect captured purchase once" : "Read selected project report"}</button>
        {busy ? <button type="button" className="button button-secondary" onClick={() => invalidate("Read cancelled. No signature, payment, release or resend; late results cannot populate this view.")}>Cancel read</button> : null}
        <button type="button" className="button button-secondary" onClick={clear}>Clear workspace</button></div>
    </form>
    <p role="status" className="testnet-notice">{notice}</p><p ref={errorRef} tabIndex={-1} role={error ? "alert" : undefined} className="testnet-error">{error}</p>
    <div aria-busy={busy}>{review ? <><ReviewSheet value={review} /><div className="testnet-export"><label className="testnet-check"><input type="checkbox" checked={exportAllowed} onChange={e => setExportAllowed(e.target.checked)} />I permit export of this full unsigned review, including public IDs, policy and commercial/evidence metadata. No fixture bytes or private keys are included.</label><button type="button" className="button button-secondary" disabled={!exportAllowed || busy} onClick={download}>Export unsigned review</button></div></> : null}
      {receipt ? <article className="testnet-review"><h3>Observed purchase evidence</h3><ExactFields rows={[["Transport source", receipt.transport_source], ["Purchase payment evidence", receipt.payment_evidence], ["Transaction status", receipt.submission],
        ["Actual Gate decision", receipt.actual_decision ?? "Not evidenced"], ["Initiating receipt", receipt.initial_receipt_id ?? "Not evidenced"],
        ["Native transfer receipt", receipt.transfer_receipt_id ?? "Not evidenced"], ["Private callback receipt", receipt.callback_receipt_id ?? "Not evidenced"]]} />
        <p>Payment evidence is separate from fixture provisioning, objective checks and explicit human acceptance. Unknown or unproven outcomes retain reservations; there is no release or resend here.</p>
        <pre aria-label="Read-only purchase evidence details">{JSON.stringify(receipt, null, 2)}</pre></article> : null}
      {report ? <article className="testnet-review"><h3>Selected project report</h3><ExactFields rows={[["Final block", report.block.hash], ["Settlement verification", report.settlement_verification], ["Coverage", report.report.coverage.complete_project ? "Complete selected project" : "Partial capsule coverage"]]} />
        <p>Amounts are integer yoctoNEAR. Reported ledger settlement is not transfer/private-callback proof. No margin, savings or real-client acceptance is inferred.</p>
        <pre aria-label="Owner-selected project report">{JSON.stringify(report.report, null, 2)}</pre></article> : null}</div>
  </div>;
}
