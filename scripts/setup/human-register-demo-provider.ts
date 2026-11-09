/** Human own-terminal only. --check reads public state/identity, never resumes/signs/sends. */
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { lstat, readFile, mkdir, open } from "node:fs/promises";
import { join, resolve } from "node:path";
import { object, parseBoundedJson } from "../../src/lib/near/records.ts";
import { canonicalReviewContent } from "../../src/lib/near/review-content.ts";
import { confirmFreshSetupReview, prepareSetupReview } from "../../src/lib/near/setup-review.ts";
import { parsePublicDemoKeys } from "./human-create-demo-parent.ts";
import { gateAccount } from "./deployment-codec.ts";
import { parentAccount } from "./child-account-codec.ts";
import { encodeProviderTransaction, providerAction, providerAnswer, providerDeposit, providerTerms, providerTarget, verifyProviderSignature,
  type ProviderTransaction } from "./provider-codec.ts";
import { providerRpc, inspectProviderExecution } from "./provider-rpc.ts";
import { admitHumanProviderSigner, signHumanProvider } from "./human-provider-signer.ts";
import type { ChildTransport } from "./child-account-rpc.ts";

const root = fileURLToPath(new URL("../../", import.meta.url)), local = join(root, ".local", "human-key-setup");
const attemptDirectory = join(local, "provider-attempt"), feeCushion = 30000000000000000000000n;
const issued = new WeakSet<object>();
async function safeDirectory(path: string) {
  const meta = await lstat(path); if (!meta.isDirectory() || meta.isSymbolicLink()) throw Error("PROVIDER_DIRECTORY_UNSAFE");
}
async function publicJson(path: string) {
  const meta = await lstat(path); if (!meta.isFile() || meta.isSymbolicLink() || meta.size > 16384) throw Error("PROVIDER_RECORD_UNSAFE");
  return parseBoundedJson(await readFile(path, "utf8"), 16384);
}
export async function writeProviderRecord(directory: string, name: string, value: unknown) {
  if (!["review.json", "intent.json", "entered.json", "verified.json"].includes(name)) throw Error("PROVIDER_RECORD_NAME_INVALID");
  await safeDirectory(directory);
  const bytes = canonicalReviewContent(value); if (Buffer.byteLength(bytes) > 16384) throw Error("PROVIDER_RECORD_LIMIT");
  const file = await open(join(directory, name), "wx", 0o600);
  try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
}
export async function prepareProvider(operatorKey: string, gateKey: string, databaseKey: string, transport?: ChildTransport) {
  const started = Date.now(); // Conservative wall deadline includes all initial reads, not just prompt/recheck time.
  const rpc = providerRpc(transport ?? fetch), state = await rpc.state(operatorKey, gateKey, databaseKey);
  if (state.provider !== null) throw Error("PROVIDER_ALREADY_EXISTS_READBACK_ONLY");
  if (BigInt(state.operator.nonce) >= BigInt(Number.MAX_SAFE_INTEGER)) throw Error("PROVIDER_NONCE_RPC_LIMIT");
  const setup = await prepareSetupReview(providerTarget, providerAction(operatorKey), { block: state.block, storage: state.storage,
    signer_access: { nonce: Number(state.operator.nonce), permission: "FullAccess" }, existing_record: state.provider,
    project: null, providers: [], previous_quote: null,
    transport_source: transport ? "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE" : "EXPLICIT_TESTNET_HTTP_READBACK" });
  if (setup.call.attached_deposit !== providerDeposit || setup.funding.purchase_funding !== "0" || setup.call.method !== "register_provider") throw Error("PROVIDER_SETUP_REVIEW_MISMATCH");
  const encoded = encodeProviderTransaction({ network: "testnet", signer_id: parentAccount, receiver_id: gateAccount,
    public_key: operatorKey, nonce: (BigInt(state.operator.nonce) + 1n).toString(), block_hash: setup.reviewed_block.hash,
    method: setup.call.method, args: setup.call.args, gas: setup.call.gas, deposit: setup.call.attached_deposit });
  const fees = await rpc.fees(setup.reviewed_block, encoded.transaction);
  const minimum = BigInt(state.operator.state.storage_usage) * BigInt(fees.storage_price_yocto_per_byte)
    + BigInt(providerDeposit) + BigInt(fees.gas_budget_at_current_price_yocto) + feeCushion;
  if (BigInt(state.operator.state.amount) < minimum) throw Error("PROVIDER_FUNDING_INSUFFICIENT");
  if (Date.now() < started || Date.now() - started >= 60000) throw Error("PROVIDER_REVIEW_EXPIRED");
  const review = Object.freeze({ prepared_at_ms: started, setup, gate_public_key: gateKey, database_public_key: databaseKey,
    project: state.project, database: canonicalReviewContent(state.database),
    initial_accounts: canonicalReviewContent({ operator: state.operator, gate: state.gate }),
    minimum_operator_balance_yoctoNEAR: minimum.toString(), fee_cushion_yoctoNEAR: feeCushion.toString(), fees: Object.freeze(fees),
    transaction: encoded.transaction, transaction_hash: encoded.transaction_hash });
  issued.add(review); return review;
}
export type ProviderReview = Awaited<ReturnType<typeof prepareProvider>>;
/** Trusted injected test signer only; real entry selects the fixed human operator signer. */
export async function executeProvider(directory: string, review: ProviderReview, signer: (tx: ProviderTransaction) => Uint8Array,
  transport: ChildTransport | undefined, report: (value: unknown) => void) {
  if (!issued.has(review)) throw Error("PROVIDER_REVIEW_UNISSUED"); await safeDirectory(directory);
  const fresh = () => { if (Date.now() < review.prepared_at_ms || Date.now() - review.prepared_at_ms >= 60000) throw Error("PROVIDER_REVIEW_EXPIRED"); };
  fresh(); const encoded = encodeProviderTransaction(review.transaction);
  if (encoded.transaction_hash !== review.transaction_hash) throw Error("PROVIDER_REVIEW_CHANGED");
  await writeProviderRecord(directory, "review.json", review);
  const current = await prepareProvider(encoded.transaction.public_key, review.gate_public_key, review.database_public_key, transport);
  fresh(); confirmFreshSetupReview(review.setup, current.setup, { review_hash: review.setup.review_hash, consent: true });
  if (current.initial_accounts !== review.initial_accounts || current.database !== review.database
    || canonicalReviewContent(current.project) !== canonicalReviewContent(review.project)
    || canonicalReviewContent(current.fees) !== canonicalReviewContent(review.fees)) throw Error("PROVIDER_STATE_CHANGED_STOPPED");
  await writeProviderRecord(directory, "intent.json", { transaction: encoded.transaction, transaction_hash: encoded.transaction_hash,
    gate_public_key: review.gate_public_key, database_public_key: review.database_public_key, database: review.database });
  const bytes = signer(encoded.transaction), signed = verifyProviderSignature(encoded.transaction, bytes.slice(-64));
  if (!Buffer.from(signed.signed_bytes).equals(Buffer.from(bytes))) throw Error("PROVIDER_SIGNED_BYTES_MISMATCH"); fresh();
  await writeProviderRecord(directory, "entered.json", { transaction_hash: encoded.transaction_hash,
    rule: "One send may have started. Never re-sign/resend/new provider ID/delete markers, including on unknown outcome." });
  report({ status: "PROVIDER_SINGLE_SEND_STARTING", transaction_hash: encoded.transaction_hash });
  const rpc = providerRpc(transport ?? fetch), execution = inspectProviderExecution(encoded.transaction, encoded.transaction_hash, await rpc.send(encoded.transaction, bytes));
  const proof = await rpc.proof(encoded.transaction, execution, review.gate_public_key, review.database_public_key, review.database);
  const result = { ...proof, transaction_hash: encoded.transaction_hash, provider_action: execution.status, receipt_ids: execution.receipt_ids,
    gas_burnt: execution.gas_burnt, tokens_burnt_yoctoNEAR: execution.tokens_burnt_yoctoNEAR,
    limitation: "RPC-reported FINAL immutable provider registration only; project remains unfunded. No quote, restricted key, purchase, provisioning, check, acceptance or light-client proof." };
  await writeProviderRecord(directory, "verified.json", result); report(result);
}
async function check(operatorKey: string, gateKey: string, databaseKey: string) {
  const rpc = providerRpc(fetch), state = await rpc.state(operatorKey, gateKey, databaseKey);
  console.log(JSON.stringify({ status: "PROVIDER_READ_ONLY_STATE", contract_id: gateAccount, operator_id: parentAccount,
    rpc_url: providerTarget.rpc_url,
    operator_public_key: operatorKey, operator_nonce: state.operator.nonce, gate_code_hash: state.gate.state.code_hash,
    project: state.project, provider: state.provider, database: state.database, block_hash: state.block.hash, block_height: state.block.height,
    limitation: "Read-only current state; no creation/signing consent. Existing identity is checked below, never resumed." }));
  try { await lstat(attemptDirectory); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  await safeDirectory(attemptDirectory);
  try { await lstat(join(attemptDirectory, "intent.json")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") { console.log("RETAINED_ATTEMPT_READBACK_ONLY_NO_RESUME"); return; } throw error; }
  const saved = object(await publicJson(join(attemptDirectory, "intent.json")), ["transaction", "transaction_hash", "gate_public_key", "database_public_key", "database"]);
  const encoded = encodeProviderTransaction(saved.transaction);
  if (encoded.transaction.public_key !== operatorKey || encoded.transaction_hash !== saved.transaction_hash || saved.gate_public_key !== gateKey
    || saved.database_public_key !== databaseKey || typeof saved.database !== "string") throw Error("PROVIDER_RECORD_MISMATCH");
  try {
    const execution = inspectProviderExecution(encoded.transaction, encoded.transaction_hash, await rpc.transaction(encoded.transaction_hash));
    console.log(JSON.stringify({ ...await rpc.proof(encoded.transaction, execution, gateKey, databaseKey, saved.database), ...execution }));
  } catch { console.log(JSON.stringify({ status: "PROVIDER_EXECUTION_UNRESOLVED", transaction_hash: encoded.transaction_hash, rule: "READBACK_ONLY_NO_RETRY" })); }
}
async function main() {
  const args = process.argv.slice(2), checkOnly = args.length === 1 && args[0] === "--check";
  if (args.length && !checkOnly) throw Error("PROVIDER_ARGUMENTS_INVALID");
  if (!checkOnly && (!process.stdin.isTTY || !process.stdout.isTTY)) throw Error("HUMAN_TERMINAL_REQUIRED");
  await safeDirectory(join(root, ".local")); await safeDirectory(local);
  const keys = parsePublicDemoKeys(await publicJson(join(local, "public-demo-keys.json")));
  const operator = keys.find(v => v.role === "operator")!, gate = keys.find(v => v.role === "contract")!, db = keys.find(v => v.role === "provider")!;
  if (operator.public_key !== "ed25519:4WJHM7chT6geyrN23fRR3sSLJhRaXmRaEjcaZvpUrXuL" || gate.public_key !== "ed25519:9mjERcGtp9pc2oqxZo8zKMrbKa44wuU47KrCquKTbraB"
    || db.public_key !== "ed25519:3WYYFFAVric9chaHHF5ed8gFSqBE2DppAtGPrxvx7YXN") throw Error("PROVIDER_PUBLIC_BINDINGS_CHANGED");
  if (checkOnly) { await check(operator.public_key, gate.public_key, db.public_key); return; }
  try { await lstat(attemptDirectory); throw Error("PROVIDER_EXISTING_ATTEMPT_READBACK_ONLY"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const review = await prepareProvider(operator.public_key, gate.public_key, db.public_key);
  console.log(JSON.stringify({ ...review, signer: "LOCAL_NODE_WINDOWS_CREDENTIAL_MANAGER_OPERATOR_ONLY", immutable_provider: providerTerms,
    rpc_selection: "EXPLICIT_NEAR_DOCUMENTED_PUBLIC_FASTNEAR_TESTNET_NO_FALLBACK_NO_PAID_CALL",
    disclosure: "ONE register_provider,50Tgas,0.04096NEAR storage to existing Gate. Project ACTIVE revision1 allocated0. No database payment/quote/capsule/key/purchase/provisioning/check/acceptance, redeployment or cloud push. DB key is public readback only, never read by signer." }, null, 2));
  const terminal = createInterface({ input: process.stdin, output: process.stdout }); let answer: string;
  try { answer = await terminal.question(`Type ${providerAnswer} to approve exactly this one transaction: `); } finally { terminal.close(); }
  if (answer !== providerAnswer) { console.log("CANCELLED_NO_SIGNATURE_OR_SEND"); return; }
  const permission = admitHumanProviderSigner(review.transaction, answer); await mkdir(attemptDirectory);
  await executeProvider(attemptDirectory, review, tx => signHumanProvider(tx, permission).signed_bytes, undefined, v => console.log(JSON.stringify(v)));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    const reason = error instanceof Error && /^[A-Z][A-Z0-9_]{1,80}$/u.test(error.message) ? error.message : "LOCAL_OR_RPC_FAILURE";
    console.error(`PROVIDER_STOPPED ${reason}: retain identities/markers; --check only. No re-sign/resend/new provider/key fallback.`); process.exitCode = 1;
  });
}
