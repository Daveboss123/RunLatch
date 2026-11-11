"use client";
import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatNear } from "@/lib/preview/money";
import type { EvidenceProjectReport } from "@/lib/reporting/evidence-report";

function Contents({ report }: { report: EvidenceProjectReport }) {
  const f = report.financials;
  return <><p>Project <code>{report.project_id}</code> · {report.source} · native NEAR · {report.coverage.complete_project ? "complete selected project" : "partial Capsule coverage"}</p>
    <p>Ledger balances and verified native-payment evidence are separate. Provisioning/checks are owner-recorded facts, not independent supplier delivery or client acceptance.</p>
    {f ? <table><caption>Selected Capsule ledger · native NEAR</caption><tbody>{([
      ["Original funding", f.original_budget], ["Net allocated", f.allocated], ["Reported purchase spend", f.spent], ["Evidenced settled purchases", report.verified_purchase_spend!],
      ["Pending reservations", f.reserved], ["Future commitments", f.committed_future], ["Available now", f.available_now], ["Available to commit", f.available_to_commit], ["Returned funding", f.returned],
    ] as const).map(([label, value]) => <tr key={label}><th scope="row">{label}</th><td>{formatNear(value)}</td></tr>)}</tbody></table> : <p>Budget totals are not selected for disclosure.</p>}
    {report.expenses.length ? <ul className="canonical-report-expenses">{report.expenses.map(e => <li key={`${e.capsule_id}:${e.request_id}`}><h4>{e.request_id}</h4>
      <p>{e.provider_id ?? "No canonical provider"} · {e.service_id ?? "No canonical service"}</p>
      <dl className="detail-grid"><div><dt>Due now</dt><dd>{e.amount_due_now === null ? "Unavailable" : `${formatNear(e.amount_due_now)} NEAR`}</dd></div>
        <div><dt>Full commitment</dt><dd>{e.total_commitment === null ? "Unavailable" : `${formatNear(e.total_commitment)} NEAR`}</dd></div>
        <div><dt>Reported payment state</dt><dd>{e.payment_status}</dd></div><div><dt>Payment evidence</dt><dd>{e.payment_evidence}</dd></div>
        {"provisioning_status" in e ? <><div><dt>Provisioning</dt><dd>{e.provisioning_status}</dd></div><div><dt>Objective check</dt><dd>{e.task_check_status}</dd></div>
          <div><dt>Owner acceptance</dt><dd>{e.human_acceptance}{e.human_acceptance !== "NOT_RECORDED" && !e.acceptance_matches_current_evidence ? " · stale evidence" : ""}</dd></div></> : null}</dl>
    </li>)}</ul> : <p>No purchase details selected for disclosure.</p>}
    <p>{report.limitations}</p></>;
}
export function CanonicalReport({ report }: { report: EvidenceProjectReport }) {
  const [printing, setPrinting] = useState(false), [notice, setNotice] = useState("");
  const opener = useRef<HTMLButtonElement>(null), dialog = useRef<HTMLDialogElement>(null), titleId = useId();
  function close() { dialog.current?.close(); setPrinting(false); opener.current?.focus(); }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "runlatch-selected-report.json"; link.click(); URL.revokeObjectURL(url);
    setNotice("Selected canonical report downloaded. No upload or public share link was created.");
  }
  return <section className="canonical-report" aria-labelledby={titleId}><h3 id={titleId}>Selected project expense and outcome report</h3><Contents report={report} />
    <div className="hero-actions"><button type="button" className="button button-secondary" onClick={download}>Download selected canonical JSON</button>
      <button type="button" ref={opener} className="button button-secondary" onClick={() => setPrinting(true)}>Print selected canonical report</button></div><p role="status">{notice}</p>
    {printing ? createPortal(<dialog ref={el => { dialog.current = el; if (el && !el.open) el.showModal(); }} className="print-sheet" aria-label="Selected canonical client report" onCancel={e => { e.preventDefault(); close(); }}>
      <div className="print-sheet-top"><strong>RunLatch · selected canonical report</strong><button type="button" className="print-close" onClick={close}>Close report</button></div>
      <h3>Project Expense and Outcome Report</h3><Contents report={report} /><div className="print-actions"><button type="button" className="button" onClick={() => window.print()}>Print this report</button></div>
    </dialog>, document.body) : null}</section>;
}
