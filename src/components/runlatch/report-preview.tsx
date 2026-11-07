"use client";

import { useState } from "react";
import { demoDisclosure, EMPTY_DISCLOSURE, type Disclosure } from "@/lib/preview/disclosure";
import { formatNear } from "@/lib/preview/money";
import { fillStyle } from "@/lib/dither/style";
import { BudgetPartition } from "./budget";
import { ArrowIcon } from "./icons";
import { ExecutionLabel } from "./execution-label";

export function ReportPreview() {
  const [selection, setSelection] = useState<Disclosure>(EMPTY_DISCLOSURE);
  const [message, setMessage] = useState("");
  const report = demoDisclosure(selection);
  const any = selection.budget || selection.expenses;
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "runlatch-demo-report.json"; anchor.click();
    URL.revokeObjectURL(url); setMessage("Demo JSON downloaded locally. Nothing was uploaded or shared.");
  };
  return <div className="report-preview"><div className="report-controls"><h3>Choose what to disclose.</h3><p>The implemented report reducer is read-only and selected by the owner. This preview uses public, fictional fixtures to show that idea.</p>
    <fieldset><legend>Include in this demo report</legend>{([{ key: "budget", title: "Budget & commitments", detail: "Settled, reserved and available authority" }, { key: "expenses", title: "Purchase details", detail: "Supplier resource, purpose and payment state" }, { key: "evidence", title: "Outcome evidence", detail: "Only with purchase details; sources stay visible" }] as const).map(item => <label className="disclosure-option" key={item.key}><input type="checkbox" checked={selection[item.key]} onChange={event => { setSelection({ ...selection, [item.key]: event.target.checked }); setMessage(""); }} /><span><strong>{item.title}</strong><small>{item.detail}</small></span></label>)}</fieldset>
    <button className="button button-secondary" onClick={download}>Download selected demo JSON<ArrowIcon /></button><p role="status" className="fine-print">{message || "No account identities, private prompts or artifacts in this demo export."}</p>
  </div><div className="report-output"><div className="report-output-top"><span>Project Expense & Outcome Report</span><span className="demo-tag">Read-only preview</span></div><h3>Automated Booking Website</h3><p className="quiet">7 November 2026 · one fictional project · native NEAR</p>
    {!any ? <div className="empty-report"><div className="empty-report-art" data-dither="interface" aria-hidden="true" style={fillStyle("gradient", { color: "ink", from: .6, to: .0625, edge: "bottom", length: 50 })} /><h4>Nothing selected to share.</h4><p>Financials and expenses stay out by default. Select the details you want this demo report to include.</p><button className="text-button" onClick={() => setSelection({ budget: true, expenses: true, evidence: false })}>Preview a cost summary</button></div> : <>
      {report.financials ? <><dl className="report-totals"><div><dt>Settled</dt><dd>{formatNear(report.financials.spent)} NEAR</dd></div><div><dt>Available to commit</dt><dd>{formatNear(report.financials.available_to_commit)} NEAR</dd></div></dl><BudgetPartition budget={report.financials} /><p className="fine-print">Reserved: {formatNear(report.financials.reserved)} NEAR. Future commitments: {formatNear(report.financials.committed_future)} NEAR. Denied proposals do not add commitments.</p></> : <p className="disclosure-note">Budget totals are not selected for disclosure.</p>}
      {report.expenses.length ? <ul className="report-expenses">{report.expenses.map(expense => <li key={expense.resource}><div><strong>{expense.resource}</strong><span>{expense.payment === "SETTLED" ? "Seeded settled payment" : expense.payment === "SETTLEMENT_PENDING" ? "Seeded pending payment" : "Denied; no payment attempted"}</span>{expense.evidence ? <small>{expense.evidence.provisioning === "FIXTURE_OBSERVED" ? "Fixture observed · fixture check passed" : "No provisioning evidence · not checked"} · human acceptance not recorded</small> : null}</div><code>{formatNear(expense.due_now!)} NEAR</code></li>)}</ul> : <p className="disclosure-note">Purchase details are not selected for disclosure.</p>}
    </>}
    <div className="report-boundary"><ExecutionLabel /><p>No share link or client account system. This demo does not authenticate a human owner.</p></div>
  </div></div>;
}
