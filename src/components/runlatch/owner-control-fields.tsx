"use client";
import { useState } from "react";
import { OWNER_EFFECTS, type HumanWorkspaceMethod } from "@/lib/near/human-methods";

/** Produces draft arguments only; the issued owner review and Rust recheck all authority. */
export function OwnerControlFields({ method, onChange }: { method: HumanWorkspaceMethod; onChange: (json: string) => void }) {
  const [project, setProject] = useState(""), [revision, setRevision] = useState(""), [capsule, setCapsule] = useState(""), [request, setRequest] = useState("");
  const [provider, setProvider] = useState(""), [status, setStatus] = useState("PAUSED"), [flag, setFlag] = useState(true);
  function draft(values: Partial<{ project: string; revision: string; capsule: string; request: string; provider: string; status: string; flag: boolean }>) {
    const v = { project, revision, capsule, request, provider, status, flag, ...values };
    const args = method === "set_project_status" ? { project_id: v.project, expected_revision: v.revision, status: v.status }
      : method === "advance_project_revision" ? { project_id: v.project, expected_revision: v.revision }
      : method === "set_provider_status" ? { provider_id: v.provider, active: v.flag }
      : method === "set_capsule_paused" ? { capsule_id: v.capsule, paused: v.flag }
      : method === "reject_purchase" || method === "cancel_purchase" ? { capsule_id: v.capsule, request_id: v.request }
      : { capsule_id: v.capsule };
    onChange(JSON.stringify(args, null, 2));
  }
  const projectAction = method === "set_project_status" || method === "advance_project_revision";
  return <div className="owner-control-fields"><p>{OWNER_EFFECTS[method]}</p><div className="testnet-input-grid">
    {projectAction ? <><label>Project to control<input value={project} maxLength={64} autoComplete="off" onChange={e => { setProject(e.target.value); draft({ project: e.target.value }); }} /></label>
      <label>Expected current project revision<input value={revision} inputMode="numeric" maxLength={20} autoComplete="off" onChange={e => { setRevision(e.target.value); draft({ revision: e.target.value }); }} /></label></> : null}
    {method === "set_project_status" ? <label>New project status<select value={status} onChange={e => { setStatus(e.target.value); draft({ status: e.target.value }); }}>{["PAUSED", "ACTIVE", "CANCELLED", "COMPLETED"].map(s => <option key={s}>{s}</option>)}</select></label> : null}
    {method === "set_provider_status" ? <><label>Provider to control<input value={provider} maxLength={64} autoComplete="off" onChange={e => { setProvider(e.target.value); draft({ provider: e.target.value }); }} /></label>
      <label>Provider availability<select value={String(flag)} onChange={e => { const v = e.target.value === "true"; setFlag(v); draft({ flag: v }); }}><option value="true">Active</option><option value="false">Suspended</option></select></label></> : null}
    {!projectAction && method !== "set_provider_status" ? <label>Capsule to control<input value={capsule} maxLength={64} autoComplete="off" onChange={e => { setCapsule(e.target.value); draft({ capsule: e.target.value }); }} /></label> : null}
    {method === "set_capsule_paused" ? <label>Capsule authorization<select value={String(flag)} onChange={e => { const v = e.target.value === "true"; setFlag(v); draft({ flag: v }); }}><option value="true">Pause</option><option value="false">Resume if eligible</option></select></label> : null}
    {method === "reject_purchase" || method === "cancel_purchase" ? <label>Pending request to control<input value={request} maxLength={64} autoComplete="off" onChange={e => { setRequest(e.target.value); draft({ request: e.target.value }); }} /></label> : null}
  </div><p className="fine-print">Draft only. The target, exact owner/key, current state and 1 yoctoNEAR deposit are checked during review. No authority or money changes here.</p></div>;
}
