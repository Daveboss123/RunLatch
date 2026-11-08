/** One human-confirmed public faucet request. No keys, signatures, account fallback or automatic retry. */
import { createHash } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { readFile, lstat, open } from "node:fs/promises";
import { join } from "node:path";
import { decodeBase58_32 } from "../near/base58.ts";
import { demoKeyRoles } from "./human-demo-keys.ts";
import { amount, object, parseBoundedJson } from "../../src/lib/near/records.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const local = join(root, ".local", "human-key-setup");
const rpcUrl = "https://rpc.testnet.near.org/";
export const faucetUrl = "https://helper.nearprotocol.com/account";
const accountId = "runlatch-demo-1108.testnet";
type Transport = (url: string, init: RequestInit) => Promise<Response>;
function scopedPublicKey(value: string) {
  if (typeof value !== "string" || !value.startsWith("ed25519:")) throw Error("PUBLIC_KEY_BINDING_INVALID");
  decodeBase58_32(value.slice(8));
}

export function parsePublicDemoKeys(input: unknown) {
  const bundle = object(input, ["source", "keys"]);
  if (bundle.source !== "HUMAN_REPORTED_PUBLIC_KEY_RECORDS_NOT_AGENT_CREDENTIAL_VERIFICATION"
    || !Array.isArray(bundle.keys) || bundle.keys.length !== 5) throw Error("PUBLIC_KEY_BINDING_INVALID");
  const keys = bundle.keys.map((value, i) => {
    const key = object(value, ["role", "account_id", "public_key", "credential_target", "status"]), expected = demoKeyRoles[i];
    if (key.role !== expected.role || key.account_id !== expected.account_id || key.status !== "STORED_VERIFIED"
      || typeof key.public_key !== "string" || !key.public_key.startsWith("ed25519:")) throw Error("PUBLIC_KEY_BINDING_INVALID");
    decodeBase58_32(key.public_key.slice(8));
    if (key.credential_target !== `${expected.account_id}:${key.public_key}.near-testnet-${expected.account_id}`) throw Error("PUBLIC_KEY_BINDING_INVALID");
    return Object.freeze({ role: expected.role, account_id: expected.account_id, public_key: key.public_key });
  });
  if (new Set(keys.map(k => k.public_key)).size !== 5) throw Error("PUBLIC_KEYS_NOT_DISTINCT");
  return Object.freeze(keys);
}

async function responseJson(response: Response) {
  const chunks: Uint8Array[] = []; let bytes = 0;
  if (!response.body) throw Error("RESPONSE_UNAVAILABLE");
  const reader = response.body.getReader();
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > 1_048_576) { await reader.cancel(); throw Error("RESPONSE_LIMIT"); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  if (!response.ok) throw Error("HTTP_REQUEST_FAILED");
  return object(parseBoundedJson(Buffer.concat(chunks).toString("utf8")));
}
export async function observeParent(publicKey: string, transport: Transport) {
  scopedPublicKey(publicKey);
  let id = 0;
  const overall = AbortSignal.timeout(30_000);
  async function rpc(method: string, params: unknown) {
    return responseJson(await transport(rpcUrl, { method: "POST", redirect: "error",
      signal: AbortSignal.any([overall, AbortSignal.timeout(10_000)]), headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) }));
  }
  const status = await rpc("status", []);
  if (object(status.result).chain_id !== "testnet") throw Error("TESTNET_RPC_REQUIRED");
  const block = object(object(await rpc("block", { finality: "final" })).result), header = object(block.header);
  if (typeof header.hash !== "string") throw Error("FINAL_BLOCK_UNAVAILABLE");
  decodeBase58_32(header.hash);
  const params = { account_id: accountId, block_id: header.hash };
  const account = await rpc("query", { ...params, request_type: "view_account" });
  if (account.error !== undefined) {
    const error = object(account.error), cause = error.cause === undefined ? null : object(error.cause);
    if (cause?.name === "UNKNOWN_ACCOUNT") return Object.freeze({ status: "PARENT_ABSENT" as const, network: "testnet", account_id: accountId, public_key: publicKey, block_hash: header.hash });
    throw Error("ACCOUNT_READ_UNAVAILABLE");
  }
  const data = object(account.result), balance = amount(data.amount);
  if (data.block_hash !== header.hash) throw Error("ACCOUNT_BLOCK_MISMATCH");
  const access = object((await rpc("query", { ...params, request_type: "view_access_key", public_key: publicKey })).result);
  if (access.permission !== "FullAccess") throw Error("EXPECTED_FULL_ACCESS_KEY_UNAVAILABLE");
  const list = object((await rpc("query", { ...params, request_type: "view_access_key_list" })).result);
  if (!Array.isArray(list.keys) || list.keys.length !== 1) throw Error("UNEXPECTED_PARENT_KEYS");
  const key = object(list.keys[0]);
  if (key.public_key !== publicKey || object(key.access_key).permission !== "FullAccess") throw Error("UNEXPECTED_PARENT_KEYS");
  if (access.block_hash !== header.hash || list.block_hash !== header.hash) throw Error("ACCESS_BLOCK_MISMATCH");
  return Object.freeze({ status: "PARENT_ACCOUNT_OBSERVED" as const, network: "testnet", account_id: accountId,
    public_key: publicKey, balance_yoctoNEAR: balance, block_hash: header.hash,
    limitation: "RPC-reported account/key only. Not a signature, light-client proof, contract deployment or settlement." });
}

export async function claimParentFaucet(directory: string, publicKey: string) {
  scopedPublicKey(publicKey);
  const metadata = await lstat(directory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw Error("UNSAFE_FAUCET_MARKER_DIRECTORY");
  const body = Object.freeze({ newAccountId: accountId, newAccountPublicKey: publicKey });
  const record = { source: "HUMAN_EXACT_PARENT_FAUCET_ATTEMPT", endpoint: faucetUrl, body,
    body_sha256: createHash("sha256").update(JSON.stringify(body)).digest("hex"), prepared_at: new Date().toISOString(),
    rule: "Retain permanently. Unknown/failed responses never authorize another POST." };
  const file = await open(join(directory, "parent-faucet-attempt.json"), "wx", 0o600);
  try { await file.writeFile(JSON.stringify(record, null, 2)); await file.sync(); }
  finally { await file.close(); }
  return body;
}

async function main() {
  const args = process.argv.slice(2), checkOnly = args.length === 1 && args[0] === "--check";
  if (args.length && !checkOnly) throw Error("UNSUPPORTED_ARGUMENTS");
  if (!checkOnly && (!process.stdin.isTTY || !process.stdout.isTTY)) throw Error("HUMAN_TERMINAL_REQUIRED");
  for (const directory of [join(root, ".local"), local]) {
    const metadata = await lstat(directory);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw Error("UNSAFE_PUBLIC_BINDINGS_DIRECTORY");
  }
  const file = join(local, "public-demo-keys.json"), metadata = await lstat(file);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 8192) throw Error("PUBLIC_BINDING_FILE_INVALID");
  const keys = parsePublicDemoKeys(parseBoundedJson(await readFile(file, "utf8"), 8192)), owner = keys[0];
  const observed = await observeParent(owner.public_key, fetch);
  if (checkOnly || observed.status !== "PARENT_ABSENT") { console.log(JSON.stringify(observed, null, 2)); return; }
  console.log(JSON.stringify({ endpoint: faucetUrl, request: { newAccountId: accountId, newAccountPublicKey: owner.public_key },
    scope: "One public testnet account creation with this FullAccess key. No owner signature/deposit, child account, contract, private key or repeat request. Faucet chooses its grant; amount not promised." }, null, 2));
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  let consent: string;
  try { consent = await terminal.question(`Type CREATE ${accountId} to approve this exact public faucet request: `); }
  finally { terminal.close(); }
  if (consent !== `CREATE ${accountId}`) { console.log("CANCELLED_NO_FAUCET_REQUEST"); return; }
  const fresh = await observeParent(owner.public_key, fetch);
  if (fresh.status !== "PARENT_ABSENT") { console.log(JSON.stringify(fresh, null, 2)); return; }
  const body = await claimParentFaucet(local, owner.public_key);
  try {
    const reply = await responseJson(await fetch(faucetUrl, { method: "POST", redirect: "error", signal: AbortSignal.timeout(20_000),
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    const transaction = reply.transaction === undefined ? null : object(reply.transaction);
    const hash = transaction?.hash;
    if (hash !== undefined) { if (typeof hash !== "string") throw Error("FAUCET_RESPONSE_INVALID"); decodeBase58_32(hash); }
    console.log(JSON.stringify({ status: "FAUCET_RESPONSE_RETURNED_NOT_YET_ACCOUNT_PROOF", account_id: accountId, transaction_hash: hash ?? null }));
    console.log(JSON.stringify(await observeParent(owner.public_key, fetch), null, 2));
  } catch { console.log("FAUCET_OUTCOME_UNCERTAIN: run --check only; do not resend, delete the marker or generate replacement keys."); process.exitCode = 1; }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file:///${process.argv[1].replaceAll("\\", "/")}`))) {
  main().catch(() => { console.error("PARENT_SETUP_STOPPED: no fallback/retry. Keep public outputs and use --check for readback."); process.exitCode = 1; });
}
