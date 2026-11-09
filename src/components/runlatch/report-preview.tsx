"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { demoDisclosure, EMPTY_DISCLOSURE, type Disclosure } from "@/lib/preview/disclosure";
import { formatNear } from "@/lib/preview/money";
import { fillStyle } from "@/lib/dither/style";
import { BudgetPartition } from "./budget";
import { ArrowIcon } from "./icons";
import { ExecutionLabel } from "./execution-label";

function PrintSheet({ report, onClose }: { report: ReturnType<typeof demoDisclosure>; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null), headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    dialog.showModal();
    headingRef.current?.focus();
    return () => { dialog.close(); if (previousFocus instanceof HTMLElement) previousFocus.focus(); };
  }, []);
  return createPortal(<dialog ref={dialogRef} className="print-sheet" aria-label="Printable client report preview" onCancel={onClose}>
    <div className="print-sheet-top"><span>RunLatch · demo project report</span><span>{report.execution.mode} · not a contract record</span><button type="button" className="text-button print-close" onClick={onClose}>Close print preview</button></div>
    <h3 ref={headingRef} tabIndex={-1}>Automated Booking Website</h3>
    <p className="print-sheet-meta">{report.period} · fictional project · native NEAR · read-only preview</p>
    <p className="print-sheet-note">Generated from the same disclosure reducer as the JSON export. Selected fields only. No share link, signature or client access.</p>
    {report.financials ? <table><caption>Budget and commitments (NEAR)</caption><tbody>
      <tr><th scope="row">Settled</th><td>{formatNear(report.financials.spent)}</td></tr>
      <tr><th scope="row">Reserved now</th><td>{formatNear(report.financials.reserved)}</td></tr>
      <tr><th scope="row">Committed future</th><td>{formatNear(report.financials.committed_future)}</td></tr>
      <tr><th scope="row">Available to commit</th><td>{formatNear(report.financials.available_to_commit)}</td></tr>
    </tbody></table> : <p className="print-sheet-note">Budget totals were not selected for disclosure.</p>}
    {report.expenses.length ? <section className="print-purchases" aria-labelledby="print-purchases-heading"><h4 id="print-purchases-heading">Purchase details</h4><ul>
      {report.expenses.map(expense => <li key={expense.resource}><h4>{expense.resource}</h4><p>{expense.purpose}</p><dl>
        <div><dt>Supplier / service</dt><dd>{expense.provider_id} / {expense.service_id}</dd></div>
        <div><dt>Due now (NEAR)</dt><dd>{formatNear(expense.due_now!)}</dd></div>
        <div><dt>Full minimum commitment (NEAR)</dt><dd>{expense.commitment === null ? "Unavailable" : formatNear(expense.commitment)}</dd></div>
        <div><dt>Policy decision</dt><dd>{expense.decision}</dd></div><div><dt>Payment state</dt><dd>{expense.payment}</dd></div>
        <div><dt>Outcome evidence</dt><dd>{expense.evidence ? `${expense.evidence.provisioning === "FIXTURE_OBSERVED" ? "Fixture observed" : "No provisioning evidence"}; ${expense.evidence.check === "FIXTURE_PASSED" ? "fixture check passed" : "not checked"}; human acceptance not recorded` : "Not disclosed"}</dd></div>
      </dl></li>)}
    </ul></section> : <p className="print-sheet-note">Purchase details were not selected for disclosure.</p>}
    <p className="print-sheet-note">{report.limitations}</p>
    <div className="print-actions"><button type="button" className="button" onClick={() => window.print()}>Print this report</button></div>
  </dialog>, document.body);
}

export function ReportPreview() {
  const [selection, setSelection] = useState<Disclosure>(EMPTY_DISCLOSURE);
  const [message, setMessage] = useState("");
  const [printOpen, setPrintOpen] = useState(false);
  const report = demoDisclosure(selection);
  const any = selection.budget || selection.expenses;
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "runlatch-demo-report.json"; anchor.click();
    URL.revokeObjectURL(url); setMessage("Demo JSON downloaded locally. Nothing was uploaded or shared.");
  };
  return <div className="report-preview"><div className="report-controls"><h3>Choose what to disclose.</h3><p>The implemented report reducer is read-only and selected by the owner. This preview uses public, fictional fixtures to show that idea.</p>
    <fieldset><legend>Include in this demo report</legend>{([{ key: "budget", title: "Budget & commitments", detail: "Settled, reserved and available authority" }, { key: "expenses", title: "Purchase details", detail: "Supplier resource, purpose and payment state" }, { key: "evidence", title: "Outcome evidence", detail: "Only with purchase details; sources stay visible" }] as const).map(item => <label className="disclosure-option" key={item.key}><input type="checkbox" checked={selection[item.key]} onChange={event => { setSelection({ ...selection, [item.key]: event.target.checked }); setMessage(""); }} /><span><strong>{item.title}</strong><small>{item.detail}</small></span></label>)}</fieldset>
    <button className="button button-secondary" onClick={download}>Download selected demo JSON<ArrowIcon /></button><button className="button button-secondary" onClick={() => setPrintOpen(true)} disabled={!any}>Printable client report</button><p role="status" className="fine-print">{message || "No account identities, private prompts or artifacts in this demo export."}</p>
  </div><div className="report-output"><div className="report-output-top"><span>Project Expense & Outcome Report</span><span className="demo-tag">Read-only preview</span></div><h3>Automated Booking Website</h3><p className="quiet">7 November 2026 · one fictional project · native NEAR</p>
    {!any ? <div className="empty-report"><div className="empty-report-art" data-dither="interface" aria-hidden="true" style={fillStyle("gradient", { color: "ink", from: .6, to: .0625, edge: "bottom", length: 50 })} /><h4>Nothing selected to share.</h4><p>Financials and expenses stay out by default. Select the details you want this demo report to include.</p><button className="text-button" onClick={() => setSelection({ budget: true, expenses: true, evidence: false })}>Preview a cost summary</button></div> : <>
      {report.financials ? <><dl className="report-totals"><div><dt>Settled</dt><dd>{formatNear(report.financials.spent)} NEAR</dd></div><div><dt>Available to commit</dt><dd>{formatNear(report.financials.available_to_commit)} NEAR</dd></div></dl><BudgetPartition budget={report.financials} /><p className="fine-print">Reserved: {formatNear(report.financials.reserved)} NEAR. Future commitments: {formatNear(report.financials.committed_future)} NEAR. Denied proposals do not add commitments.</p></> : <p className="disclosure-note">Budget totals are not selected for disclosure.</p>}
      {report.expenses.length ? <ul className="report-expenses">{report.expenses.map(expense => <li key={expense.resource}><div><strong>{expense.resource}</strong><span>{expense.payment === "SETTLED" ? "Seeded settled payment" : expense.payment === "SETTLEMENT_PENDING" ? "Seeded pending payment" : "Denied; no payment attempted"}</span>{expense.evidence ? <small>{expense.evidence.provisioning === "FIXTURE_OBSERVED" ? "Fixture observed · fixture check passed" : "No provisioning evidence · not checked"} · human acceptance not recorded</small> : null}</div><code>{formatNear(expense.due_now!)} NEAR</code></li>)}</ul> : <p className="disclosure-note">Purchase details are not selected for disclosure.</p>}
    </>}
    <div className="report-boundary"><ExecutionLabel /><p>No share link or client account system. This demo does not authenticate a human owner.</p></div>
  </div>
  {printOpen ? <PrintSheet report={report} onClose={() => setPrintOpen(false)} /> : null}</div>;
}
