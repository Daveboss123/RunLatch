"use client";

import { useEffect, useRef, useState } from "react";
import { compileInstructions, SAMPLE_INSTRUCTIONS, MAX_INSTRUCTIONS } from "@/lib/policy/compiler";
import { POLICY_DEMO_CONTEXT as context } from "@/lib/policy/demo";
import { toManual, validateManual, type ManualTerms } from "@/lib/policy/manual";
import { approveLocalVersion, initialPolicyState, invalidateReview, setPolicyReview } from "@/lib/policy/review";
import { MAX_POLICY_JSON, parsePolicyJson, type PolicyTerms } from "@/lib/policy/schema";
import { formatNear } from "@/lib/preview/money";

const sample = compileInstructions(SAMPLE_INSTRUCTIONS, context);
if (!sample.ok) throw new Error("INVALID_POLICY_SAMPLE");
const samplePolicy = sample.policy;
const approvalErrors: Record<string, string> = {
  OWNER_APPROVAL_REQUIRED: "Review the rules and tick the owner-review checkbox before approving.",
  STALE_OR_INVALID_REVIEW: "The draft changed or is invalid. Validate and review it again.",
  CURRENT_CONTEXT_INVALID: "Project authority no longer matches this draft. It cannot be approved.",
  REVIEW_CONTEXT_CHANGED: "The reviewed project or provider recipients changed. Review the new context first.",
  POLICY_VERSION_ALREADY_APPROVED: "These exact terms are already approved locally. Edit the terms to propose a new version.",
  LOCAL_VERSION_LIMIT: "This page has eight local versions. Reload to start a new demo; no contract state will change.",
};
const fields = [
  ["budget", "Total allocation", "Maximum authority for this hypothetical new capsule, not a payment."],
  ["per_purchase_limit", "Maximum payment now", "Cap on each initial native NEAR transfer."],
  ["per_commitment_limit", "Maximum full commitment", "Cap on each purchase's immediate payment plus supported future obligations."],
  ["approval_threshold", "Owner approval above", "Strictly above this full commitment, exact owner approval is required. Blank disables only this threshold; 0 requires approval for every positive commitment."],
] as const;
type Mode = "instructions" | "manual" | "json";

function PolicyExplanation({ policy }: { policy: PolicyTerms }) {
  const rows = [
    ["Project and revision", `${policy.project_id}, revision ${policy.project_revision}`],
    ["Total allocation", `${formatNear(policy.budget)} NEAR; new hypothetical allocation, separate from storage and gas.`],
    ["Maximum payment now", `${formatNear(policy.per_purchase_limit)} NEAR per initial transfer.`],
    ["Maximum full commitment", `${formatNear(policy.per_commitment_limit)} NEAR including supported future obligations. Unknown or uncapped terms stay denied.`],
    ["Recurring purchases", policy.recurring_policy === "FORBIDDEN" ? "Forbidden, even if an owner approves an individual request." : "Only bounded recurring terms, with exact owner approval; approval never bypasses a denial."],
    ["Allowed services", policy.allowed_service_ids.join(", ")],
    ["Allowed categories", policy.allowed_categories.join(", ")],
    ["Maximum quantity", `${policy.max_quantity} canonical quote units per purchase.`],
    ["Owner approval above", policy.approval_threshold === null ? "No amount-triggered approval. All other rules and recurring approval still apply." : `${formatNear(policy.approval_threshold)} NEAR full commitment (strictly greater, not greater-or-equal).`],
    ["Expiry", `${new Date(Number(BigInt(policy.expires_at_ns) / 1_000_000n)).toISOString()} (UTC display). Exact expiry: ${policy.expires_at_ns} ns; evaluated against fixed demo time, not live authority.`],
  ];
  return <><dl className="policy-rules">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <h3>Allowed providers and fixed recipients</h3><ul className="policy-providers">{policy.allowed_provider_ids.map(id => {
      const provider = context.providers.find(item => item.id === id)!;
      return <li key={id}><strong>{id}</strong><span>Fixture recipient <code>{provider.recipient}</code></span></li>;
    })}</ul><p className="fine-print">Recipients come from canonical fixture quotes, not instructions. The Rust contract still loads its registered provider and canonical quote, checks current project/capsule authority, duplicate requests, funding and exact approvals. No rule grants unrestricted payment access.</p></>;
}

export function PolicyEditor() {
  const [mode, setMode] = useState<Mode>("instructions");
  const [instructions, setInstructions] = useState(SAMPLE_INSTRUCTIONS);
  const [json, setJson] = useState(JSON.stringify(samplePolicy, null, 2));
  const [manual, setManual] = useState<ManualTerms>(() => toManual(samplePolicy));
  const [state, setState] = useState(initialPolicyState);
  const [consent, setConsent] = useState(false);
  const [notice, setNotice] = useState("");
  const errors = useRef<HTMLDivElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const result = state.review?.result;
  const issues = result && !result.ok ? result.issues : [];
  useEffect(() => {
    if (state.review) {
      if (state.review.result.ok) reviewHeading.current?.focus();
      else errors.current?.focus();
    }
  }, [state.review]);
  function changed() {
    setState(previous => invalidateReview(previous));
    setConsent(false);
    setNotice("Draft changed. Validate and review again before approving a new version. Existing versions stay unchanged.");
  }
  function changeManual<K extends keyof ManualTerms>(field: K, value: ManualTerms[K]) {
    changed(); setManual(previous => ({ ...previous, [field]: value }));
  }
  function validate() {
    const next = mode === "instructions" ? compileInstructions(instructions, context) : mode === "manual" ? validateManual(manual, context) : parsePolicyJson(json, context);
    setState(previous => setPolicyReview(previous, next, context)); setConsent(false); setNotice("");
  }
  function approve() {
    try {
      const next = approveLocalVersion(state, state.epoch, consent, context);
      setState(next); setConsent(false);
      setNotice(`Version ${next.versions.length} active in this local demo only. No wallet, capsule creation or spending authority was activated.`);
    } catch (error) { setNotice(error instanceof Error ? approvalErrors[error.message] ?? "Local approval failed. No new version was created." : "Local approval failed. No new version was created."); }
  }
  function sampleAgain() {
    changed(); setInstructions(SAMPLE_INSTRUCTIONS); setJson(JSON.stringify(samplePolicy, null, 2)); setManual(toManual(samplePolicy));
    setNotice("Explicit example loaded. It is not an interpretation of your previous instructions. Validate it before review.");
  }
  function issueProps(field: string) {
    const hasError = fieldIssues(field).length > 0;
    return { "aria-invalid": hasError, "aria-describedby": `policy-${field}-help${hasError ? ` policy-${field}-error` : ""}` };
  }
  function fieldIssues(field: string) {
    return issues.filter(issue => mode === "instructions" ? field === "instructions" : mode === "json" ? field === "json" : issue.field === field);
  }
  const inlineError = (field: string) => fieldIssues(field).length ? <p className="field-error" id={`policy-${field}-error`}>{fieldIssues(field).map(issue => issue.message).join(" ")}</p> : null;
  return <div className="policy-editor">
    <section className="policy-draft" aria-labelledby="draft-title">
      <h2 id="draft-title">Draft purchasing rules</h2>
      <p>No LLM adapter is configured. Instructions are interpreted locally with a small explicit grammar, not general AI understanding. Nothing is uploaded or saved to browser storage.</p>
      <p className="fine-print">Hypothetical new allocation for <code>{context.project_id}</code>, revision {context.project_revision}. Ceiling 3.00 NEAR, existing allocations 0.00 in this what-if context. The seeded project board is not changed.</p>
      <label className="policy-label" htmlFor="policy-mode">Draft method</label>
      <select id="policy-mode" value={mode} onChange={event => { changed(); setMode(event.target.value as Mode); }}>
        <option value="instructions">Plain-language instructions</option><option value="manual">Manual form</option><option value="json">Structured JSON</option>
      </select>
      <form onSubmit={event => { event.preventDefault(); validate(); }} noValidate>
        {issues.length ? <div className="policy-errors" ref={errors} tabIndex={-1} role="alert" aria-labelledby="policy-error-title"><h3 id="policy-error-title">Resolve these rules before approval</h3><ul>{issues.map((issue, index) => {
          const field = mode === "instructions" ? "instructions" : mode === "json" ? "json" : ["project_id", "project_revision"].includes(issue.field) ? "mode" : issue.field;
          return <li key={`${issue.code}-${index}`}><a href={`#policy-${field}`}>{issue.message}</a></li>;
        })}</ul></div> : null}
        {mode === "instructions" ? <div className="policy-field"><label htmlFor="policy-instructions">Purchasing instructions</label>
          <p id="policy-instructions-help" className="fine-print">Use the example’s explicit limits and IDs. Vague terms such as “cheap”, duplicate rules and unsupported conditions block review. Do not enter private client information.</p>
          <textarea id="policy-instructions" rows={10} maxLength={MAX_INSTRUCTIONS} value={instructions} onChange={event => { changed(); setInstructions(event.target.value); }} {...issueProps("instructions")} />{inlineError("instructions")}</div>
          : mode === "json" ? <div className="policy-field"><label htmlFor="policy-json">Policy JSON (integer yoctoNEAR strings)</label><p id="policy-json-help" className="fine-print">Paste one untrusted terms object, at most 8 KiB. Required limits, selected project and known provider IDs are checked. Recipient and AI-decision fields are forbidden.</p>
            <textarea id="policy-json" rows={18} maxLength={MAX_POLICY_JSON} value={json} onChange={event => { changed(); setJson(event.target.value); }} spellCheck={false} {...issueProps("json")} />{inlineError("json")}</div>
          : <div className="policy-manual">
            {fields.map(([field, label, help]) => <div className="policy-field" key={field}><label htmlFor={`policy-${field}`}>{label} (NEAR)</label><p id={`policy-${field}-help`} className="fine-print">{help}</p>
              <input id={`policy-${field}`} inputMode="decimal" maxLength={40} value={manual[field]} onChange={event => changeManual(field, event.target.value)} {...issueProps(field)} />{inlineError(field)}</div>)}
            <div className="policy-field"><label htmlFor="policy-recurring_policy">Recurring purchases</label><p id="policy-recurring_policy-help" className="fine-print">Unbounded terms always fail. A low first payment is not the full obligation.</p><select id="policy-recurring_policy" value={manual.recurring_policy} onChange={event => changeManual("recurring_policy", event.target.value as ManualTerms["recurring_policy"])} {...issueProps("recurring_policy")}><option value="FORBIDDEN">Forbidden</option><option value="REQUIRE_APPROVAL">Require exact owner approval</option></select>{inlineError("recurring_policy")}</div>
            {(["allowed_provider_ids", "allowed_service_ids", "allowed_categories"] as const).map(field => {
              const options = field === "allowed_provider_ids" ? context.providers.map(provider => provider.id) : [...new Set(context.providers.flatMap(provider => field === "allowed_service_ids" ? [...provider.services] : [...provider.categories]))];
              const label = field === "allowed_provider_ids" ? "Allowed providers" : field === "allowed_service_ids" ? "Allowed services" : "Allowed categories";
              return <fieldset id={`policy-${field}`} key={field} className="policy-scope" tabIndex={-1} {...issueProps(field)}><legend>{label}</legend><p id={`policy-${field}-help`} className="fine-print">Choose explicit IDs from the existing fixture registry. No wildcard or invented identity.</p>{options.map(id => <label key={id}><input type="checkbox" checked={manual[field].includes(id)} onChange={event => changeManual(field, event.target.checked ? [...manual[field], id] : manual[field].filter(item => item !== id))} />{id}</label>)}{inlineError(field)}</fieldset>;
            })}
            <div className="policy-field"><label htmlFor="policy-max_quantity">Maximum quantity</label><p id="policy-max_quantity-help" className="fine-print">Canonical quote units, 1 to 50.</p><input id="policy-max_quantity" inputMode="numeric" maxLength={2} value={manual.max_quantity} onChange={event => changeManual("max_quantity", event.target.value)} {...issueProps("max_quantity")} />{inlineError("max_quantity")}</div>
            <div className="policy-field"><label htmlFor="policy-expires_at_ns">Expiry (nanoseconds)</label><p id="policy-expires_at_ns-help" className="fine-print">After fixed demo time {context.now_ns}, no later than project expiry {context.project_expires_at_ns}.</p><input id="policy-expires_at_ns" inputMode="numeric" maxLength={20} value={manual.expires_at_ns} onChange={event => changeManual("expires_at_ns", event.target.value)} {...issueProps("expires_at_ns")} />{inlineError("expires_at_ns")}</div>
          </div>}
        <div className="policy-actions"><button className="button" type="submit">Validate draft</button><button className="button button-secondary" type="button" onClick={sampleAgain}>Load explicit sample</button></div>
      </form>
    </section>
    <section className="policy-review" aria-labelledby="policy-review-title"><h2 id="policy-review-title" ref={reviewHeading} tabIndex={-1}>Review every rule</h2>
      {result?.ok ? <><p>Validated draft for local version {state.versions.length + 1}. Validation is not purchase approval.</p><PolicyExplanation policy={result.policy} />
        <details className="policy-json-review"><summary>Inspect all structured terms</summary><pre>{JSON.stringify(result.policy, null, 2)}</pre></details>
        <div className="policy-approval"><label><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />I have reviewed every limit, provider, fixed recipient and condition for this local version.</label>
          <button className="button" type="button" disabled={!consent || state.versions.length >= 8} onClick={approve}>Approve local version {state.versions.length + 1}</button>
          <p className="fine-print">This checkbox is not owner authentication. Real activation requires owner signing of a new immutable capsule, current project authority, a bound scoped agent/key, workflow and validation-spec hash, exact funding and the Rust policy hash. This editor cannot create or alter a contract capsule.</p></div>
      </> : <p>Validate a complete draft to inspect all conditions. Nothing can become active automatically.</p>}
      <p className="policy-notice" role="status">{notice}</p>
      <div className="policy-versions"><h3>Immutable local versions</h3>{state.versions.length ? <><p>Version {state.active_version} is the selected local example. Earlier versions remain unchanged; changing authority requires a new capsule in the real workflow.</p>{state.versions.map(version => <details key={version.version}><summary>Version {version.version}{version.version === state.active_version ? " · active local demo only" : " · previous reviewed version"}</summary><PolicyExplanation policy={version.policy} /><pre>{JSON.stringify(version.policy, null, 2)}</pre></details>)}</> : <p>No version approved. Drafting has no authority.</p>}<p className="fine-print">At most eight versions, kept in this page’s memory only. Reloading clears them. No policy here changes the Gate simulator or any live authorization.</p></div>
    </section>
  </div>;
}
