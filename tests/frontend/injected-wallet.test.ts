import assert from "node:assert/strict";
import { test } from "node:test";
import { admitInjectedWallet, connectInjectedWallet, disconnectInjectedWallet, discoverInjectedWallets, refreshInjectedWallet,
  signExactAgentKeyInstall, signExactHumanCall } from "../../src/lib/near/injected-wallet.ts";
import { scope } from "./helpers/action-review.ts";

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
