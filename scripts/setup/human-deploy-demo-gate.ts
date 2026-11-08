/** Human terminal only. --check is strictly public readback; no automatic deployment/resumption. */
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { lstat, readFile, mkdir, open } from "node:fs/promises";
import { join, resolve } from "node:path";
import { object, parseBoundedJson } from "../../src/lib/near/records.ts";
import { parsePublicDemoKeys } from "./human-create-demo-parent.ts";
import { checkedDeploymentCode, deploymentAnswer, deploymentArtifact, encodeDeploymentTransaction,
  gateAccount, initArgs, initGas, verifyDeploymentSignature, type DeploymentTransaction } from "./deployment-codec.ts";
import { deploymentRpc, inspectDeploymentExecution } from "./deployment-rpc.ts";
import { admitHumanDeploymentSigner, signHumanDeployment } from "./human-deployment-signer.ts";
import type { ChildTransport } from "./child-account-rpc.ts";

const root = fileURLToPath(new URL("../../", import.meta.url)), local = join(root, ".local", "human-key-setup");
const attemptDirectory = join(local, "deployment-attempt");
export const defaultDeploymentPath = "\\\\wsl.localhost\\Ubuntu-24.04\\home\\runlatch\\.cache\\runlatch-artifacts\\production\\runlatch_contract.wasm";
const feeCushion = 30000000000000000000000n; // 0.03 NEAR balance margin, NOT a gas/fee cap.
async function safeDirectory(path: string) {
  const meta = await lstat(path); if (!meta.isDirectory() || meta.isSymbolicLink()) throw Error("DEPLOYMENT_DIRECTORY_UNSAFE");
}
async function publicJson(path: string) {
  const meta = await lstat(path); if (!meta.isFile() || meta.isSymbolicLink() || meta.size > 16384) throw Error("DEPLOYMENT_RECORD_UNSAFE");
  return parseBoundedJson(await readFile(path, "utf8"), 16384);
}
export async function loadDeploymentArtifact() {
  const meta = await lstat(defaultDeploymentPath);
  if (!meta.isFile() || meta.isSymbolicLink() || meta.size !== deploymentArtifact.bytes) throw Error("DEPLOYMENT_ARTIFACT_CHANGED");
  return checkedDeploymentCode(await readFile(defaultDeploymentPath));
}
export async function writeDeploymentRecord(directory: string, name: string, value: unknown) {
  if (!["review.json", "intent.json", "entered.json", "verified.json"].includes(name)) throw Error("DEPLOYMENT_RECORD_NAME_INVALID");
  await safeDirectory(directory);
  const bytes = JSON.stringify(value, null, 2); if (Buffer.byteLength(bytes) > 16384) throw Error("DEPLOYMENT_RECORD_LIMIT");
  const file = await open(join(directory, name), "wx", 0o600);
  try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
}
export async function prepareDeployment(publicKey: string, code: Uint8Array, transport: ChildTransport) {
  checkedDeploymentCode(code);
  const rpc = deploymentRpc(transport), state = await rpc.state(publicKey);
  if (state.account.code_hash !== "11111111111111111111111111111111") throw Error("DEPLOYMENT_ALREADY_HAS_CODE");
  await rpc.requireEmpty(state.block_hash);
  if (BigInt(state.nonce) >= BigInt(Number.MAX_SAFE_INTEGER)) throw Error("DEPLOYMENT_NONCE_RPC_LIMIT");
  const fees = await rpc.fees(state.block_hash);
  const minimum = BigInt(state.account.storage_usage as number) * BigInt(fees.storage_price_yocto_per_byte)
    + BigInt(fees.code_storage_yocto) + BigInt(fees.init_storage_cushion_yocto)
    + BigInt(fees.gas_budget_at_current_price_yocto) + feeCushion;
  if (BigInt(state.account.amount as string) < minimum) throw Error("DEPLOYMENT_FUNDING_INSUFFICIENT");
  const tx = encodeDeploymentTransaction({ network: "testnet", signer_id: gateAccount, receiver_id: gateAccount, public_key: publicKey,
    nonce: (BigInt(state.nonce) + 1n).toString(), block_hash: state.block_hash,
    code_sha256: deploymentArtifact.sha256, code_bytes: deploymentArtifact.bytes, init_args: initArgs, gas: initGas, deposit: "0" }, code);
  return { prepared_at_ms: Date.now(), initial_block_height: state.block_height, initial_nonce: state.nonce,
    initial_balance_yoctoNEAR: state.account.amount, initial_storage_usage: state.account.storage_usage,
    minimum_balance_with_cushions_yoctoNEAR: minimum.toString(), fee_cushion_yoctoNEAR: feeCushion.toString(), fees,
    transaction: tx.transaction, transaction_hash: tx.transaction_hash };
}
export type DeploymentReview = Awaited<ReturnType<typeof prepareDeployment>>;
/** Injected ports for offline tests only; production supplies the fixed human signer/native fetch. */
export async function executeDeployment(directory: string, review: DeploymentReview, code: Uint8Array,
  signer: (tx: DeploymentTransaction, code: Uint8Array) => Uint8Array, transport: ChildTransport, report: (value: unknown) => void) {
  await safeDirectory(directory);
  const fresh = () => {
    if (Date.now() < review.prepared_at_ms || Date.now() - review.prepared_at_ms > 120000) throw Error("DEPLOYMENT_REVIEW_EXPIRED");
  };
  fresh();
  const encoded = encodeDeploymentTransaction(review.transaction, code);
  if (encoded.transaction_hash !== review.transaction_hash) throw Error("DEPLOYMENT_REVIEW_CHANGED");
  await writeDeploymentRecord(directory, "review.json", review); // Permanent exclusive claim before any signing.
  const current = await prepareDeployment(encoded.transaction.public_key, code, transport);
  fresh();
  if (current.initial_nonce !== review.initial_nonce || current.initial_block_height < review.initial_block_height
    || current.initial_balance_yoctoNEAR !== review.initial_balance_yoctoNEAR || current.initial_storage_usage !== review.initial_storage_usage
    || JSON.stringify(current.fees) !== JSON.stringify(review.fees)) throw Error("DEPLOYMENT_STATE_CHANGED_STOPPED");
  await writeDeploymentRecord(directory, "intent.json", { transaction: encoded.transaction, transaction_hash: encoded.transaction_hash });
  const bytes = signer(encoded.transaction, code), signed = verifyDeploymentSignature(encoded.transaction, code, bytes.slice(-64));
  if (!Buffer.from(signed.signed_bytes).equals(Buffer.from(bytes))) throw Error("DEPLOYMENT_SIGNED_BYTES_MISMATCH");
  fresh();
  await writeDeploymentRecord(directory, "entered.json", { transaction_hash: encoded.transaction_hash,
    rule: "Single send may have started. Never redeploy/reinit/re-sign/re-send/delete markers, including on unknown outcome." });
  report({ status: "DEPLOYMENT_SINGLE_SEND_STARTING", transaction_hash: encoded.transaction_hash });
  const rpc = deploymentRpc(transport), execution = inspectDeploymentExecution(encoded.transaction, encoded.transaction_hash, await rpc.send(bytes));
  const proof = await rpc.proof(encoded.transaction, review.initial_block_height);
  const result = { ...proof, transaction_hash: encoded.transaction_hash, deployment_actions: execution.status,
    receipt_ids: execution.receipt_ids, gas_burnt: execution.gas_burnt, tokens_burnt_yoctoNEAR: execution.tokens_burnt_yoctoNEAR,
    restricted_key_installed: false, purchase_executed: false,
    limitation: "RPC-reported FINAL deployment/init and same-block code/config/key/nonce; not a light-client proof, purchase, provisioning or human acceptance." };
  await writeDeploymentRecord(directory, "verified.json", result); report(result);
}
async function check(publicKey: string) {
  const rpc = deploymentRpc(fetch), state = await rpc.state(publicKey);
  console.log(JSON.stringify({ status: "DEPLOYMENT_READ_ONLY_STATE", account_id: gateAccount, public_key: publicKey,
    code_hash: state.account.code_hash, nonce: state.nonce, balance_yoctoNEAR: state.account.amount,
    storage_usage_bytes: state.account.storage_usage, block_hash: state.block_hash, block_height: state.block_height }));
  try { await lstat(attemptDirectory); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  await safeDirectory(attemptDirectory);
  try { await lstat(join(attemptDirectory, "intent.json")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") { console.log("RETAINED_ATTEMPT_READBACK_ONLY_NO_RESUME"); return; } throw error; }
  const saved = object(await publicJson(join(attemptDirectory, "intent.json")), ["transaction", "transaction_hash"]);
  const encoded = encodeDeploymentTransaction(saved.transaction, await loadDeploymentArtifact());
  if (encoded.transaction.public_key !== publicKey || encoded.transaction_hash !== saved.transaction_hash) throw Error("DEPLOYMENT_RECORD_MISMATCH");
  try {
    const execution = inspectDeploymentExecution(encoded.transaction, encoded.transaction_hash, await rpc.transaction(encoded.transaction_hash));
    const proof = await rpc.proof(encoded.transaction, 1); console.log(JSON.stringify({ ...proof, ...execution }));
  } catch { console.log(JSON.stringify({ status: "DEPLOYMENT_EXECUTION_UNRESOLVED", transaction_hash: encoded.transaction_hash, rule: "READBACK_ONLY_NO_RETRY" })); }
}
async function main() {
  const args = process.argv.slice(2), checkOnly = args.length === 1 && args[0] === "--check";
  if (args.length && !checkOnly) throw Error("DEPLOYMENT_ARGUMENTS_INVALID");
  if (!checkOnly && (!process.stdin.isTTY || !process.stdout.isTTY)) throw Error("HUMAN_TERMINAL_REQUIRED");
  await safeDirectory(join(root, ".local")); await safeDirectory(local);
  const keys = parsePublicDemoKeys(await publicJson(join(local, "public-demo-keys.json"))), contract = keys.find(key => key.role === "contract")!;
  if (checkOnly) { await check(contract.public_key); return; }
  try { await lstat(attemptDirectory); throw Error("DEPLOYMENT_EXISTING_ATTEMPT_READBACK_ONLY"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const code = await loadDeploymentArtifact(), review = await prepareDeployment(contract.public_key, code, fetch);
  console.log(JSON.stringify({ ...review, signer: "LOCAL_NODE_WINDOWS_CREDENTIAL_MANAGER_CONTRACT_ONLY",
    actions: ["DeployContract(default pinned WASM)", "init(operator_id runlatch-demo-1108.testnet),100Tgas,0 deposit"],
    disclosure: "Public testnet deployment+one-time init. No transfer, key installation, project/capsule/provider/quote, purchase, acceptance, stock CLI, owner fallback or cloud push." }, null, 2));
  const terminal = createInterface({ input: process.stdin, output: process.stdout }); let answer: string;
  try { answer = await terminal.question(`Type ${deploymentAnswer} to approve exactly this one transaction: `); }
  finally { terminal.close(); }
  if (answer !== deploymentAnswer) { console.log("CANCELLED_NO_SIGNATURE_OR_SEND"); return; }
  const permission = admitHumanDeploymentSigner(review.transaction, code, answer);
  await mkdir(attemptDirectory); // Exclusive; any retained directory blocks default entry, on every outcome.
  await executeDeployment(attemptDirectory, review, code, (tx, wasm) => signHumanDeployment(tx, wasm, permission).signed_bytes,
    fetch, value => console.log(JSON.stringify(value)));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    const reason = error instanceof Error && /^[A-Z][A-Z0-9_]{1,80}$/u.test(error.message) ? error.message : "LOCAL_OR_RPC_FAILURE";
    console.error(`DEPLOYMENT_STOPPED ${reason}: retain public identities/markers; use --check only. No redeploy/reinit/re-sign/resend/key fallback.`); process.exitCode = 1;
  });
}
