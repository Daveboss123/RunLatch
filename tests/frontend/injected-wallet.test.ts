import assert from "node:assert/strict";
import { test } from "node:test";
import { admitInjectedWallet, connectInjectedWallet, disconnectInjectedWallet, discoverInjectedWallets, refreshInjectedWallet,
  signExactAgentKeyInstall, signExactHumanCall } from "../../src/lib/near/injected-wallet.ts";
import { scope } from "./helpers/action-review.ts";
import { discoverMeteorWallet } from "../../src/lib/near/meteor-wallet.ts";

const account = { accountId: "owner.testnet", publicKey: `ed25519:${"1".repeat(43)}` };
class WalletFixture {
  manifest = { id: "fixed-wallet", name: "Fixed wallet", type: "injected", features: {
    testnet: true, signInWithoutAddKey: true, signAndSendTransaction: true } };
  calls: unknown[] = []; signedOut = false;
  async signIn(input: unknown) { this.calls.push(["signIn", input]); return [account]; }
  async signOut(input: unknown) { this.calls.push(["signOut", input]); this.signedOut = true; }
  async getAccounts(input: unknown) { this.calls.push(["getAccounts", input]); return [account]; }
  async signAndSendTransaction(input: unknown) { this.calls.push(["sign", input]); return { transaction: { hash: "1".repeat(32) } }; }
}
const call = { network: "testnet" as const, signer_id: account.accountId, public_key: account.publicKey,
  receiver_id: "gate.testnet", method: "create_capsule", args: { capsule_id: "work" }, gas: "50000000000000", attached_deposit: "300" };

test("admitted injected wallet stays testnet, memory-only and signs one exact reviewed FunctionCall", async () => {
  const wallet = new WalletFixture(), admitted = admitInjectedWallet(wallet), connected = await connectInjectedWallet(admitted);
  assert.deepEqual(connected.accounts, [account]);
  const refreshed = await refreshInjectedWallet(connected); assert.deepEqual(refreshed.accounts, [account]);
  const result = await signExactHumanCall(refreshed, call);
  assert.equal(result.transaction_hash, "1".repeat(32)); assert.equal(result.status, "WALLET_SUBMISSION_RETURNED_UNVERIFIED");
  const signed = wallet.calls.find(entry => Array.isArray(entry) && entry[0] === "sign") as unknown[];
  assert.deepEqual(signed[1], { network: "testnet", signerId: "owner.testnet", receiverId: "gate.testnet", actions: [{
    type: "FunctionCall", params: { methodName: "create_capsule", args: { capsule_id: "work" }, gas: "50000000000000", deposit: "300" } }] });
  await disconnectInjectedWallet(refreshed); assert.equal(wallet.signedOut, true);
  await assert.rejects(signExactHumanCall(refreshed, call), /ALREADY_ATTEMPTED/u);
});

test("wallet admission rejects missing testnet features, accessors, identity changes and nonhuman methods", async () => {
  assert.throws(() => admitInjectedWallet({ ...new WalletFixture(), manifest: { ...new WalletFixture().manifest, features: { testnet: false } } }));
  assert.throws(() => admitInjectedWallet({ get manifest() { throw Error("PRIVATE_CANARY"); } }), /ACCESSOR_FORBIDDEN/u);
  const connected = await connectInjectedWallet(admitInjectedWallet(new WalletFixture()));
  await assert.rejects(signExactHumanCall(connected, { ...call, signer_id: "other.testnet" }), /IDENTITY_MISMATCH/u);
  await assert.rejects(signExactHumanCall(connected, { ...call, method: "submit_purchase" }), /CALL_NOT_ADMITTED/u);
});

test("wallet signs only an exact finite submit-only AddKey on the agent account", async () => {
  const wallet = new WalletFixture(); wallet.signIn = async input => { wallet.calls.push(["signIn", input]); return [{ accountId: scope.agent_id, publicKey: scope.recovery_public_key }]; };
  const connected = await connectInjectedWallet(admitInjectedWallet(wallet));
  const keyCall = { network: "testnet" as const, signer_id: scope.agent_id, public_key: scope.recovery_public_key, receiver_id: scope.agent_id,
    contract_id: "gate.testnet", action: { type: "AddKey" as const, params: { publicKey: scope.public_key, accessKey: { nonce: 0,
      permission: { receiverId: "gate.testnet", allowance: "50000000000000000000000", methodNames: ["submit_purchase"] } } } } };
  assert.equal((await signExactAgentKeyInstall(connected, keyCall)).status, "WALLET_AGENT_KEY_SUBMISSION_RETURNED_UNVERIFIED");
  await assert.rejects(signExactAgentKeyInstall(connected, { ...keyCall, action: { ...keyCall.action, params: { ...keyCall.action.params,
    accessKey: { ...keyCall.action.params.accessKey, permission: { ...keyCall.action.params.accessKey.permission, methodNames: ["submit_purchase", "pay"] } } } } }), /CALL_INVALID/u);
});

test("wallet discovery is explicit, bounded and ignores incompatible injections", async () => {
  const target = new EventTarget(), wallet = new WalletFixture();
  target.addEventListener("near-selector-ready", () => {
    target.dispatchEvent(new CustomEvent("near-wallet-injected", { detail: wallet }));
    target.dispatchEvent(new CustomEvent("near-wallet-injected", { detail: { manifest: {} } }));
  });
  const found = await discoverInjectedWallets(target, 50);
  assert.deepEqual(found.map(item => item.id), ["fixed-wallet"]);
  assert.equal(wallet.calls.length, 0);
});

test("Meteor v2 extension connects without adding/storing a key and signs exact testnet bytes", async () => {
  const publicKey = scope.recovery_public_key, messages: Record<string, unknown>[] = [], rpc: string[] = [];
  const host = Object.create(null) as { meteorComV2: unknown; crypto: Crypto };
  Object.defineProperties(host, { crypto: { value: { randomUUID: () => "fixed-meteor-request" } }, meteorComV2: { value: {
    version: "v2", featureFlags: [], async sendMessageDataAndRespond(value: unknown) {
      const message = value as Record<string, unknown>; messages.push(message);
      if (message.actionType === "login") return { uid: message.uid, status: "closed_success", endTags: [],
        payload: { accountId: scope.agent_id, allKeys: [publicKey] } };
      return { uid: message.uid, status: "closed_success", endTags: [], payload: { executionOutcomes: [{ transaction: { hash: "1".repeat(32) } }] } };
    } } } });
  const transport = async (_url: string | URL | Request, input?: RequestInit) => {
    const request = JSON.parse(String(input?.body)); rpc.push(request.method); let result: unknown;
    if (request.method === "status") result = { chain_id: "testnet", sync_info: { syncing: false } };
    else if (request.method === "block") result = { header: { hash: "1".repeat(32), height: 1, timestamp_nanosec: "1" } };
    else result = { block_hash: "1".repeat(32), block_height: 1, nonce: 7, permission: "FullAccess" };
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }), { headers: { "content-type": "application/json" } });
  };
  const admitted = discoverMeteorWallet(host, transport as typeof fetch); assert.ok(admitted);
  const connected = await connectInjectedWallet(admitted);
  assert.deepEqual(connected.accounts, [{ accountId: scope.agent_id, publicKey }]);
  assert.deepEqual(messages[0].inputs, { methods: [] });
  assert.equal(JSON.stringify(messages[0]).includes("public_key"), false); assert.equal(JSON.stringify(messages[0]).includes("contract_id"), false);
  const keyCall = { network: "testnet" as const, signer_id: scope.agent_id, public_key: scope.recovery_public_key, receiver_id: scope.agent_id,
    contract_id: "gate.testnet", action: { type: "AddKey" as const, params: { publicKey: scope.public_key, accessKey: { nonce: 0,
      permission: { receiverId: "gate.testnet", allowance: "50000000000000000000000", methodNames: ["submit_purchase"] } } } } };
  assert.equal((await signExactAgentKeyInstall(connected, keyCall, "https://test.rpc.fastnear.com/")).transaction_hash, "1".repeat(32));
  const signMessage = messages.find(message => message.actionType === "sign" && message.inputs !== undefined);
  assert.deepEqual(rpc, ["status", "block", "query"]); assert.equal(typeof (signMessage?.inputs as { transactions: unknown }).transactions, "string");
  await disconnectInjectedWallet(connected);
});

test("Meteor adapter rejects accessors, old transport, response mismatch and key substitution", async () => {
  assert.throws(() => discoverMeteorWallet(Object.create(null, { meteorComV2: { get() { throw Error("PRIVATE_CANARY"); } } }) as never), /ACCESSOR/u);
  assert.throws(() => discoverMeteorWallet({ meteorComV2: { version: "v1", featureFlags: [], sendMessageDataAndRespond() {} } } as never), /V2_REQUIRED/u);
  const host = { crypto: { randomUUID: () => "fixed" }, meteorComV2: { version: "v2", featureFlags: [],
    async sendMessageDataAndRespond() { return { uid: "other", status: "closed_success", payload: {} }; } } } as unknown as Window;
  const admitted = discoverMeteorWallet(host); assert.ok(admitted);
  await assert.rejects(connectInjectedWallet(admitted), /RESPONSE_MISMATCH/u);
});

test("Meteor waits for user approval with status-only messages and never resends action inputs", async () => {
  const messages: Record<string, unknown>[] = [];
  const host = { crypto: { randomUUID: () => "fixed" }, meteorComV2: { version: "v2", featureFlags: [],
    async sendMessageDataAndRespond(input: unknown) { const message = input as Record<string, unknown>; messages.push(message);
      return messages.length === 1 ? { uid: message.uid, status: "connected", endTags: [] }
        : { uid: message.uid, status: "closed_success", endTags: [], payload: { accountId: "owner.testnet", allKeys: [scope.recovery_public_key] } };
    } } } as unknown as Window;
  const admitted = discoverMeteorWallet(host); assert.ok(admitted); await connectInjectedWallet(admitted);
  assert.equal(messages.length, 3); assert.deepEqual(messages[0].inputs, { methods: [] });
  assert.equal(messages[1].inputs, undefined); assert.equal(messages[0].uid, messages[1].uid);
  assert.equal(messages[2].status, "closed_success"); assert.equal(messages[2].inputs, undefined);
});
