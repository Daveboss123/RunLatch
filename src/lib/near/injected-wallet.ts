/**
 * Minimal user-triggered bridge for the documented NEAR injected-wallet interface.
 * No manifest fetch, iframe executor, persistence, auto-connect, key import or fallback.
 */
import { account, amount, fail, reference } from "./records.ts";
import { publicKey } from "./testnet-evidence.ts";
import { discoverMeteorWallet } from "./meteor-wallet.ts";
import { canonicalReviewContent } from "./review-content.ts";
import { HUMAN_WORKSPACE_METHODS, OWNER_CONTROL_METHODS } from "./human-methods.ts";

const WALLET_EVENT = "near-wallet-injected";
const READY_EVENT = "near-selector-ready";
const MAX_WALLETS = 4;
const walletAttempts = new WeakMap<object, Set<string>>();
function claimWalletCall(connection: ConnectedInjectedWallet, call: unknown) {
  const identity = canonicalReviewContent(call);
  let attempts = walletAttempts.get(connection.wallet);
  if (!attempts) { attempts = new Set(); walletAttempts.set(connection.wallet, attempts); }
  if (attempts.has(identity)) return fail("WALLET_ACTION_ALREADY_ATTEMPTED_READBACK_ONLY");
  if (attempts.size >= 8) return fail("WALLET_SESSION_ACTION_LIMIT");
  attempts.add(identity); // Never released after error, timeout, disconnect or unknown wallet return.
}
const HUMAN_METHODS: ReadonlySet<string> = new Set(HUMAN_WORKSPACE_METHODS);

export interface WalletAccount { readonly accountId: string; readonly publicKey: string }
export interface ExactHumanCall {
  readonly network: "testnet"; readonly signer_id: string; readonly public_key: string; readonly receiver_id: string;
  readonly method: string; readonly args: Readonly<Record<string, unknown>>; readonly gas: string; readonly attached_deposit: string;
}
export interface ExactAgentKeyCall {
  readonly network: "testnet"; readonly signer_id: string; readonly public_key: string; readonly receiver_id: string; readonly contract_id: string;
  readonly action: { readonly type: "AddKey"; readonly params: { readonly publicKey: string; readonly accessKey: { readonly nonce: number;
    readonly permission: { readonly receiverId: string; readonly allowance: string; readonly methodNames: readonly string[] } } } };
}
interface WalletManifest {
  readonly id: string; readonly name: string; readonly type: "injected";
  readonly features: { readonly testnet: true; readonly signInWithoutAddKey: true; readonly signAndSendTransaction: true };
}
interface InjectedWalletApi {
  readonly manifest: WalletManifest;
  signIn(input: { network: "testnet" }): Promise<unknown>;
  signOut(input: { network: "testnet" }): Promise<void>;
  getAccounts(input: { network: "testnet" }): Promise<unknown>;
  signAndSendTransaction(input: unknown): Promise<unknown>;
}
export interface AdmittedInjectedWallet { readonly id: string; readonly name: string; readonly wallet: InjectedWalletApi }
export interface ConnectedInjectedWallet extends AdmittedInjectedWallet { readonly accounts: readonly WalletAccount[] }
interface DiscoveryTarget {
  addEventListener(type: string, callback: EventListener): void;
  removeEventListener(type: string, callback: EventListener): void;
  dispatchEvent(event: Event): boolean;
}

function own(value: unknown, key: string): unknown {
  if (!value || (typeof value !== "object" && typeof value !== "function")) return fail("INJECTED_WALLET_INVALID");
  for (let current: object | null = value as object, depth = 0; current && depth < 4; current = Object.getPrototypeOf(current), depth++) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (!descriptor) continue;
    if (descriptor.get || descriptor.set || !("value" in descriptor)) return fail("INJECTED_WALLET_ACCESSOR_FORBIDDEN");
    return descriptor.value;
  }
  return fail("INJECTED_WALLET_FIELD_MISSING");
}
function text(value: unknown, pattern: RegExp, code: string) {
  if (typeof value !== "string" || !pattern.test(value)) return fail(code);
  return value;
}
function method(wallet: unknown, name: keyof InjectedWalletApi) {
  const value = own(wallet, name);
  if (typeof value !== "function") return fail("INJECTED_WALLET_METHOD_MISSING");
  return value;
}
export function admitInjectedWallet(input: unknown): AdmittedInjectedWallet {
  const manifest = own(input, "manifest"), features = own(manifest, "features");
  const id = text(own(manifest, "id"), /^[a-z0-9][a-z0-9-]{0,63}$/u, "INJECTED_WALLET_ID_INVALID");
  const name = text(own(manifest, "name"), /^.{1,80}$/u, "INJECTED_WALLET_NAME_INVALID");
  if (own(manifest, "type") !== "injected" || own(features, "testnet") !== true
    || own(features, "signInWithoutAddKey") !== true || own(features, "signAndSendTransaction") !== true) return fail("INJECTED_WALLET_FEATURES_REQUIRED");
  for (const name of ["signIn", "signOut", "getAccounts", "signAndSendTransaction"] as const) method(input, name);
  return Object.freeze({ id, name, wallet: input as InjectedWalletApi });
}
function parseAccounts(value: unknown): readonly WalletAccount[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) return fail("INJECTED_WALLET_ACCOUNTS_INVALID");
  const accounts = value.map(item => Object.freeze({ accountId: account(own(item, "accountId")),
    publicKey: text(own(item, "publicKey"), /^ed25519:[1-9A-HJ-NP-Za-km-z]{43,44}$/u, "INJECTED_WALLET_PUBLIC_KEY_INVALID") }));
  if (new Set(accounts.map(item => `${item.accountId}:${item.publicKey}`)).size !== accounts.length) return fail("INJECTED_WALLET_ACCOUNTS_INVALID");
  return Object.freeze(accounts);
}
export async function connectInjectedWallet(admitted: AdmittedInjectedWallet): Promise<ConnectedInjectedWallet> {
  const accounts = parseAccounts(await method(admitted.wallet, "signIn").call(admitted.wallet, { network: "testnet" }));
  return Object.freeze({ ...admitted, accounts });
}
export async function disconnectInjectedWallet(connection: ConnectedInjectedWallet) {
  await method(connection.wallet, "signOut").call(connection.wallet, { network: "testnet" });
}
export async function refreshInjectedWallet(connection: ConnectedInjectedWallet): Promise<ConnectedInjectedWallet> {
  return Object.freeze({ ...connection, accounts: parseAccounts(await method(connection.wallet, "getAccounts").call(connection.wallet, { network: "testnet" })) });
}
function transactionHash(value: unknown): string {
  const transaction = own(value, "transaction");
  return reference(own(transaction, "hash"));
}
export async function signExactHumanCall(connection: ConnectedInjectedWallet, call: ExactHumanCall, rpcUrl?: string) {
  if (call.network !== "testnet" || !HUMAN_METHODS.has(call.method)) return fail("WALLET_CALL_NOT_ADMITTED");
  if (OWNER_CONTROL_METHODS.some(method => method === call.method) && amount(call.attached_deposit) !== "1") return fail("OWNER_CONTROL_DEPOSIT_MISMATCH");
  const matched = connection.accounts.some(item => item.accountId === call.signer_id && item.publicKey === call.public_key);
  if (!matched) return fail("WALLET_REVIEW_IDENTITY_MISMATCH");
  claimWalletCall(connection, call);
  const result = await method(connection.wallet, "signAndSendTransaction").call(connection.wallet, {
    network: "testnet", signerId: call.signer_id, ...(connection.id === "meteor-wallet" ? { signerPublicKey: call.public_key, rpcUrl } : {}), receiverId: call.receiver_id,
    actions: [{ type: "FunctionCall", params: { methodName: call.method, args: call.args, gas: call.gas, deposit: call.attached_deposit } }],
  });
  return Object.freeze({ status: "WALLET_SUBMISSION_RETURNED_UNVERIFIED" as const, transaction_hash: transactionHash(result),
    signer_id: call.signer_id, receiver_id: call.receiver_id, method: call.method,
    limitation: "Wallet-returned public transaction identity only. Re-read FINAL receipts and contract state; this is not settlement, provisioning or acceptance." });
}
export async function signExactAgentKeyInstall(connection: ConnectedInjectedWallet, call: ExactAgentKeyCall, rpcUrl?: string) {
  if (call.network !== "testnet" || account(call.signer_id) !== account(call.receiver_id) || publicKey(call.public_key) === publicKey(call.action.params.publicKey))
    return fail("WALLET_AGENT_KEY_CALL_INVALID");
  const permission = call.action.params.accessKey.permission;
  if (call.action.type !== "AddKey" || call.action.params.accessKey.nonce !== 0 || account(permission.receiverId) !== account(call.contract_id)
    || account(call.contract_id) === call.signer_id
    || amount(permission.allowance) === "0" || permission.methodNames.length !== 1 || permission.methodNames[0] !== "submit_purchase")
    return fail("WALLET_AGENT_KEY_CALL_INVALID");
  const matched = connection.accounts.some(item => item.accountId === call.signer_id && item.publicKey === call.public_key);
  if (!matched) return fail("WALLET_REVIEW_IDENTITY_MISMATCH");
  claimWalletCall(connection, call);
  const result = await method(connection.wallet, "signAndSendTransaction").call(connection.wallet, {
    network: "testnet", signerId: call.signer_id, ...(connection.id === "meteor-wallet" ? { signerPublicKey: call.public_key, rpcUrl } : {}), receiverId: call.receiver_id, actions: [call.action],
  });
  return Object.freeze({ status: "WALLET_AGENT_KEY_SUBMISSION_RETURNED_UNVERIFIED" as const, transaction_hash: transactionHash(result),
    signer_id: call.signer_id, restricted_public_key: call.action.params.publicKey, receiver_id: permission.receiverId,
    limitation: "Wallet-returned AddKey identity only. Re-read the exact function-call permission, finite allowance and retained recovery key before any agent signature." });
}

/** Explicit-click discovery. Compatible wallets answer near-selector-ready with a CustomEvent; nothing runs at module import. */
export function discoverInjectedWallets(target: DiscoveryTarget = window, waitMs = 500): Promise<readonly AdmittedInjectedWallet[]> {
  if (!Number.isSafeInteger(waitMs) || waitMs < 50 || waitMs > 2_000) return Promise.reject(new Error("INJECTED_WALLET_DISCOVERY_TIMEOUT_INVALID"));
  return new Promise(resolve => {
    const found = new Map<string, AdmittedInjectedWallet>();
    try { const meteor = discoverMeteorWallet(target as DiscoveryTarget & Window); if (meteor) found.set(meteor.id, meteor); }
    catch { /* An invalid injected Meteor object is ignored like any incompatible wallet. */ }
    const receive = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      try { const wallet = admitInjectedWallet(event.detail); if (found.size < MAX_WALLETS || found.has(wallet.id)) found.set(wallet.id, wallet); }
      catch { /* Untrusted incompatible injections are ignored, never connected. */ }
    };
    target.addEventListener(WALLET_EVENT, receive);
    target.dispatchEvent(new Event(READY_EVENT));
    setTimeout(() => { target.removeEventListener(WALLET_EVENT, receive); resolve(Object.freeze([...found.values()])); }, waitMs);
  });
}
