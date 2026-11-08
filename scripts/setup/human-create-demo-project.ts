/** Human own-terminal only. --check is public readback; never resumes/signs/sends. */
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { lstat, readFile, mkdir, open } from "node:fs/promises";
import { join, resolve } from "node:path";
import { object, parseBoundedJson, time } from "../../src/lib/near/records.ts";
import { canonicalReviewContent } from "../../src/lib/near/review-content.ts";
import { confirmFreshSetupReview, prepareSetupReview } from "../../src/lib/near/setup-review.ts";
import { parsePublicDemoKeys } from "./human-create-demo-parent.ts";
import { gateAccount } from "./deployment-codec.ts";
import { parentAccount } from "./child-account-codec.ts";
import { encodeProjectTransaction, projectAction, projectAnswer, projectCeiling, projectDeposit,
  projectLifetimeNs, projectTarget, verifyProjectSignature, type ProjectTransaction } from "./project-codec.ts";
import { projectRpc, inspectProjectExecution } from "./project-rpc.ts";
import { admitHumanProjectSigner, signHumanProject } from "./human-project-signer.ts";
import type { ChildTransport } from "./child-account-rpc.ts";

const root = fileURLToPath(new URL("../../", import.meta.url)), local = join(root, ".local", "human-key-setup");
const attemptDirectory = join(local, "project-attempt");
const feeCushion = 30000000000000000000000n; // Balance margin0.03NEAR, not spend or a fee guarantee.
const issued = new WeakSet<object>();
async function safeDirectory(path: string) {
  const meta = await lstat(path); if (!meta.isDirectory() || meta.isSymbolicLink()) throw Error("PROJECT_DIRECTORY_UNSAFE");
}
async function publicJson(path: string) {
  const meta = await lstat(path); if (!meta.isFile() || meta.isSymbolicLink() || meta.size > 16384) throw Error("PROJECT_RECORD_UNSAFE");
  return parseBoundedJson(await readFile(path, "utf8"), 16384);
}
export async function writeProjectRecord(directory: string, name: string, value: unknown) {
  if (!["review.json", "intent.json", "entered.json", "verified.json"].includes(name)) throw Error("PROJECT_RECORD_NAME_INVALID");
  await safeDirectory(directory);
  const bytes = canonicalReviewContent(value); if (Buffer.byteLength(bytes) > 16384) throw Error("PROJECT_RECORD_LIMIT");
  const file = await open(join(directory, name), "wx", 0o600);
  try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
}
/** Shared issued setup-review validation over one fixed same-block read; no duplicated RPC preflight. */
export async function prepareProject(operatorKey: string, gateKey: string, transport?: ChildTransport, fixedExpiry?: string) {
  const rpc = projectRpc(transport ?? fetch), state = await rpc.state(operatorKey, gateKey);
  if (state.project !== null || state.projects.length) throw Error("PROJECT_ALREADY_EXISTS_READBACK_ONLY");
  const expiry = time(fixedExpiry ?? (BigInt(state.block.timestamp_ns) + projectLifetimeNs).toString());
  if (BigInt(expiry) <= BigInt(state.block.timestamp_ns) || BigInt(expiry) > BigInt(state.block.timestamp_ns) + projectLifetimeNs) throw Error("PROJECT_EXPIRY_INVALID");
  const setup = await prepareSetupReview(projectTarget, projectAction(operatorKey, expiry), { block: state.block, storage: state.storage,
    signer_access: { nonce: Number(state.operator.nonce), permission: "FullAccess" }, existing_record: state.project,
    project: null, providers: [], previous_quote: null,
    transport_source: transport ? "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE" : "EXPLICIT_TESTNET_HTTP_READBACK" });
  if (setup.reviewed_block.height < state.block.height || setup.signer_access.nonce !== state.operator.nonce
    || setup.call.attached_deposit !== projectDeposit || setup.funding.purchase_funding !== "0"
    || setup.funding.project_ceiling !== projectCeiling) throw Error("PROJECT_SETUP_REVIEW_MISMATCH");
  if (BigInt(state.operator.nonce) >= BigInt(Number.MAX_SAFE_INTEGER)) throw Error("PROJECT_NONCE_RPC_LIMIT");
  const encoded = encodeProjectTransaction({ network: "testnet", signer_id: parentAccount, receiver_id: gateAccount,
    public_key: operatorKey, nonce: (BigInt(state.operator.nonce) + 1n).toString(), block_hash: setup.reviewed_block.hash,
    method: setup.call.method, args: setup.call.args, gas: setup.call.gas, deposit: setup.call.attached_deposit });
  const fees = await rpc.fees(setup.reviewed_block, encoded.transaction);
  const minimum = BigInt(state.operator.state.storage_usage as number) * BigInt(fees.storage_price_yocto_per_byte)
    + BigInt(projectDeposit) + BigInt(fees.gas_budget_at_current_price_yocto) + feeCushion;
  if (BigInt(state.operator.state.amount as string) < minimum) throw Error("PROJECT_FUNDING_INSUFFICIENT");
  const review = Object.freeze({ prepared_at_ms: Date.now(), setup, gate_public_key: gateKey,
    initial_accounts: canonicalReviewContent({ operator: state.operator, gate: state.gate }),
    minimum_operator_balance_yoctoNEAR: minimum.toString(), fee_cushion_yoctoNEAR: feeCushion.toString(), fees: Object.freeze(fees),
    transaction: encoded.transaction, transaction_hash: encoded.transaction_hash });
  issued.add(review); return review;
}
export type ProjectReview = Awaited<ReturnType<typeof prepareProject>>;
/** Trusted injected signer is an offline-test port; the human entry uses only the exact local operator signer. */
export async function executeProject(directory: string, review: ProjectReview, signer: (tx: ProjectTransaction) => Uint8Array,
  transport: ChildTransport | undefined, report: (value: unknown) => void) {
  if (!issued.has(review)) throw Error("PROJECT_REVIEW_UNISSUED");
  await safeDirectory(directory);
  const fresh = () => { if (Date.now() < review.prepared_at_ms || Date.now() - review.prepared_at_ms >= 60000) throw Error("PROJECT_REVIEW_EXPIRED"); };
  fresh(); const encoded = encodeProjectTransaction(review.transaction);
  if (encoded.transaction_hash !== review.transaction_hash) throw Error("PROJECT_REVIEW_CHANGED");
  await writeProjectRecord(directory, "review.json", review); // Exclusive permanent claim before recheck/store/sign.
  const current = await prepareProject(encoded.transaction.public_key, review.gate_public_key, transport, encoded.transaction.args.project.expires_at_ns);
  fresh();
  confirmFreshSetupReview(review.setup, current.setup, { review_hash: review.setup.review_hash, consent: true });
  if (current.initial_accounts !== review.initial_accounts || canonicalReviewContent(current.fees) !== canonicalReviewContent(review.fees)) throw Error("PROJECT_STATE_CHANGED_STOPPED");
  await writeProjectRecord(directory, "intent.json", { transaction: encoded.transaction, transaction_hash: encoded.transaction_hash });
  const bytes = signer(encoded.transaction), signed = verifyProjectSignature(encoded.transaction, bytes.slice(-64));
  if (!Buffer.from(signed.signed_bytes).equals(Buffer.from(bytes))) throw Error("PROJECT_SIGNED_BYTES_MISMATCH");
  fresh();
  await writeProjectRecord(directory, "entered.json", { transaction_hash: encoded.transaction_hash,
    rule: "Single send may have started. Never re-sign/resend/recreate project/delete markers, including on unknown outcome." });
  report({ status: "PROJECT_SINGLE_SEND_STARTING", transaction_hash: encoded.transaction_hash });
  const rpc = projectRpc(transport ?? fetch), execution = inspectProjectExecution(encoded.transaction, encoded.transaction_hash, await rpc.send(encoded.transaction, bytes));
  const proof = await rpc.proof(encoded.transaction, execution, review.gate_public_key);
  const result = { ...proof, transaction_hash: encoded.transaction_hash, project_action: execution.status,
    receipt_ids: execution.receipt_ids, gas_burnt: execution.gas_burnt, tokens_burnt_yoctoNEAR: execution.tokens_burnt_yoctoNEAR,
    limitation: "RPC-reported FINAL exact owner project creation and historical-code/current-state consistency. Ceiling is unfunded authority; no capsule, purchase, provisioning, task check, human acceptance or light-client proof." };
  await writeProjectRecord(directory, "verified.json", result); report(result);
}
async function check(operatorKey: string, gateKey: string) {
  const rpc = projectRpc(fetch), state = await rpc.state(operatorKey, gateKey);
  console.log(JSON.stringify({ status: "PROJECT_READ_ONLY_STATE", contract_id: gateAccount, operator_id: parentAccount,
    operator_public_key: operatorKey, operator_nonce: state.operator.nonce, gate_code_hash: state.gate.state.code_hash,
    project: state.project, transaction_execution: "NOT_CHECKED_IN_THIS_STATE_READ", block_hash: state.block.hash, block_height: state.block.height,
    limitation: "State read only; completion is proven below only if a retained exact transaction identity is independently observed FINAL." }));
  try { await lstat(attemptDirectory); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  await safeDirectory(attemptDirectory);
  try { await lstat(join(attemptDirectory, "intent.json")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") { console.log("RETAINED_ATTEMPT_READBACK_ONLY_NO_RESUME"); return; } throw error; }
  const saved = object(await publicJson(join(attemptDirectory, "intent.json")), ["transaction", "transaction_hash"]), encoded = encodeProjectTransaction(saved.transaction);
  if (encoded.transaction.public_key !== operatorKey || encoded.transaction_hash !== saved.transaction_hash) throw Error("PROJECT_RECORD_MISMATCH");
  try {
    const execution = inspectProjectExecution(encoded.transaction, encoded.transaction_hash, await rpc.transaction(encoded.transaction_hash));
    console.log(JSON.stringify({ ...await rpc.proof(encoded.transaction, execution, gateKey), ...execution }));
  } catch { console.log(JSON.stringify({ status: "PROJECT_EXECUTION_UNRESOLVED", transaction_hash: encoded.transaction_hash, rule: "READBACK_ONLY_NO_RETRY" })); }
}
async function main() {
  const args = process.argv.slice(2), checkOnly = args.length === 1 && args[0] === "--check";
  if (args.length && !checkOnly) throw Error("PROJECT_ARGUMENTS_INVALID");
  if (!checkOnly && (!process.stdin.isTTY || !process.stdout.isTTY)) throw Error("HUMAN_TERMINAL_REQUIRED");
  await safeDirectory(join(root, ".local")); await safeDirectory(local);
  const keys = parsePublicDemoKeys(await publicJson(join(local, "public-demo-keys.json")));
  const operator = keys.find(v => v.role === "operator")!, gate = keys.find(v => v.role === "contract")!;
  if (operator.public_key !== "ed25519:4WJHM7chT6geyrN23fRR3sSLJhRaXmRaEjcaZvpUrXuL"
    || gate.public_key !== "ed25519:9mjERcGtp9pc2oqxZo8zKMrbKa44wuU47KrCquKTbraB") throw Error("PROJECT_PUBLIC_BINDINGS_CHANGED");
  if (checkOnly) { await check(operator.public_key, gate.public_key); return; }
  try { await lstat(attemptDirectory); throw Error("PROJECT_EXISTING_ATTEMPT_READBACK_ONLY"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const review = await prepareProject(operator.public_key, gate.public_key);
  console.log(JSON.stringify({ ...review, signer: "LOCAL_NODE_WINDOWS_CREDENTIAL_MANAGER_OPERATOR_ONLY",
    fictional_labels_off_chain: { organisation: "Northstar Studio", client: "ACME Demo Client", task: "Automated Booking Website" },
    expires_at_utc: new Date(Number(BigInt(review.transaction.args.project.expires_at_ns) / 1000000n)).toISOString(),
    criteria: "website-resource-fixture-v1: local manifest binding, fixture health200/HTTPS flag and /health body ok; no live network/database check",
    disclosure: "ONE owner create_project,50Tgas,0.08192NEAR storage ONLY. 0.30NEAR ceiling is NOT funding. No transfer action, provider, capsule, quote, AddKey, agent purchase, provisioning, check, acceptance, redeployment, cloud push or website change." }, null, 2));
  const terminal = createInterface({ input: process.stdin, output: process.stdout }); let answer: string;
  try { answer = await terminal.question(`Type ${projectAnswer} to approve exactly this one transaction: `); }
  finally { terminal.close(); }
  if (answer !== projectAnswer) { console.log("CANCELLED_NO_SIGNATURE_OR_SEND"); return; }
  const permission = admitHumanProjectSigner(review.transaction, answer);
  await mkdir(attemptDirectory); // No retry/adoption even after a pre-send failure.
  await executeProject(attemptDirectory, review, tx => signHumanProject(tx, permission).signed_bytes, undefined, v => console.log(JSON.stringify(v)));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    const reason = error instanceof Error && /^[A-Z][A-Z0-9_]{1,80}$/u.test(error.message) ? error.message : "LOCAL_OR_RPC_FAILURE";
    console.error(`PROJECT_STOPPED ${reason}: retain identities/markers; --check only. No re-sign/resend/new project/key fallback.`); process.exitCode = 1;
  });
}
