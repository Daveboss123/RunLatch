/** Synthetic extension/RPC responses and generated in-memory identities, not wallet/chain evidence. */
import assert from "node:assert/strict";
import test from "node:test";
import { discoverMeteorWallet } from "../../src/lib/near/meteor-wallet.ts";
import { connectInjectedWallet, signExactAgentKeyInstall, signExactHumanCall } from "../../src/lib/near/injected-wallet.ts";
import { encodeDemoTransaction } from "../../scripts/setup/demo-operation-codec.ts";
import { prepareDemoOperation } from "../../scripts/setup/human-demo-operation.ts";
import { demoFixture } from "../near/helpers/demo-operation.ts";
for (const kind of ["project", "capsule", "quote", "agent-key"] as const) test(`Meteor ${kind}: exact native bytes match the independently Rust-checked Node codec`, async () => {
  const fixture = await demoFixture(kind), review = await prepareDemoOperation(kind, fixture.publicKey, fixture.transport), messages: Record<string, unknown>[] = [];
  const host = { crypto: { randomUUID: () => `${kind}-one-turn` }, meteorComV2: { version: "v2", featureFlags: [],
    async sendMessageDataAndRespond(input: unknown) {
      const message = input as Record<string, unknown>; messages.push(message);
      return { uid: message.uid, status: "closed_success", endTags: [], payload: message.actionType === "login"
        ? { accountId: review.transaction.signer_id, allKeys: [fixture.publicKey] }
        : { executionOutcomes: [{ transaction: { hash: review.transaction_hash } }] } };
    } } } as unknown as Window;
  const rpc: typeof fetch = async (_url, options) => {
    const req = JSON.parse(String(options?.body)); let result: unknown;
    if (req.method === "status") result = { chain_id: "testnet", sync_info: { syncing: false } };
    else if (req.method === "block") result = { header: { hash: review.transaction.block_hash, height: 1000 } };
    else result = { block_hash: review.transaction.block_hash, block_height: 1000, permission: "FullAccess", nonce: fixture.state.nonce };
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: req.id, result }), { headers: { "content-type": "application/json" } });
  };
  const admitted = discoverMeteorWallet(host, rpc); assert.ok(admitted); const wallet = await connectInjectedWallet(admitted);
  if (review.content.kind === "agent-key") await signExactAgentKeyInstall(wallet, review.content.review.call, review.content.review.target.rpc_url);
  else await signExactHumanCall(wallet, review.content.review.call, review.content.review.target.rpc_url);
  const signMessage = messages.find(message => message.actionType === "sign" && message.inputs !== undefined);
  assert.ok(signMessage);
  assert.equal((signMessage.inputs as { transactions: string }).transactions, Buffer.from(encodeDemoTransaction(review.transaction).unsigned_bytes).toString("base64"));
  assert.equal(messages.filter(message => message.actionType === "sign" && message.inputs !== undefined).length, 1);
});
