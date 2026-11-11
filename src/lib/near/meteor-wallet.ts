/**
 * Narrow Meteor extension v2 adapter. It uses the extension's official injected
 * request/response transport directly: no SDK storage, web-wallet fallback,
 * remote executor, generated browser key, auto-connect or persisted session.
 */
import { account, amount, count, fail, list, object, parseBoundedJson, reference, time } from "./records.ts";
import { canonicalReviewContent } from "./review-content.ts";
import { publicKey } from "./testnet-evidence.ts";
import type { AdmittedInjectedWallet, ExactAgentKeyCall, ExactHumanCall } from "./injected-wallet.ts";
import { HUMAN_WORKSPACE_METHODS } from "./human-methods.ts";

const RPC_URLS = new Set(["https://test.rpc.fastnear.com/", "https://rpc.testnet.near.org/"]);
const MAX_RESPONSE = 65_536, MAX_MESSAGES = 240;
const HUMAN_METHODS: ReadonlySet<string> = new Set(HUMAN_WORKSPACE_METHODS);
type MeteorStatus = "initializing" | "connected" | "attempting_reconnect" | "disconnected" | "closed_success" | "closed_fail" | "closed_window";
interface MeteorTransport { readonly version: "v2"; readonly featureFlags: readonly string[]; sendMessageDataAndRespond(value: unknown): Promise<unknown> }
interface Host { readonly meteorComV2?: unknown; readonly crypto?: Crypto }

function dataField(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return fail("METEOR_EXTENSION_INVALID");
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || descriptor.get || descriptor.set || !("value" in descriptor)) return fail("METEOR_EXTENSION_FIELD_INVALID");
  return descriptor.value;
}
function transport(host: Host): MeteorTransport | null {
  const descriptor = Object.getOwnPropertyDescriptor(host, "meteorComV2");
  if (!descriptor) return null;
  if (descriptor.get || descriptor.set || !("value" in descriptor)) return fail("METEOR_EXTENSION_ACCESSOR_FORBIDDEN");
  const value = descriptor.value;
  const flags = dataField(value, "featureFlags");
  if (dataField(value, "version") !== "v2" || !Array.isArray(flags) || flags.length > 32
    || flags.some(flag => typeof flag !== "string" || flag.length > 64)
    || typeof dataField(value, "sendMessageDataAndRespond") !== "function") return fail("METEOR_EXTENSION_V2_REQUIRED");
  return value as MeteorTransport;
}
function uid(host: Host) {
  const value = host.crypto?.randomUUID();
  if (typeof value !== "string" || value.length > 64) return fail("METEOR_EXTENSION_RANDOM_UNAVAILABLE");
  return value;
}
function status(value: unknown): MeteorStatus {
  if (typeof value !== "string" || !["initializing", "connected", "attempting_reconnect", "disconnected", "closed_success", "closed_fail", "closed_window"].includes(value))
    return fail("METEOR_EXTENSION_STATUS_INVALID");
  return value as MeteorStatus;
}
async function exchange(host: Host, actionType: "login" | "sign", inputs: unknown) {
  const channel = transport(host); if (!channel) return fail("METEOR_EXTENSION_NOT_FOUND");
  const requestId = uid(host), started = Date.now(); let phase: MeteorStatus = "initializing";
  for (let attempt = 0; attempt < MAX_MESSAGES; attempt++) {
    const remaining = 120_000 - (Date.now() - started);
    if (remaining <= 0 || remaining > 120_000) return fail("METEOR_EXTENSION_TIMEOUT");
    const message: Record<string, unknown> = { uid: requestId, status: phase, actionType, endTags: [], network: "testnet" };
    if (phase === "initializing") message.inputs = inputs;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const response = object(await Promise.race([channel.sendMessageDataAndRespond(message), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("METEOR_EXTENSION_TIMEOUT")), remaining);
    })]).finally(() => { if (timer) clearTimeout(timer); }));
    if (response.uid !== requestId) return fail("METEOR_EXTENSION_RESPONSE_MISMATCH");
    const next = status(response.status);
    if (next === "closed_success") {
      // Protocol close acknowledgement has no action inputs and cannot start a
      // second signature. Failure to close never discards the returned identity.
      void channel.sendMessageDataAndRespond({ uid: requestId, status: "closed_success", actionType, endTags: [], network: "testnet" }).catch(() => undefined);
      return response.payload;
    }
    if (["closed_fail", "closed_window", "disconnected"].includes(next)) return fail("METEOR_EXTENSION_USER_OR_WALLET_STOPPED");
    // Only the initial message carries action inputs. Status polling is not a
    // new transaction request; never restart an unknown signing connection.
    if (next !== "connected") return fail("METEOR_EXTENSION_CONNECTION_STOPPED");
    phase = "connected";
    await new Promise<void>(resolve => setTimeout(resolve, 500));
  }
  return fail("METEOR_EXTENSION_MESSAGE_LIMIT");
}
function keys(value: unknown) {
  const payload = object(value), accountId = account(payload.accountId), raw = list(payload.allKeys, 8);
  const allKeys = raw.map(publicKey);
  if (!allKeys.length || new Set(allKeys).size !== allKeys.length) return fail("METEOR_EXTENSION_KEYS_INVALID");
  return Object.freeze(allKeys.map(key => Object.freeze({ accountId, publicKey: key })));
}
async function bounded(response: Response, signal: AbortSignal) {
  if (!response.ok || !response.body || response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json")
    return fail("METEOR_RPC_RESPONSE_INVALID");
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    for (;;) {
      if (signal.aborted) return fail("METEOR_RPC_TIMEOUT");
      const next = await reader.read(); if (next.done) break;
      size += next.value.length; if (size > MAX_RESPONSE) return fail("METEOR_RPC_RESPONSE_LIMIT"); chunks.push(next.value);
    }
  } finally { signal.removeEventListener("abort", abort); await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  if (signal.aborted) return fail("METEOR_RPC_TIMEOUT");
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return parseBoundedJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes), MAX_RESPONSE);
}
function createRpc(injectedFetch: typeof fetch, rpcUrl: string) {
  let id = 0;
  return async (method: "status" | "block" | "query", params: unknown) => {
    if (++id > 4) return fail("METEOR_RPC_REQUEST_LIMIT");
    const requestId = `runlatch-meteor-${id}`, signal = AbortSignal.timeout(15_000);
    const response = await injectedFetch(rpcUrl, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }), credentials: "omit", redirect: "error", cache: "no-store",
      referrerPolicy: "no-referrer", signal });
    const envelope = object(await bounded(response, signal));
    if (envelope.jsonrpc !== "2.0" || envelope.id !== requestId || envelope.error !== undefined || envelope.result === undefined)
      return fail("METEOR_RPC_ENVELOPE_INVALID");
    return envelope.result;
  };
}
const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58(value: string) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/u.test(value)) return fail("METEOR_BASE58_INVALID");
  let n = 0n; for (const char of value) n = n * 58n + BigInt(alphabet.indexOf(char));
  const result = new Uint8Array(32);
  for (let index = 31; index >= 0; index--) { result[index] = Number(n & 255n); n >>= 8n; }
  if (n !== 0n) return fail("METEOR_BASE58_INVALID");
  const leading = value.match(/^1*/u)?.[0].length ?? 0, byteLeading = result.findIndex(byte => byte !== 0);
  if (leading !== (byteLeading < 0 ? 32 : byteLeading)) return fail("METEOR_BASE58_INVALID");
  return result;
}
function integer(value: bigint, bytes: number) {
  if (value < 0n || value >= 1n << BigInt(bytes * 8)) return fail("METEOR_INTEGER_LIMIT");
  const result = new Uint8Array(bytes);
  for (let index = 0; index < bytes; index++) { result[index] = Number(value & 255n); value >>= 8n; }
  return result;
}
function concat(...parts: readonly Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.length; } return result;
}
function vector(bytes: Uint8Array) { return concat(integer(BigInt(bytes.length), 4), bytes); }
function text(value: string) { return vector(new TextEncoder().encode(value)); }
function encode(call: ExactHumanCall | ExactAgentKeyCall, nonce: string, blockHash: string) {
  const head = concat(text(call.signer_id), new Uint8Array([0]), base58(call.public_key.slice(8)), integer(BigInt(nonce), 8),
    text(call.receiver_id), base58(blockHash), integer(1n, 4));
  if ("method" in call) {
    const args = new TextEncoder().encode(JSON.stringify(call.args));
    return concat(head, new Uint8Array([2]), text(call.method), vector(args), integer(BigInt(time(call.gas)), 8), integer(BigInt(amount(call.attached_deposit)), 16));
  }
  const permission = call.action.params.accessKey.permission;
  return concat(head, new Uint8Array([5, 0]), base58(call.action.params.publicKey.slice(8)), integer(0n, 8), new Uint8Array([0, 1]),
    integer(BigInt(amount(permission.allowance)), 16), text(permission.receiverId), integer(1n, 4), text(permission.methodNames[0]));
}
function toBase64(bytes: Uint8Array) {
  let binary = ""; for (let offset = 0; offset < bytes.length; offset += 8_192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8_192));
  return btoa(binary);
}
async function transaction(host: Host, injectedFetch: typeof fetch, call: ExactHumanCall | ExactAgentKeyCall, rpcUrl: string) {
  if (call.network !== "testnet") return fail("METEOR_TESTNET_REQUIRED");
  const rpc = createRpc(injectedFetch, rpcUrl), statusReply = object(await rpc("status", []));
  if (statusReply.chain_id !== "testnet" || object(statusReply.sync_info).syncing !== false) return fail("METEOR_RPC_NETWORK_MISMATCH");
  const header = object(object(await rpc("block", { finality: "final" })).header), blockHash = reference(header.hash);
  const access = object(await rpc("query", { request_type: "view_access_key", block_id: blockHash, account_id: call.signer_id, public_key: call.public_key }));
  if (access.block_hash !== blockHash || access.permission !== "FullAccess") return fail("METEOR_FULL_ACCESS_KEY_REQUIRED");
  if (count(access.nonce, Number.MAX_SAFE_INTEGER) >= Number.MAX_SAFE_INTEGER) return fail("METEOR_NONCE_RPC_LIMIT");
  const nonce = (BigInt(access.nonce as number) + 1n).toString();
  const wire = encode(call, nonce, blockHash);
  const payload = object(await exchange(host, "sign", { transactions: toBase64(wire) }));
  const outcomes = list(payload.executionOutcomes, 1); if (outcomes.length !== 1) return fail("METEOR_EXECUTION_OUTCOME_INVALID");
  return outcomes[0];
}

export function discoverMeteorWallet(host: Host = window, injectedFetch: typeof fetch = fetch): AdmittedInjectedWallet | null {
  if (!transport(host)) return null;
  let connected: readonly { readonly accountId: string; readonly publicKey: string }[] | null = null;
  const wallet = {
    manifest: { id: "meteor-wallet", name: "Meteor Wallet", type: "injected" as const,
      features: { testnet: true as const, signInWithoutAddKey: true as const, signAndSendTransaction: true as const } },
    async signIn({ network }: { network: "testnet" }) {
      if (network !== "testnet") return fail("METEOR_TESTNET_REQUIRED");
      connected = keys(await exchange(host, "login", { methods: [] })); return connected;
    },
    async signOut({ network }: { network: "testnet" }) {
      if (network !== "testnet") return fail("METEOR_TESTNET_REQUIRED"); connected = null;
    },
    async getAccounts({ network }: { network: "testnet" }) {
      if (network !== "testnet" || !connected) return fail("METEOR_WALLET_NOT_CONNECTED"); return connected;
    },
    async signAndSendTransaction(input: unknown) {
      if (!connected) return fail("METEOR_WALLET_NOT_CONNECTED");
      const value = object(input, ["network", "signerId", "signerPublicKey", "rpcUrl", "receiverId", "actions"]), actions = list(value.actions, 1);
      if (value.network !== "testnet" || actions.length !== 1) return fail("METEOR_TRANSACTION_INVALID");
      if (typeof value.rpcUrl !== "string" || !RPC_URLS.has(value.rpcUrl)) return fail("METEOR_REVIEWED_RPC_REQUIRED");
      const selected = connected.find(item => item.accountId === value.signerId && item.publicKey === value.signerPublicKey);
      if (!selected) return fail("METEOR_ACCOUNT_NOT_CONNECTED");
      const raw = object(actions[0]), action = raw.type === "FunctionCall"
        ? humanAction(selected, value.receiverId, raw)
        : keyAction(selected, value.receiverId, raw);
      return transaction(host, injectedFetch, action, value.rpcUrl);
    },
  };
  return Object.freeze({ id: wallet.manifest.id, name: wallet.manifest.name, wallet });
}

function humanAction(selected: { accountId: string; publicKey: string }, receiver: unknown, raw: Record<string, unknown>): ExactHumanCall {
  const params = object(raw.params, ["methodName", "args", "gas", "deposit"]);
  if (typeof params.methodName !== "string" || !HUMAN_METHODS.has(params.methodName)) return fail("METEOR_METHOD_NOT_ADMITTED");
  canonicalReviewContent(params.args); // Reject accessors/toJSON/non-JSON before preserving the reviewed JSON field order.
  return Object.freeze({ network: "testnet", signer_id: selected.accountId, public_key: selected.publicKey, receiver_id: account(receiver),
    method: params.methodName, args: object(parseBoundedJson(JSON.stringify(params.args), 16_384)),
    gas: time(params.gas), attached_deposit: amount(params.deposit) });
}
function keyAction(selected: { accountId: string; publicKey: string }, receiver: unknown, raw: Record<string, unknown>): ExactAgentKeyCall {
  if (raw.type !== "AddKey") return fail("METEOR_ACTION_NOT_ADMITTED");
  const params = object(raw.params, ["publicKey", "accessKey"]), accessKey = object(params.accessKey, ["nonce", "permission"]),
    permission = object(accessKey.permission, ["receiverId", "allowance", "methodNames"]), methods = list(permission.methodNames, 1);
  const restricted = publicKey(params.publicKey), allowance = amount(permission.allowance), signer = account(selected.accountId);
  if (account(receiver) !== signer || restricted === selected.publicKey || accessKey.nonce !== 0 || allowance === "0"
    || methods.length !== 1 || methods[0] !== "submit_purchase") return fail("METEOR_ADD_KEY_NOT_ADMITTED");
  const contractId = account(permission.receiverId);
  return Object.freeze({ network: "testnet", signer_id: signer, public_key: publicKey(selected.publicKey), receiver_id: signer,
    contract_id: contractId, action: Object.freeze({ type: "AddKey", params: Object.freeze({ publicKey: restricted,
      accessKey: Object.freeze({ nonce: 0, permission: Object.freeze({ receiverId: contractId, allowance,
        methodNames: Object.freeze(["submit_purchase"]) }) }) }) }) });
}
