/** Human-started three-account bootstrap. Agent/nonTTY execution can only use --check. */
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { lstat, readFile, mkdir, open } from "node:fs/promises";
import { join, resolve } from "node:path";
import { object, parseBoundedJson } from "../../src/lib/near/records.ts";
import { parsePublicDemoKeys } from "./human-create-demo-parent.ts";
import { childAccounts, encodeChildTransaction, parentAccount, verifyChildSignature, type ChildTransaction } from "./child-account-codec.ts";
import { childRpc, inspectChildExecution, type ChildTransport } from "./child-account-rpc.ts";
import { admitHumanChildSigner, signHumanChild } from "./human-demo-signer.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const local = join(root, ".local", "human-key-setup"), batchDirectory = join(local, "children-attempt");
type Bindings = ReturnType<typeof parsePublicDemoKeys>;
const feeCushion = 30_000_000_000_000_000_000_000n; // 0.03 testnet NEAR for three native transaction fees, NOT a protocol cap.
async function safeDirectory(path: string) {
  const meta = await lstat(path); if (!meta.isDirectory() || meta.isSymbolicLink()) throw Error("CHILD_DIRECTORY_UNSAFE");
}
async function publicJson(path: string) {
  const meta = await lstat(path);
  if (!meta.isFile() || meta.isSymbolicLink() || meta.size > 16384) throw Error("CHILD_RECORD_UNSAFE");
  return parseBoundedJson(await readFile(path, "utf8"), 16384);
}
export async function writeChildRecord(directory: string, name: string, value: unknown) {
  if (!/^(batch|[0-2]-(intent|entered|verified))\.json$/u.test(name)) throw Error("CHILD_RECORD_NAME_INVALID");
  await safeDirectory(directory);
  const bytes = JSON.stringify(value, null, 2); if (Buffer.byteLength(bytes) > 16384) throw Error("CHILD_RECORD_LIMIT");
  const file = await open(join(directory, name), "wx", 0o600);
  try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
}
export async function prepareChildBatch(keys: Bindings, transport: ChildTransport) {
  const rpc = childRpc(transport), state = await rpc.state(keys[0].public_key), fees = await rpc.fees(state.block_hash);
  if (state.accounts.some(child => child.account !== null)) throw Error("CHILD_ALREADY_EXISTS_REVIEW_REQUIRED");
  if (BigInt(state.nonce) + 3n > BigInt(Number.MAX_SAFE_INTEGER)) throw Error("CHILD_NONCE_RPC_LIMIT");
  const storage = BigInt(state.owner.storage_usage as number) * BigInt(fees.storage_price_yocto_per_byte);
  const total = childAccounts.reduce((sum, child) => sum + BigInt(child.amount), 0n);
  if (BigInt(state.owner.amount as string) < total + feeCushion + storage) throw Error("CHILD_FUNDING_INSUFFICIENT");
  const transactions = childAccounts.map((child, index) => {
    const key = keys.find(key => key.role === child.role); if (!key) throw Error("CHILD_PUBLIC_BINDINGS_INVALID");
    return encodeChildTransaction({ network: "testnet", signer_id: parentAccount, public_key: keys[0].public_key,
      nonce: (BigInt(state.nonce) + BigInt(index) + 1n).toString(), receiver_id: child.account_id, block_hash: state.block_hash,
      child_public_key: key.public_key, amount: child.amount }).transaction;
  });
  return { source: "HUMAN_REVIEW_THREE_FIXED_TESTNET_CHILDREN", prepared_at_ms: Date.now(), initial_nonce: state.nonce,
    initial_block_height: state.block_height, balance_yoctoNEAR: state.owner.amount, fees,
    total_transfer_yoctoNEAR: total.toString(), fee_cushion_yoctoNEAR: feeCushion.toString(), transactions };
}
export type ChildBatch = Awaited<ReturnType<typeof prepareChildBatch>>;

/** Tests inject generated-key signing and mock transport. No default signer/network here. */
export async function executeChildBatch(directory: string, batch: ChildBatch,
  signer: (tx: ChildTransaction) => Uint8Array, transport: ChildTransport, report: (value: unknown) => void) {
  await safeDirectory(directory);
  if (batch.transactions.length !== 3 || Date.now() - batch.prepared_at_ms > 120000 || Date.now() < batch.prepared_at_ms) throw Error("CHILD_REVIEW_EXPIRED");
  const rpc = childRpc(transport);
  // Permanent exclusive claim BEFORE signer access. Interrupted/cancelled/unknown runs cannot re-enter.
  await writeChildRecord(directory, "batch.json", batch);
  const deadline = Date.now() + 180000;
  for (let index = 0; index < 3; index++) {
    const tx = encodeChildTransaction(batch.transactions[index]).transaction, current = await rpc.state(tx.public_key);
    const fees = await rpc.fees(current.block_hash);
    if (Date.now() > deadline || current.nonce !== (BigInt(tx.nonce) - 1n).toString()
      || current.block_height < batch.initial_block_height || JSON.stringify(fees) !== JSON.stringify(batch.fees)
      || current.accounts[index].account !== null) throw Error("CHILD_STATE_CHANGED_STOPPED");
    const remaining = batch.transactions.slice(index).reduce((sum, item) => sum + BigInt(item.amount), 0n);
    const storage = BigInt(current.owner.storage_usage as number) * BigInt(fees.storage_price_yocto_per_byte);
    if (BigInt(current.owner.amount as string) < remaining + feeCushion + storage) throw Error("CHILD_FUNDING_INSUFFICIENT");
    const encoded = encodeChildTransaction(tx);
    await writeChildRecord(directory, `${index}-intent.json`, { transaction: tx, transaction_hash: encoded.transaction_hash });
    // Persisted hash/nonce/exact actions already exist even if signing terminates the process.
    const bytes = signer(tx), signed = verifyChildSignature(tx, bytes.slice(-64));
    if (!Buffer.from(signed.signed_bytes).equals(Buffer.from(bytes))) throw Error("CHILD_SIGNED_BYTES_MISMATCH");
    await writeChildRecord(directory, `${index}-entered.json`, { transaction_hash: encoded.transaction_hash,
      rule: "Single send may have started. Never re-sign/re-send/delete markers, even after timeout or process interruption." });
    report({ status: "CHILD_SINGLE_SEND_STARTING", account_id: tx.receiver_id, transaction_hash: encoded.transaction_hash });
    const result = await rpc.send(bytes), execution = inspectChildExecution(tx, result);
    const proof = await rpc.childProof(tx, current.block_height);
    await writeChildRecord(directory, `${index}-verified.json`, { ...execution, account: proof,
      limitation: "RPC-reported FINAL native actions/account/key/nonce. Not a light-client proof, contract deployment or purchase settlement." });
    report({ ...proof, transaction_hash: encoded.transaction_hash, creation_actions: execution.status });
  }
  report({ status: "THREE_CHILD_ACCOUNTS_OBSERVED", contract_deployed: false, restricted_key_installed: false });
}
async function check(keys: Bindings) {
  const rpc = childRpc(fetch), state = await rpc.state(keys[0].public_key);
  console.log(JSON.stringify({ status: "CHILD_READ_ONLY_STATE", parent_nonce: state.nonce, block_hash: state.block_hash,
    accounts: state.accounts.map(child => ({ account_id: child.account_id, exists: child.account !== null, balance_yoctoNEAR: child.account?.amount ?? null })) }, null, 2));
  try { await lstat(batchDirectory); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  await safeDirectory(batchDirectory);
  for (let index = 0; index < 3; index++) {
    const file = join(batchDirectory, `${index}-intent.json`);
    try { await lstat(file); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
    const saved = object(await publicJson(file), ["transaction", "transaction_hash"]), encoded = encodeChildTransaction(saved.transaction);
    if (saved.transaction_hash !== encoded.transaction_hash || encoded.transaction.public_key !== keys[0].public_key
      || encoded.transaction.receiver_id !== childAccounts[index].account_id
      || encoded.transaction.child_public_key !== keys.find(key => key.role === childAccounts[index].role)?.public_key) throw Error("CHILD_RECORD_MISMATCH");
    try { console.log(JSON.stringify(inspectChildExecution(encoded.transaction, await rpc.transaction(encoded.transaction_hash)))); }
    catch { console.log(JSON.stringify({ status: "CHILD_EXECUTION_UNRESOLVED", transaction_hash: encoded.transaction_hash, rule: "READBACK_ONLY_NO_RETRY" })); }
  }
}
async function main() {
  const args = process.argv.slice(2), checkOnly = args.length === 1 && args[0] === "--check";
  if (args.length && !checkOnly) throw Error("CHILD_ARGUMENTS_INVALID");
  if (!checkOnly && (!process.stdin.isTTY || !process.stdout.isTTY)) throw Error("HUMAN_TERMINAL_REQUIRED");
  await safeDirectory(join(root, ".local")); await safeDirectory(local);
  const keys = parsePublicDemoKeys(await publicJson(join(local, "public-demo-keys.json")));
  if (checkOnly) { await check(keys); return; }
  // Any retained directory blocks the signing path, regardless of apparent account/transaction success.
  try { await lstat(batchDirectory); throw Error("CHILD_EXISTING_ATTEMPT_READBACK_ONLY"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const batch = await prepareChildBatch(keys, fetch);
  console.log(JSON.stringify({ ...batch, signer: "LOCAL_NODE_WINDOWS_CREDENTIAL_MANAGER_OPERATOR_ONLY",
    actions: "Each: CreateAccount + exact Transfer + AddKey(FullAccess, nonce 0). Three transactions, no retry.",
    disclosure: "Public testnet accounts/keys/transfers. Private key stays in human process. No stock CLI, hosted signer, contract, purchase or restricted-key installation." }, null, 2));
  const terminal = createInterface({ input: process.stdin, output: process.stdout }); let answer: string;
  try { answer = await terminal.question(`Type CREATE THREE CHILDREN ${parentAccount} USING LOCAL NODE SIGNER to approve exactly this batch: `); }
  finally { terminal.close(); }
  if (answer !== `CREATE THREE CHILDREN ${parentAccount} USING LOCAL NODE SIGNER`) { console.log("CANCELLED_NO_SIGNATURE_OR_SEND"); return; }
  const approval = admitHumanChildSigner(batch.transactions, answer);
  await mkdir(batchDirectory); // Exclusive; never removed on any outcome.
  await executeChildBatch(batchDirectory, batch, tx => signHumanChild(tx, approval).signed_bytes, fetch, value => console.log(JSON.stringify(value)));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(() => { console.error("CHILD_SETUP_STOPPED: retain all public identities/markers; use --check only. No fallback, resend or key regeneration."); process.exitCode = 1; });
}
