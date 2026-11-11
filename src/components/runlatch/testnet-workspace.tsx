"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { createTestnetReader, type ProjectSelection } from "@/lib/near/testnet-rpc";
import { parseTestnetTarget } from "@/lib/near/testnet-target";
import { count, object, parseBoundedJson } from "@/lib/near/records";
import { parseOwnerReturnIntent } from "@/lib/near/owner-return-evidence";
import { parsePurchaseObservationIntent } from "@/lib/near/testnet-evidence";
import { HUMAN_WORKSPACE_METHODS, confirmFreshHumanWorkspaceReview, exportHumanWorkspaceReview, readHumanWorkspaceReview, type HumanWorkspaceReview } from "@/lib/near/human-workspace";
import { connectInjectedWallet, disconnectInjectedWallet, discoverInjectedWallets, signExactAgentKeyInstall, signExactHumanCall,
  type AdmittedInjectedWallet, type ConnectedInjectedWallet } from "@/lib/near/injected-wallet";
import { confirmFreshAgentKeyInstallReview, type AgentKeyInstallReview } from "@/lib/near/agent-key-review";
import { DEMO_AGENT_SCOPE, DEMO_CAPSULE_ACTION, DEMO_PROJECT_ACTION, DEMO_QUOTE_ACTION, RUNLATCH_TESTNET_TARGET } from "@/lib/near/demo-operations";
import { fillStyle } from "@/lib/dither/style";
import { Status } from "./status";
import { HUMAN_METHOD_LABELS, OWNER_CONTROL_METHODS, OWNER_EFFECTS } from "@/lib/near/human-methods";
import { OwnerControlFields } from "./owner-control-fields";
import { createFixtureWorkflow } from "@/lib/near/fixture-workflow";
import { DEMO_CAPTURED_PURCHASE, DEMO_OPERATOR_KEY } from "@/lib/near/demo-operations";
import { attachReportEvidence } from "@/lib/reporting/evidence-report";
import { CanonicalReport } from "./canonical-report";
import type { ResourceCheckReport } from "@/lib/validation/resource";

type ReportRead = Awaited<ReturnType<ReturnType<typeof createTestnetReader>["readProject"]>>;
type ReceiptRead = Awaited<ReturnType<ReturnType<typeof createTestnetReader>["observePurchase"]>>;
type ReturnRead = Awaited<ReturnType<ReturnType<typeof createTestnetReader>["observeOwnerReturn"]>>;
const subscribeToHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
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
    {value.kind === "owner" ? <><h4>{HUMAN_METHOD_LABELS[value.review.action.method]}</h4><p>{OWNER_EFFECTS[value.review.action.method] ?? "Provisioning, objective checks and acceptance are separate owner attestations. A passed fixture check is not real-provider delivery or client acceptance. Payment facts and reservations are unchanged by preparing this review."}</p>
      {value.review.projected_project_revision ? <ExactFields rows={[["Projected revision if accepted", value.review.projected_project_revision], ["Old mandates", "Not rebound or revived"]]} /> : null}
      {value.review.potential_owner_return !== null ? <ExactFields rows={[["Potential owner return (yoctoNEAR)", value.review.potential_owner_return], ["Return recipient", value.review.target.operator_id], ["Returned now", "No — unsigned review only"]]} /> : null}</> : null}
    <h4>Exact call arguments</h4><pre aria-label="Exact unsigned call arguments">{JSON.stringify(r.call.args, null, 2)}</pre>
    <p className="fine-print">{r.limitation}</p>
  </article>;
}
function AgentKeySheet({ value }: { value: AgentKeyInstallReview }) {
  const permission = value.call.action.params.accessKey.permission;
  return <article className="testnet-review" aria-labelledby="agent-key-review-heading"><Status>Unsigned native key action</Status>
    <h3 id="agent-key-review-heading">Exact restricted-agent key review</h3><p>This installs gas authority only. The key can call one method on one Gate with zero deposit; Rust still controls providers, quotes, budgets, commitments and recipients.</p>
    <ExactFields rows={[["Network", value.call.network], ["Agent account", value.call.signer_id], ["Human recovery key", value.call.public_key],
      ["Restricted public key", value.call.action.params.publicKey], ["Allowed receiver", permission.receiverId], ["Allowed method", permission.methodNames[0]],
      ["Finite gas allowance (yoctoNEAR)", permission.allowance], ["Final block", value.reviewed_block.hash], ["Review hash", value.review_hash]]} />
    <p className="fine-print">{value.limitation}</p></article>;
}

export function TestnetWorkspace() {
  const hydrated = useSyncExternalStore(subscribeToHydration, clientReady, serverReady);
  const [rpc, setRpc] = useState("https://rpc.testnet.near.org/");
  const [contract, setContract] = useState(""), [operator, setOperator] = useState(""), [codeHash, setCodeHash] = useState("");
  const [allowRead, setAllowRead] = useState(false), [tab, setTab] = useState<"review" | "agent-key" | "receipt" | "owner-return" | "workflow" | "report">("review");
  const [method, setMethod] = useState<typeof HUMAN_WORKSPACE_METHODS[number]>("create_project");
  const [signer, setSigner] = useState(""), [publicKey, setPublicKey] = useState(""), [gas, setGas] = useState("");
  const [args, setArgs] = useState(""), [intentText, setIntentText] = useState("");
  const [project, setProject] = useState(""), [capsules, setCapsules] = useState(""), [providers, setProviders] = useState(""), [quotes, setQuotes] = useState("");
  const [budget, setBudget] = useState(false), [expenses, setExpenses] = useState(false), [evidence, setEvidence] = useState(false);
  const [artifact, setArtifact] = useState<Uint8Array | null>(null), [artifactLabel, setArtifactLabel] = useState("");
  const [review, setReview] = useState<HumanWorkspaceReview | null>(null), [keyReview, setKeyReview] = useState<AgentKeyInstallReview | null>(null);
  const [receipt, setReceipt] = useState<ReceiptRead | null>(null), [report, setReport] = useState<ReportRead | null>(null);
  const [ownerReturn, setOwnerReturn] = useState<ReturnRead | null>(null);
  const [fixtureMode, setFixtureMode] = useState("PROVISIONED"), [restoreFixture, setRestoreFixture] = useState(false), [acceptanceChoice, setAcceptanceChoice] = useState("");
  const [coordinator, setCoordinator] = useState<ReturnType<typeof createFixtureWorkflow> | null>(null), [fixtureCheck, setFixtureCheck] = useState<ResourceCheckReport | null>(null);
  const [workflowReceipt, setWorkflowReceipt] = useState<Awaited<ReturnType<ReturnType<typeof createFixtureWorkflow>["readReceipt"]>> | null>(null);
  const [exportAllowed, setExportAllowed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [wallets, setWallets] = useState<readonly AdmittedInjectedWallet[]>([]), [wallet, setWallet] = useState<ConnectedInjectedWallet | null>(null);
  const [walletBusy, setWalletBusy] = useState(false), [signConsent, setSignConsent] = useState(false);
  const [walletStatus, setWalletStatus] = useState("No wallet connected. Connection never signs a transaction."), [walletError, setWalletError] = useState(false);
  const [walletPhase, setWalletPhase] = useState<"idle" | "discovering" | "connecting">("idle");
  const walletOperation = useRef(0), walletLock = useRef(false);
  const [submission, setSubmission] = useState<Awaited<ReturnType<typeof signExactHumanCall>> | null>(null);
  const [keySubmission, setKeySubmission] = useState<Awaited<ReturnType<typeof signExactAgentKeyInstall>> | null>(null);
  const [notice, setNotice] = useState("No target selected. No network call or wallet connection.");
  const walletMatchesReview = Boolean(review && wallet?.accounts.some(item => item.accountId === review.review.call.signer_id && item.publicKey === review.review.call.public_key));
  const walletMatchesKeyReview = Boolean(keyReview && wallet?.accounts.some(item => item.accountId === keyReview.call.signer_id && item.publicKey === keyReview.call.public_key));
  const operation = useRef(0), controller = useRef<AbortController | null>(null), errorRef = useRef<HTMLParagraphElement>(null);
  const artifactRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => { operation.current++; walletOperation.current++; controller.current?.abort(); }, []);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  function invalidate(message = "Inputs changed. Previous reads cleared; no contract state or funds changed.") {
    operation.current++; controller.current?.abort(); controller.current = null;
    setBusy(false); setReview(null); setKeyReview(null); setReceipt(null); setOwnerReturn(null); setReport(null); setCoordinator(null); setFixtureCheck(null); setWorkflowReceipt(null); setExportAllowed(false); setSignConsent(false); setSubmission(null); setKeySubmission(null); setError(""); setNotice(message);
  }
  function edit(set: (v: string) => void, v: string) { invalidate(); set(v); }
  function clear() {
    invalidate("Workspace cleared from browser memory. No reservation released, payment retried or authority changed.");
    setAllowRead(false); setContract(""); setOperator(""); setCodeHash(""); setSigner(""); setPublicKey(""); setGas(""); setArgs(""); setIntentText("");
    setProject(""); setCapsules(""); setProviders(""); setQuotes(""); setBudget(false); setExpenses(false); setEvidence(false);
    setFixtureMode("PROVISIONED"); setRestoreFixture(false); setAcceptanceChoice("");
    setArtifact(null); setArtifactLabel(""); if (artifactRef.current) artifactRef.current.value = "";
  }
  function loadTarget() {
    invalidate("RunLatch public testnet target loaded. Permit the read explicitly before querying it.");
    setRpc(RUNLATCH_TESTNET_TARGET.rpc_url); setContract(RUNLATCH_TESTNET_TARGET.contract_id); setOperator(RUNLATCH_TESTNET_TARGET.operator_id); setCodeHash(RUNLATCH_TESTNET_TARGET.expected_code_hash);
  }
  function loadDemoAction(next: "project" | "capsule" | "quote") {
    invalidate("Recorded setup template loaded for inspection. This demo setup already completed; do not repeat its signing command or treat this template as new authority.");
    if (next === "project") {
      setMethod("create_project"); setSigner(DEMO_PROJECT_ACTION.signer_id); setPublicKey(DEMO_PROJECT_ACTION.public_key); setGas(DEMO_PROJECT_ACTION.gas); setArgs(JSON.stringify(DEMO_PROJECT_ACTION.args, null, 2));
    } else if (next === "capsule") {
      setMethod("create_capsule"); setSigner(DEMO_CAPSULE_ACTION.signer_id); setPublicKey(DEMO_CAPSULE_ACTION.public_key); setGas(DEMO_CAPSULE_ACTION.gas); setArgs(JSON.stringify(DEMO_CAPSULE_ACTION.args, null, 2));
    } else {
      setMethod("publish_quote"); setSigner(DEMO_QUOTE_ACTION.signer_id); setPublicKey(DEMO_QUOTE_ACTION.public_key); setGas(DEMO_QUOTE_ACTION.gas); setArgs(JSON.stringify(DEMO_QUOTE_ACTION.args, null, 2));
    }
  }
  async function connectSelected(selected: AdmittedInjectedWallet, seq: number) {
    setWalletPhase("connecting"); setWalletStatus(`Opening ${selected.name}. Choose the testnet account already held by your wallet.`);
    const connected = await connectInjectedWallet(selected);
    if (seq !== walletOperation.current) { await disconnectInjectedWallet(connected).catch(() => undefined); return; }
    const first = connected.accounts[0]; setWallet(connected); setWallets([]);
    invalidate(`Connected ${selected.name} in browser memory only. Prepare a fresh exact review before signing.`);
    setSigner(first.accountId); setPublicKey(first.publicKey);
    setWalletStatus(`${selected.name} connected. No transaction was signed; every action still needs a fresh review and separate wallet confirmation.`);
  }
  function walletStopped(seq: number) {
    if (seq !== walletOperation.current) return;
    setWalletError(true); setWalletStatus("Wallet connection was not completed. Unlock a compatible testnet extension and try connecting again, or continue reading without a wallet. No signature or fallback key was used.");
  }
  async function discover() {
    if (walletBusy || walletLock.current) return;
    walletLock.current = true; const seq = ++walletOperation.current;
    setWalletBusy(true); setWalletError(false); setWallets([]); setWalletPhase("discovering");
    setWalletStatus("Checking this browser for compatible testnet wallet extensions…");
    try {
      const found = await discoverInjectedWallets(); if (seq !== walletOperation.current) return;
      if (found.length === 1) await connectSelected(found[0], seq);
      else if (found.length > 1) {
        setWallets(found); setWalletStatus(`${found.length} compatible wallets found. Choose which wallet to open below.`);
      } else {
        setWalletError(true); setWalletStatus("No compatible wallet extension was detected in this browser. Use a browser with an installed, unlocked testnet extension, then check again. You can read the recorded demo without a wallet.");
      }
    } catch { walletStopped(seq); }
    finally { if (seq === walletOperation.current) { walletLock.current = false; setWalletBusy(false); setWalletPhase("idle"); } }
  }
  async function connect(selected: AdmittedInjectedWallet) {
    if (walletBusy || walletLock.current) return;
    walletLock.current = true; const seq = ++walletOperation.current;
    setWalletBusy(true); setWalletError(false);
    try { await connectSelected(selected, seq); } catch { walletStopped(seq); }
    finally { if (seq === walletOperation.current) { walletLock.current = false; setWalletBusy(false); setWalletPhase("idle"); } }
  }
  async function disconnect() {
    if (!wallet || walletBusy) return; setWalletBusy(true); setError("");
    try { await disconnectInjectedWallet(wallet); } catch { /* Clear local connection even when wallet sign-out is unavailable. */ }
    finally { setWallet(null); setWallets([]); setSignConsent(false); setSubmission(null); setKeySubmission(null); setWalletBusy(false); setWalletError(false); setWalletStatus("Disconnected from RunLatch. Contract authority and existing transactions are unchanged."); setNotice("Wallet session cleared from RunLatch memory. Contract authority and transactions are unchanged."); }
  }
  async function sign() {
    if (!wallet || !review || !signConsent || walletBusy) return;
    const seq = operation.current, abort = new AbortController(); controller.current = abort;
    setWalletBusy(true); setError(""); setSubmission(null); setNotice("Re-reading the exact action at a fresh final block before opening the wallet…");
    try {
      const reader = createTestnetReader(review.review.target);
      const fresh = await readHumanWorkspaceReview(reader, review.review.action,
        review.review.action.method === "record_task_check" ? { artifact } : undefined, abort.signal);
      if (seq !== operation.current || abort.signal.aborted) throw Error("WALLET_REVIEW_CANCELLED");
      const confirmed = confirmFreshHumanWorkspaceReview(review, fresh);
      const result = await signExactHumanCall(wallet, confirmed.call, review.review.target.rpc_url); setSubmission(result); setSignConsent(false);
      setNotice(`Wallet returned transaction ${result.transaction_hash}. This is not final settlement; inspect current state or captured purchase evidence next.`);
    } catch (cause) {
      const code = cause instanceof Error && /^[A-Z][A-Z0-9_]{0,79}$/u.test(cause.message) ? cause.message : "WALLET_ACTION_STOPPED";
      setError(`Wallet action stopped (${code}). Check current chain state before deciding anything; do not blindly repeat an uncertain transaction.`);
    } finally { setWalletBusy(false); setSignConsent(false); }
  }
  async function signAgentKey() {
    if (!wallet || !keyReview || !signConsent || walletBusy) return;
    const seq = operation.current, abort = new AbortController(); controller.current = abort;
    setWalletBusy(true); setError(""); setKeySubmission(null); setNotice("Re-reading the agent account and exact key absence before opening the wallet…");
    try {
      const reader = createTestnetReader(keyReview.target), fresh = await reader.readAgentKeyInstallReview(keyReview.scope, abort.signal);
      if (seq !== operation.current || abort.signal.aborted) throw Error("WALLET_REVIEW_CANCELLED");
      const confirmed = confirmFreshAgentKeyInstallReview(keyReview, fresh, { review_hash: keyReview.review_hash, consent: true });
      const result = await signExactAgentKeyInstall(wallet, confirmed.call, keyReview.target.rpc_url); setKeySubmission(result); setSignConsent(false);
      setNotice(`Wallet returned AddKey transaction ${result.transaction_hash}. Re-read the installed permission before any agent purchase.`);
    } catch (cause) {
      const code = cause instanceof Error && /^[A-Z][A-Z0-9_]{0,79}$/u.test(cause.message) ? cause.message : "AGENT_KEY_ACTION_STOPPED";
      setError(`Restricted-key action stopped (${code}). Check current account keys before any repeat; no agent purchase is enabled by this error.`);
    } finally { setWalletBusy(false); setSignConsent(false); }
  }
  async function read(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || walletBusy) return;
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
      } else if (tab === "agent-key") {
        const value = await reader.readAgentKeyInstallReview(DEMO_AGENT_SCOPE, abort.signal);
        if (seq !== operation.current) return; setKeyReview(value);
        setNotice("Exact restricted-key installation review prepared. No key was installed or wallet prompt opened.");
      } else if (tab === "receipt") {
        const intent = parsePurchaseObservationIntent(parseBoundedJson(intentText, 16_384));
        const value = await reader.observePurchase(intent, abort.signal);
        if (seq !== operation.current) return; setReceipt(value);
        setNotice("Captured transaction inspected once. Unknown outcomes retain reservations; no resend or release is available.");
      } else if (tab === "owner-return") {
        const intent = parseOwnerReturnIntent(parseBoundedJson(intentText, 16_384));
        const value = await reader.observeOwnerReturn(intent, abort.signal);
        if (seq !== operation.current) return; setOwnerReturn(value);
        setNotice("Owner-return transaction inspected once. Transfer, callback and ledger must agree; unknown returns stay unverified.");
      } else if (tab === "workflow") {
        const intent = parsePurchaseObservationIntent(parseBoundedJson(intentText, 16384));
        const workflow = createFixtureWorkflow({ target, intent, owner: { signer_id: signer, public_key: publicKey, gas }, fixture_result: fixtureMode }, reader);
        if (restoreFixture) {
          const value = await workflow.restoreArtifact(artifact, abort.signal);
          if (seq !== operation.current) return; setFixtureCheck(value.fixture_check);
          setNotice("Exact fixture bytes restored against recorded hashes. No new attestation or payment was made.");
        } else {
          const value = await workflow.reviewProvisioning(abort.signal);
          if (seq !== operation.current) return; setReview({ kind: "owner", review: value.review }); setFixtureCheck(value.fixture_check);
          setNotice("Native settlement proved; controlled fixture prepared once. Provisioning review is unsigned, not recorded.");
        }
        setCoordinator(workflow); setArtifact(workflow.artifactCopy());
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
  function captureReturn() {
    if (!submission || review?.kind !== "owner") return;
    const action = review.review.action; if (action.method !== "close_capsule") return;
    const r = review.review, c = object(object(r.reviewed_state.snapshot).capsule);
    const intent = parseOwnerReturnIntent({ transaction_hash: submission.transaction_hash, sender_id: r.call.signer_id,
      public_key: r.call.public_key, gas: r.call.gas, capsule_id: action.args.capsule_id,
      expected_attempt: r.potential_owner_return === "0" ? null : count(c.refund_attempts, 0xffff_ffff) + 1 });
    invalidate("Captured owner-return identity loaded for a separate read. No return or release is inferred from a wallet hash.");
    setTab("owner-return"); setIntentText(JSON.stringify(intent, null, 2));
  }
  function loadWorkflowIdentity() {
    loadTarget(); setSigner(RUNLATCH_TESTNET_TARGET.operator_id); setPublicKey(DEMO_OPERATOR_KEY); setGas("50000000000000");
    setIntentText(JSON.stringify(DEMO_CAPTURED_PURCHASE, null, 2));
    setNotice("Recorded unresolved purchase identity loaded. Workflow will stop unless its real native settlement is proved; no resend or fixture claim is inferred.");
  }
  async function workflowStep(step: "check" | "acceptance" | "receipt") {
    if (!coordinator || !allowRead || busy || walletBusy) return;
    const workflow = coordinator; invalidate(); const seq = operation.current, abort = new AbortController(); controller.current = abort;
    setBusy(true); setNotice("Re-reading payment and recorded workflow state. No automatic signature or acceptance…");
    try {
      if (step === "receipt") {
        const value = await workflow.readReceipt({ budget, expenses, evidence }, abort.signal);
        if (seq !== operation.current) return; setWorkflowReceipt(value);
        setNotice("Workflow receipt/report read from current evidence. Missing or stale acceptance stays explicit.");
      } else {
        const value = step === "check" ? await workflow.reviewTaskCheck(abort.signal) : await workflow.reviewAcceptance(acceptanceChoice, abort.signal);
        if (seq !== operation.current) return; setReview({ kind: "owner", review: value.review });
        setNotice("Next exact owner review prepared. A wallet hash is not a recorded attestation; each next stage rechecks actual state.");
      }
      setCoordinator(workflow); setArtifact(workflow.artifactCopy());
    } catch (error) {
      if (seq !== operation.current) return; setCoordinator(workflow);
      const code = error instanceof Error && /^[A-Z_]{1,64}$/u.test(error.message) ? error.message : "WORKFLOW_READ_STOPPED";
      setError(`Workflow stopped (${code}). No signature, acceptance, release or resend. Record the exact preceding step or restore matching bytes before continuing.`);
    } finally { if (seq === operation.current) setBusy(false); }
  }
  function exportFixture() {
    if (!coordinator || !artifact || busy || walletBusy) return;
    const url = URL.createObjectURL(new Blob([new Uint8Array(artifact).buffer], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "runlatch-exact-fixture.json"; link.click(); URL.revokeObjectURL(url);
    setNotice("Exact controlled fixture downloaded by your request. Keep these bytes for restart/handoff; no upload or automatic persistence.");
  }
  return <div className="testnet-workspace">
    <aside className="testnet-boundary"><Status>{wallet ? "Wallet connected · testnet only" : "Exact review · testnet only"}</Status><h2>Human authority stays outside the agent.</h2>
      <p>RunLatch can prepare and sign one exact owner/provider contract action through a compatible injected testnet wallet. The wallet keeps the human key; RunLatch stores no wallet session or secret. Restricted agent purchases still use the separate scoped local runner.</p>
      <p>Never paste a private key, seed phrase or credential. Only public account IDs, public keys, exact contract arguments and explicitly selected fixture bytes belong here.</p></aside>
    <section className="wallet-connection" aria-labelledby="wallet-connection-heading"><div><h3 id="wallet-connection-heading">Owner wallet</h3><p>{wallet
      ? `${wallet.name} connected in memory with ${wallet.accounts.length} testnet account${wallet.accounts.length === 1 ? "" : "s"}. Every transaction still needs a fresh exact review and wallet confirmation.`
      : "Optional: connect an account already held by a testnet wallet extension. This button opens one detected wallet or lets you choose between several. No private key belongs in RunLatch."}</p></div>
      <div className="wallet-actions">{wallet ? <button type="button" className="button button-secondary" disabled={walletBusy} onClick={() => void disconnect()}>Disconnect wallet</button>
        : <button type="button" className="button" aria-describedby="wallet-status" disabled={!hydrated} aria-disabled={walletBusy} onClick={() => void discover()}>{walletBusy ? walletPhase === "connecting" ? "Opening wallet…" : "Looking for wallets…" : "Connect browser wallet"}</button>}
        {!wallet && wallets.map(item => <button type="button" className="button button-secondary" key={item.id} disabled={walletBusy} onClick={() => void connect(item)}>Use {item.name}</button>)}</div>
      {wallet ? <label>Connected signing account<select aria-label="Connected signing account" disabled={walletBusy} value={`${signer}:${publicKey}`} onChange={event => {
        const selected = wallet.accounts.find(item => `${item.accountId}:${item.publicKey}` === event.target.value); if (!selected) return;
        invalidate("Connected wallet account selected. Prepare a new exact review."); setSigner(selected.accountId); setPublicKey(selected.publicKey);
      }}>{wallet.accounts.map(item => <option key={`${item.accountId}:${item.publicKey}`} value={`${item.accountId}:${item.publicKey}`}>{item.accountId} · {item.publicKey}</option>)}</select></label> : null}
      <div className="wallet-feedback" data-error={walletError}><p id="wallet-status" role="status" aria-atomic="true">{walletStatus}</p>{walletError ? <a href="/docs#wallet" className="text-link">Read browser wallet requirements</a> : null}</div>
      <p className="wallet-demo-note">Demo setup is FINAL and recorded above. The one terminal-signed purchase remains unresolved; never resend it or repeat setup. This browser holds none of the demo keys. Reading records needs no wallet.</p>
    </section>
    <form onSubmit={read} noValidate inert={walletBusy}>
      <fieldset className="testnet-target"><legend>Explicit testnet target</legend><div className="testnet-template-actions"><button type="button" className="text-button" onClick={loadTarget}>Load RunLatch testnet target</button></div><div className="testnet-input-grid">
        <label>Read-only RPC<select aria-label="Read-only RPC" value={rpc} onChange={e => edit(setRpc, e.target.value)}><option>https://rpc.testnet.near.org/</option><option>https://test.rpc.fastnear.com/</option></select></label>
        <label>Contract account<input autoComplete="off" spellCheck={false} maxLength={64} value={contract} onChange={e => edit(setContract, e.target.value)} /></label>
        <label>Operator account<input autoComplete="off" spellCheck={false} maxLength={64} value={operator} onChange={e => edit(setOperator, e.target.value)} /></label>
        <label>Expected deployed code hash<input autoComplete="off" spellCheck={false} maxLength={44} value={codeHash} onChange={e => edit(setCodeHash, e.target.value)} /></label>
      </div><label className="testnet-check"><input type="checkbox" checked={allowRead} onChange={e => { invalidate(); setAllowRead(e.target.checked); }} /><span>I permit read-only RPC requests to this target. Selected public IDs and contract data are visible to the RPC operator. This does not authorize signing or payment.</span></label></fieldset>
      <label className="testnet-mode">Workspace task<select aria-label="Workspace task" value={tab} onChange={e => { invalidate(); setTab(e.target.value as typeof tab); }}>
        <option value="review">Prepare a human-action review</option><option value="agent-key">Install the restricted agent key</option><option value="receipt">Inspect a captured purchase</option><option value="owner-return">Inspect an unused-fund return</option><option value="workflow">Database outcome workflow</option><option value="report">Read a selected project report</option></select></label>
      {tab === "review" ? <fieldset><legend>Exact owner or provider action</legend><div className="testnet-input-grid">
        <label>Action<select aria-label="Action" value={method} onChange={e => { invalidate(); setMethod(e.target.value as typeof method); setArgs(""); setArtifact(null); setArtifactLabel(""); }}>{HUMAN_WORKSPACE_METHODS.map(m => <option key={m} value={m}>{HUMAN_METHOD_LABELS[m]}</option>)}</select></label>
        <label>Signer account<input value={signer} maxLength={64} autoComplete="off" spellCheck={false} onChange={e => edit(setSigner, e.target.value)} /></label>
        <label>Human wallet public key<input value={publicKey} maxLength={52} autoComplete="off" spellCheck={false} onChange={e => edit(setPublicKey, e.target.value)} /></label>
        <label>Exact gas limit (gas units)<input inputMode="numeric" value={gas} maxLength={20} autoComplete="off" onChange={e => edit(setGas, e.target.value)} /></label>
      </div>{OWNER_CONTROL_METHODS.includes(method) ? <OwnerControlFields key={method} method={method} onChange={v => edit(setArgs, v)} /> : <div className="testnet-template-actions"><span>Recorded setup templates · inspection only</span><button type="button" className="text-button" onClick={() => loadDemoAction("project")}>Load new work order</button><button type="button" className="text-button" onClick={() => loadDemoAction("capsule")}>Load funded Capsule</button><button type="button" className="text-button" onClick={() => loadDemoAction("quote")}>Load canonical quote</button></div>}<label>Exact {method === "approve_purchase" ? "proposal and expected request hash" : "arguments"} JSON<textarea value={args} maxLength={16_384} spellCheck={false} autoComplete="off" rows={OWNER_CONTROL_METHODS.includes(method) ? 5 : 9} onChange={e => edit(setArgs, e.target.value)} /></label>
        <p className="fine-print">Use the existing documented method schema. Amounts and nanoseconds are decimal strings; never floating-point money. Deposits are derived by the existing review, not a free payment field. No submit_purchase or administrative bypass is exposed.</p>
        {method === "record_task_check" ? <div><label>Explicit local fixture artifact (optional only for a report validated against missing bytes)<input ref={artifactRef} type="file" onChange={e => void loadArtifact(e.target.files?.[0])} /></label><p>{artifactLabel || "No artifact selected. A passed report cannot be prepared without its exact valid artifact."}</p></div> : null}
      </fieldset> : tab === "agent-key" ? <fieldset><legend>Exact restricted-agent key</legend><p>Install one finite ordinary function-call key on <code>{DEMO_AGENT_SCOPE.agent_id}</code>. It can call only <code>submit_purchase</code> on <code>{RUNLATCH_TESTNET_TARGET.contract_id}</code>; the separate human recovery key remains.</p><ExactFields rows={[["Agent account", DEMO_AGENT_SCOPE.agent_id], ["Human recovery public key", DEMO_AGENT_SCOPE.recovery_public_key], ["Restricted public key", DEMO_AGENT_SCOPE.public_key], ["Finite gas allowance (yoctoNEAR)", DEMO_AGENT_SCOPE.max_allowance]]} /></fieldset>
        : tab === "receipt" ? <fieldset><legend>Previously captured purchase identity</legend><label>Exact observation intent JSON<textarea rows={10} value={intentText} maxLength={16_384} spellCheck={false} autoComplete="off" onChange={e => edit(setIntentText, e.target.value)} /></label>
        <p>Use the captured transaction hash, sender/public key, method, gas, proposal and expected request hash. A hash alone never proves settlement. Only one explicit status lookup; no polling, resend or re-sign.</p></fieldset>
        : tab === "owner-return" ? <fieldset><legend>Captured owner-return identity</legend><label>Exact owner-return observation JSON<textarea rows={8} value={intentText} maxLength={16_384} spellCheck={false} autoComplete="off" onChange={e => edit(setIntentText, e.target.value)} /></label><p>Inspect only an already returned transaction hash, owner/key, Capsule and expected refund attempt (null for a zero-unused close). This is read-only; timeout never releases or retries a return.</p></fieldset>
        : tab === "workflow" ? <fieldset><legend>Purchase to recorded outcome</legend><p>Requires an already settled native purchase and private callback. Generates only a controlled database fixture, not a real database. Owner signatures and acceptance remain explicit, one stage at a time.</p>
          <button type="button" className="text-button" onClick={loadWorkflowIdentity}>Load recorded purchase for readback</button>
          <div className="testnet-input-grid"><label>Outcome owner account<input value={signer} maxLength={64} autoComplete="off" onChange={e => edit(setSigner, e.target.value)} /></label>
            <label>Outcome owner public key<input value={publicKey} maxLength={52} autoComplete="off" onChange={e => edit(setPublicKey, e.target.value)} /></label>
            <label>Outcome gas limit<input value={gas} maxLength={20} inputMode="numeric" onChange={e => edit(setGas, e.target.value)} /></label>
            <label>Controlled fixture result<select value={fixtureMode} onChange={e => { invalidate(); setFixtureMode(e.target.value); }}>{["PROVISIONED", "FAILED", "MISSING"].map(v => <option key={v}>{v}</option>)}</select></label></div>
          <label>Original captured purchase JSON<textarea value={intentText} maxLength={16384} rows={7} onChange={e => edit(setIntentText, e.target.value)} /></label>
          <label className="testnet-check"><input type="checkbox" checked={restoreFixture} onChange={e => { invalidate(); setRestoreFixture(e.target.checked); }} />Restore an already recorded fixture using exact selected bytes (null only for MISSING), rather than generating new bytes.</label>
          {restoreFixture ? <label>Exact recorded fixture file<input ref={artifactRef} type="file" accept=".json,application/json" onChange={e => void loadArtifact(e.target.files?.[0])} /></label> : null}
          <p>{artifactLabel || "Fixture bytes stay in memory until explicitly downloaded or selected. Hash mismatch stops restoration."}</p>
        </fieldset>
        : <fieldset><legend>Owner-selected report scope</legend><div className="testnet-input-grid">
          <label>Project ID<input value={project} maxLength={64} autoComplete="off" onChange={e => edit(setProject, e.target.value)} /></label>
          <label>Capsule IDs (comma-separated, at most 4)<input value={capsules} maxLength={260} autoComplete="off" onChange={e => edit(setCapsules, e.target.value)} /></label>
          <label>Provider IDs (comma-separated, at most 3)<input value={providers} maxLength={195} autoComplete="off" onChange={e => edit(setProviders, e.target.value)} /></label>
          <label>Quote IDs (comma-separated, at most 16)<input value={quotes} maxLength={1040} autoComplete="off" onChange={e => edit(setQuotes, e.target.value)} /></label></div>
          <div className="testnet-disclosure">{([["Show budget", budget, setBudget], ["Show expenses", expenses, setExpenses], ["Show evidence", evidence, setEvidence]] as const).map(([label, checked, set]) => <label key={label} className="testnet-check"><input type="checkbox" checked={checked} onChange={e => { invalidate(); set(e.target.checked); }} />{label}</label>)}</div>
          <p>All visibility flags start off. The RPC still reads the selected canonical records to check consistency; these flags control the report shown here, not on-chain confidentiality.</p></fieldset>}
      <div className="testnet-actions"><button type="submit" className="button button-primary" disabled={busy || !allowRead}>{busy ? "Reading selected records…" : tab === "review" ? "Read and prepare unsigned review" : tab === "agent-key" ? "Review restricted key installation" : tab === "receipt" ? "Inspect captured purchase once" : tab === "owner-return" ? "Inspect owner return once" : tab === "workflow" ? restoreFixture ? "Restore recorded outcome fixture" : "Verify payment and prepare provisioning" : "Read selected project report"}</button>
        {busy ? <button type="button" className="button button-secondary" onClick={() => invalidate("Read cancelled. No signature, payment, release or resend; late results cannot populate this view.")}>Cancel read</button> : null}
        <button type="button" className="button button-secondary" onClick={clear}>Clear workspace</button></div>
    </form>
    <p role="status" className="testnet-notice">{notice}</p><p ref={errorRef} tabIndex={-1} role={error ? "alert" : undefined} className="testnet-error">{error}</p>
    {tab === "workflow" && coordinator ? <section className="testnet-review"><h3>Continue only from recorded evidence</h3>
      {fixtureCheck ? <p>Local fixture check: {fixtureCheck.status} · {fixtureCheck.artifact_hash ?? "No artifact"}. Not an attestation or client acceptance.</p> : null}
      <div className="hero-actions"><button type="button" className="button button-secondary" disabled={busy || walletBusy || !artifact} onClick={exportFixture}>Download exact fixture bytes</button>
        <button type="button" className="button button-secondary" disabled={busy || walletBusy} onClick={() => void workflowStep("check")}>Re-read provisioning and prepare task check</button></div>
      <label>Explicit owner outcome choice<select value={acceptanceChoice} disabled={busy || walletBusy} onChange={e => { setReview(null); setSignConsent(false); setSubmission(null); setAcceptanceChoice(e.target.value); }}><option value="">Choose explicitly</option><option>ACCEPTED</option><option>REJECTED</option></select></label>
      <div className="hero-actions"><button type="button" className="button button-secondary" disabled={busy || walletBusy || !acceptanceChoice} onClick={() => void workflowStep("acceptance")}>Re-read task and prepare explicit acceptance</button>
        <button type="button" className="button button-secondary" disabled={busy || walletBusy} onClick={() => void workflowStep("receipt")}>Read recorded workflow receipt</button></div>
      <div className="testnet-disclosure">{([["Show workflow budget", budget, setBudget], ["Show workflow expenses", expenses, setExpenses], ["Show workflow evidence", evidence, setEvidence]] as const).map(([label, checked, set]) => <label key={label} className="testnet-check"><input type="checkbox" checked={checked} disabled={busy || walletBusy} onChange={e => { setWorkflowReceipt(null); set(e.target.checked); }} />{label}</label>)}</div>
    </section> : null}
    <div aria-busy={busy || walletBusy}>{review ? <><ReviewSheet value={review} /><div className="wallet-signing"><h3>Confirm this exact action</h3><p>The wallet prompt must show the same signer, receiver, method, gas and deposit. RunLatch re-reads current state before opening it. A wallet return is not settlement proof.</p>
      <label className="testnet-check"><input type="checkbox" checked={signConsent} onChange={event => setSignConsent(event.target.checked)} disabled={!walletMatchesReview || walletBusy} />I reviewed this exact action and want the connected wallet to prompt for this one testnet transaction.</label>
      <button type="button" className="button" disabled={!walletMatchesReview || !signConsent || walletBusy} onClick={() => void sign()}>{walletBusy ? "Re-reading exact state…" : "Sign exact reviewed action"}</button>
      {wallet && !walletMatchesReview ? <p className="fine-print">The connected account and public key do not match this review. Select the exact account already held by your wallet; never import a private key into RunLatch.</p> : null}
      {!wallet ? <p className="fine-print">Connect a compatible injected testnet wallet above, or use the documented own-terminal helper for an account held only in Windows Credential Manager.</p> : null}
      {submission ? <div className="wallet-submission" role="status"><strong>Wallet returned a transaction identity</strong><code>{submission.transaction_hash}</code><p>{submission.limitation}</p>{review.kind === "owner" && review.review.action.method === "close_capsule" ? <button type="button" className="text-button" onClick={captureReturn}>Prepare read-only return lookup</button> : null}</div> : null}</div>
      <div className="testnet-export"><label className="testnet-check"><input type="checkbox" checked={exportAllowed} onChange={e => setExportAllowed(e.target.checked)} />I permit export of this full unsigned review, including public IDs, policy and commercial/evidence metadata. No fixture bytes or private keys are included.</label><button type="button" className="button button-secondary" disabled={!exportAllowed || busy} onClick={download}>Export unsigned review</button></div></> : null}
      {keyReview ? <><AgentKeySheet value={keyReview} /><div className="wallet-signing"><h3>Confirm this exact key installation</h3><p>The connected wallet must control the displayed human recovery key. RunLatch rechecks that it is the only current key and that the restricted key is still absent before opening the prompt.</p>
        <label className="testnet-check"><input type="checkbox" checked={signConsent} onChange={event => setSignConsent(event.target.checked)} disabled={!walletMatchesKeyReview || walletBusy} />I reviewed the exact agent account, restricted key, Gate, submit-only method and finite gas allowance.</label>
        <button type="button" className="button" disabled={!walletMatchesKeyReview || !signConsent || walletBusy} onClick={() => void signAgentKey()}>{walletBusy ? "Re-reading account keys…" : "Install exact restricted key"}</button>
        {wallet && !walletMatchesKeyReview ? <p className="fine-print">The connected wallet does not expose this exact agent recovery account and public key. No key installation prompt is enabled.</p> : null}
        {!wallet ? <p className="fine-print">Connect the wallet holding the agent recovery account, or use the separately reviewed own-terminal key-install flow.</p> : null}
        {keySubmission ? <div className="wallet-submission" role="status"><strong>Wallet returned an AddKey transaction identity</strong><code>{keySubmission.transaction_hash}</code><p>{keySubmission.limitation}</p></div> : null}</div></> : null}
      {receipt ? <article className="testnet-review"><h3>Observed purchase evidence</h3><ExactFields rows={[["Transport source", receipt.transport_source], ["Purchase payment evidence", receipt.payment_evidence], ["Transaction status", receipt.submission],
        ["Actual Gate decision", receipt.actual_decision ?? "Not evidenced"], ["Initiating receipt", receipt.initial_receipt_id ?? "Not evidenced"],
        ["Native transfer receipt", receipt.transfer_receipt_id ?? "Not evidenced"], ["Private callback receipt", receipt.callback_receipt_id ?? "Not evidenced"]]} />
        <p>Payment evidence is separate from fixture provisioning, objective checks and explicit human acceptance. Unknown or unproven outcomes retain reservations; there is no release or resend here.</p>
        <pre aria-label="Read-only purchase evidence details">{JSON.stringify(receipt, null, 2)}</pre></article> : null}
      {report ? <article className="testnet-review"><h3>Selected project report</h3><ExactFields rows={[["Final block", report.block.hash], ["Settlement verification", report.settlement_verification], ["Coverage", report.report.coverage.complete_project ? "Complete selected project" : "Partial capsule coverage"]]} />
        <p>Amounts are integer yoctoNEAR. Reported ledger settlement is not transfer/private-callback proof. No margin, savings or real-client acceptance is inferred.</p>
        <pre aria-label="Owner-selected project report">{JSON.stringify(report.report, null, 2)}</pre></article> : null}
      {ownerReturn ? <article className="testnet-review"><h3>Owner-return evidence</h3><ExactFields rows={[["Evidence", ownerReturn.owner_return_evidence], ["Transaction status", ownerReturn.submission],
        ["Return amount (yoctoNEAR)", ownerReturn.amount ?? "Not evidenced"], ["Native transfer", ownerReturn.transfer_receipt_id ?? "Not evidenced"], ["Private callback", ownerReturn.callback_receipt_id ?? "Not evidenced"]]} />
        <p>{ownerReturn.limitation}</p><p>Owner returns are not provider spend or task-quality refunds. No reservation release, resend or retry is exposed here.</p></article> : null}
      {workflowReceipt?.payment.final_record ? <CanonicalReport report={attachReportEvidence(workflowReceipt.report, [{ record: workflowReceipt.payment.final_record,
        payment_evidence: "SETTLED", milestones: [] }])} /> : null}</div>
  </div>;
}
