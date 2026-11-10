/** Human own-terminal only. Read-only --preflight/--check never sign, send, create claims or resume. */
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { lstat, readFile, mkdir, open } from "node:fs/promises";
import { join, resolve } from "node:path";
import { object, parseBoundedJson } from "../../src/lib/near/records.ts";
import { canonicalReviewContent as canonical } from "../../src/lib/near/review-content.ts";
import { confirmFreshSetupReview, prepareSetupReview } from "../../src/lib/near/setup-review.ts";
import { confirmFreshAgentKeyInstallReview, prepareAgentKeyInstallReview } from "../../src/lib/near/agent-key-review.ts";
import { DEMO_AGENT_SCOPE, DEMO_OPERATOR_KEY, DEMO_PROVIDER_KEY, RUNLATCH_TESTNET_TARGET as target } from "../../src/lib/near/demo-operations.ts";
import { parsePublicDemoKeys } from "./human-create-demo-parent.ts";
import { demoKinds, demoSetupAction, demoAnswer, encodeDemoTransaction, verifyDemoSignature, type DemoKind } from "./demo-operation-codec.ts";
import { demoRpc, inspectDemoExecution } from "./demo-operation-rpc.ts";
import { admitHumanDemoSigner, signHumanDemo } from "./human-demo-operation-signer.ts";
import type { ChildTransport } from "./child-account-rpc.ts";

const root = fileURLToPath(new URL("../../", import.meta.url)), local = join(root, ".local", "human-key-setup");
const feeCushion = 30000000000000000000000n, issued = new WeakSet<object>();
let entryPhase = "LOCAL_PREFLIGHT";
async function safeDirectory(path: string) {
  const meta = await lstat(path); if (!meta.isDirectory() || meta.isSymbolicLink()) throw Error("DEMO_DIRECTORY_UNSAFE");
}
async function publicJson(path: string) {
  const meta = await lstat(path); if (!meta.isFile() || meta.isSymbolicLink() || meta.size > 32768) throw Error("DEMO_RECORD_UNSAFE");
  return parseBoundedJson(await readFile(path, "utf8"), 32768);
}
export async function writeDemoRecord(directory: string, name: string, value: unknown) {
  if (!["review.json", "intent.json", "entered.json", "verified.json"].includes(name)) throw Error("DEMO_RECORD_NAME_INVALID");
  await safeDirectory(directory);
  const bytes = canonical(value); if (Buffer.byteLength(bytes) > 32768) throw Error("DEMO_RECORD_LIMIT");
  const file = await open(join(directory, name), "wx", 0o600);
  try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
}
function attemptDirectory(kind: DemoKind) { return join(local, `demo-${kind}-attempt`); }
export function demoHumanKey(kind: DemoKind) {
  if (!demoKinds.includes(kind)) throw Error("DEMO_KIND_INVALID");
  return ["project", "capsule"].includes(kind) ? DEMO_OPERATOR_KEY : kind === "quote" ? DEMO_PROVIDER_KEY : DEMO_AGENT_SCOPE.recovery_public_key;
}
/** Alternate public keys/transport are an offline generated-test port, never CLI account selection. */
export async function prepareDemoOperation(kind: DemoKind, publicKey = demoHumanKey(kind), transport?: ChildTransport) {
  if (!demoKinds.includes(kind)) throw Error("DEMO_KIND_INVALID");
  const started = Date.now(), rpc = demoRpc(transport ?? fetch), state = await rpc.state(kind, publicKey);
  if (BigInt(state.nonce) >= BigInt(Number.MAX_SAFE_INTEGER)) throw Error("DEMO_NONCE_RPC_LIMIT");
  const transportSource = transport ? "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE" as const : "EXPLICIT_TESTNET_HTTP_READBACK" as const;
  const action = demoSetupAction(kind);
  const content = kind === "agent-key"
    ? { kind: "agent-key" as const, review: await prepareAgentKeyInstallReview(target, { ...DEMO_AGENT_SCOPE, recovery_public_key: publicKey },
      { block: state.block, access_keys: state.access_keys, transport_source: transportSource }) }
    : { kind: "setup" as const, review: await prepareSetupReview(target, { ...action, public_key: publicKey },
      { block: state.block, storage: state.storage, signer_access: { nonce: Number(state.nonce), permission: "FullAccess" },
        existing_record: kind === "project" ? state.project : kind === "capsule" ? state.capsule : state.quote,
        project: kind === "capsule" ? state.project : null,
        providers: kind === "project" ? [] : [state.provider], previous_quote: null, transport_source: transportSource }) };
  const call = content.review.call;
  const encoded = content.kind === "agent-key"
    ? encodeDemoTransaction({ kind, network: "testnet", signer_id: call.signer_id, receiver_id: call.receiver_id, public_key: publicKey,
      nonce: (BigInt(state.nonce) + 1n).toString(), block_hash: state.block.hash, action: content.review.call.action })
    : encodeDemoTransaction({ kind, network: "testnet", signer_id: call.signer_id, receiver_id: call.receiver_id, public_key: publicKey,
      nonce: (BigInt(state.nonce) + 1n).toString(), block_hash: state.block.hash, method: content.review.call.method,
      args: content.review.call.args, gas: content.review.call.gas, deposit: content.review.call.attached_deposit });
  const fees = await rpc.fees(state.block, encoded.transaction);
  // AddKey reserves account storage for the new permission; its allowance is a gas cap, not a transfer/deposit.
  const newKeyStorageBytes = kind === "agent-key" ? 256n : 0n;
  const minimum = (BigInt(state.account.storage_usage) + newKeyStorageBytes) * BigInt(fees.storage_price_yocto_per_byte)
    + BigInt(encoded.transaction.kind === "agent-key" ? "0" : encoded.transaction.deposit)
    + BigInt(fees.gas_budget_at_current_price_yocto) + feeCushion;
  if (BigInt(state.account.amount) < minimum) throw Error("DEMO_FUNDING_INSUFFICIENT");
  if (Date.now() < started || Date.now() - started >= 60000) throw Error("DEMO_REVIEW_EXPIRED");
  const review = Object.freeze({ kind, prepared_at_ms: started, content: Object.freeze(content), transaction: encoded.transaction,
    transaction_hash: encoded.transaction_hash,
    initial_state: canonical({ account: state.account, nonce: state.nonce, storage: state.storage, project: state.project,
      provider: state.provider, capsule: state.capsule, quote: state.quote }), fees: Object.freeze(fees),
    minimum_signer_balance_yoctoNEAR: minimum.toString(), new_key_storage_margin_bytes: newKeyStorageBytes.toString(),
    fee_cushion_yoctoNEAR: feeCushion.toString() });
  issued.add(review); return review;
}
export type DemoOperationReview = Awaited<ReturnType<typeof prepareDemoOperation>>;
export async function executeDemoOperation(directory: string, review: DemoOperationReview,
  signer: (tx: DemoOperationReview["transaction"]) => Uint8Array, transport: ChildTransport | undefined, report: (value: unknown) => void) {
  if (!issued.has(review)) throw Error("DEMO_REVIEW_UNISSUED"); await safeDirectory(directory);
  const fresh = () => { if (Date.now() < review.prepared_at_ms || Date.now() - review.prepared_at_ms >= 60000) throw Error("DEMO_REVIEW_EXPIRED"); };
  fresh(); const encoded = encodeDemoTransaction(review.transaction);
  if (encoded.transaction_hash !== review.transaction_hash) throw Error("DEMO_REVIEW_CHANGED");
  await writeDemoRecord(directory, "review.json", review); // Permanent exclusive claim, even if the recheck stops before signing.
  const current = await prepareDemoOperation(review.kind, encoded.transaction.public_key, transport);
  fresh();
  if (review.content.kind === "agent-key" && current.content.kind === "agent-key")
    confirmFreshAgentKeyInstallReview(review.content.review, current.content.review, { review_hash: review.content.review.review_hash, consent: true });
  else if (review.content.kind === "setup" && current.content.kind === "setup")
    confirmFreshSetupReview(review.content.review, current.content.review, { review_hash: review.content.review.review_hash, consent: true });
  else throw Error("DEMO_REVIEW_KIND_CHANGED");
  if (current.initial_state !== review.initial_state || canonical(current.fees) !== canonical(review.fees)) throw Error("DEMO_STATE_CHANGED_STOPPED");
  await writeDemoRecord(directory, "intent.json", { transaction: encoded.transaction, transaction_hash: encoded.transaction_hash });
  const bytes = signer(encoded.transaction), checked = verifyDemoSignature(encoded.transaction, bytes.slice(-64));
  if (!Buffer.from(checked.signed_bytes).equals(Buffer.from(bytes))) throw Error("DEMO_SIGNED_BYTES_MISMATCH");
  fresh();
  await writeDemoRecord(directory, "entered.json", { kind: review.kind, transaction_hash: encoded.transaction_hash,
    rule: "One send may have started. Never re-sign/resend/delete markers or reuse this ID, including on unknown outcome." });
  report({ status: "DEMO_SINGLE_SEND_STARTING", kind: review.kind, transaction_hash: encoded.transaction_hash });
  const rpc = demoRpc(transport ?? fetch), execution = inspectDemoExecution(encoded.transaction, encoded.transaction_hash, await rpc.send(encoded.transaction, bytes));
  const result = { ...await rpc.proof(encoded.transaction, execution), transaction_hash: encoded.transaction_hash, action_status: execution.status,
    gas_burnt: execution.gas_burnt, tokens_burnt_yoctoNEAR: execution.tokens_burnt_yoctoNEAR,
    transport_source: review.content.review.transport_source };
  await writeDemoRecord(directory, "verified.json", result); report(result);
}
async function check(kind: DemoKind) {
  const rpc = demoRpc(fetch);
  console.log(JSON.stringify({ status: "DEMO_OPERATION_READ_ONLY_STATE", kind, target, ...await rpc.records(kind),
    limitation: "Current state only. No signature, send or resumable consent. Existing attempt identities checked below, never resumed." }));
  const directory = attemptDirectory(kind);
  try { await safeDirectory(directory); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  try { await lstat(join(directory, "intent.json")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") { console.log("RETAINED_ATTEMPT_READBACK_ONLY_NO_RESUME"); return; } throw error; }
  const saved = object(await publicJson(join(directory, "intent.json")), ["transaction", "transaction_hash"]), encoded = encodeDemoTransaction(saved.transaction);
  if (encoded.transaction_hash !== saved.transaction_hash || encoded.transaction.kind !== kind || encoded.transaction.public_key !== demoHumanKey(kind)) throw Error("DEMO_RECORD_MISMATCH");
  try {
    const execution = inspectDemoExecution(encoded.transaction, encoded.transaction_hash, await rpc.transaction(encoded.transaction_hash, encoded.transaction.signer_id));
    console.log(JSON.stringify({ ...await rpc.proof(encoded.transaction, execution), ...execution }));
  } catch { console.log(JSON.stringify({ status: "DEMO_EXECUTION_UNRESOLVED", transaction_hash: encoded.transaction_hash, rule: "READBACK_ONLY_NO_RETRY" })); }
}
async function main() {
  const args = process.argv.slice(2), mode = args.length === 2 && ["--check", "--preflight"].includes(args[0]) ? args[0] : "sign";
  const kind = (mode === "sign" ? args[0] : args[1]) as DemoKind;
  if ((mode === "sign" ? args.length !== 1 : args.length !== 2) || !demoKinds.includes(kind)) throw Error("DEMO_ARGUMENTS_INVALID");
  if (mode === "sign" && (!process.stdin.isTTY || !process.stdout.isTTY)) throw Error("HUMAN_TERMINAL_REQUIRED");
  await safeDirectory(join(root, ".local")); await safeDirectory(local);
  const keys = parsePublicDemoKeys(await publicJson(join(local, "public-demo-keys.json")));
  if (keys.find(v => v.role === "operator")?.public_key !== DEMO_OPERATOR_KEY || keys.find(v => v.role === "provider")?.public_key !== DEMO_PROVIDER_KEY
    || keys.find(v => v.role === "agent_recovery")?.public_key !== DEMO_AGENT_SCOPE.recovery_public_key) throw Error("DEMO_PUBLIC_BINDINGS_CHANGED");
  if (mode === "--check") { entryPhase = "READ_ONLY_CHECK"; await check(kind); return; }
  try { await lstat(attemptDirectory(kind)); throw Error("DEMO_EXISTING_ATTEMPT_READBACK_ONLY"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  entryPhase = "UNSIGNED_STATE_AND_FEE_READ";
  const review = await prepareDemoOperation(kind);
  if (mode === "--preflight") { console.log(JSON.stringify({ status: "DEMO_UNSIGNED_PREFLIGHT_OK", kind, review, signing_enabled: false, send_enabled: false, attempt_created: false })); return; }
  console.log(JSON.stringify({ ...review, signer: "HUMAN_TERMINAL_FIXED_WINDOWS_CREDENTIAL_TARGET_ONLY",
    disclosure: kind === "project" ? "ONE create_project for a NEW work order. Original expired project_demo_1108 is preserved, not revived. 0.08192 NEAR storage; 0.30 NEAR ceiling is NOT funding. No capsule/quote/key/purchase."
      : kind === "capsule" ? "ONE create_capsule: 0.30 testnet NEAR purchase funding + 2.62144 NEAR storage, total 2.92144 NEAR. No purchase/quote/key installation."
      : kind === "quote" ? "ONE provider publish_quote: 0.08192 testnet NEAR quote storage, not provider payment or purchase approval."
        : "ONE AddKey on the agent account: finite 0.05 testnet NEAR GAS cap, one Gate, only submit_purchase, zero-deposit method. Human recovery access remains. No purchase." }, null, 2));
  entryPhase = "HUMAN_REVIEW_PROMPT";
  const terminal = createInterface({ input: process.stdin, output: process.stdout }); let answer: string;
  try { answer = await terminal.question(`Type ${demoAnswer[kind]} to approve exactly this one transaction: `); } finally { terminal.close(); }
  if (answer !== demoAnswer[kind]) { console.log("CANCELLED_NO_SIGNATURE_OR_SEND"); return; }
  entryPhase = "HUMAN_APPROVAL_AND_EXCLUSIVE_CLAIM";
  const permission = admitHumanDemoSigner(review.transaction, answer), directory = attemptDirectory(kind); await mkdir(directory);
  entryPhase = "CLAIMED_EXECUTION";
  await executeDemoOperation(directory, review, tx => signHumanDemo(tx, permission).signed_bytes, undefined, v => console.log(JSON.stringify(v)));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    const reason = error instanceof Error && /^[A-Z][A-Z0-9_]{1,80}$/u.test(error.message) ? error.message : "LOCAL_OR_RPC_FAILURE";
    console.error(`DEMO_OPERATION_STOPPED ${reason} phase=${entryPhase}: retain identities/markers; --check only. No re-sign/resend/new operation/key fallback.`); process.exitCode = 1;
  });
}
