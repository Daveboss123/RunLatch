/** Synthetic public RPC data; ephemeral in-memory signing only. Never real store/network. */
import { createHash, sign } from "node:crypto";
import { prepareGeneratedDemoKey, demoKeyRoles } from "../../../scripts/setup/human-demo-keys.ts";
import { importGeneratedOperatorRecord } from "../../../scripts/setup/human-demo-signer.ts";
import { parsePublicDemoKeys } from "../../../scripts/setup/human-create-demo-parent.ts";
import { childAccounts, encodeChildTransaction, verifyChildSignature, parentAccount, type ChildTransaction } from "../../../scripts/setup/child-account-codec.ts";
import { encodeBase58_32 } from "../../../scripts/near/base58.ts";

export function childFixture() {
  const records = demoKeyRoles.map(role => prepareGeneratedDemoKey(role));
  const operator = records[0], blob = Buffer.from(operator.input.toString("utf8"), "utf16le");
  const privateKey = importGeneratedOperatorRecord(blob, operator.publicRecord.public_key); blob.fill(0);
  const keys = parsePublicDemoKeys({ source: "HUMAN_REPORTED_PUBLIC_KEY_RECORDS_NOT_AGENT_CREDENTIAL_VERIFICATION",
    keys: records.map(record => ({ ...record.publicRecord, status: "STORED_VERIFIED" })) });
  for (const record of records) record.input.fill(0);
  let nonce = 100, sends = 0, signatures = 0;
  const children = new Map<string, string>(), hash = encodeBase58_32(Buffer.alloc(32, 20));
  const transactions: ChildTransaction[] = [];
  const state = { get sends() { return sends; }, get signatures() { return signatures; }, get nonce() { return nonce; },
    children, hash, mainnet: false, wrongKey: false, unsafeNonce: false, failSend: false, badFinal: false };
  function signer(tx: ChildTransaction) {
    signatures++; transactions.push(tx);
    return verifyChildSignature(tx, sign(null, createHash("sha256").update(encodeChildTransaction(tx).unsigned_bytes).digest(), privateKey)).signed_bytes;
  }
  const transport = async (_url: string, input: RequestInit) => {
    const request = JSON.parse(String(input.body)); let result: unknown;
    if (request.method === "status") result = { chain_id: state.mainnet ? "mainnet" : "testnet", sync_info: { syncing: false } };
    else if (request.method === "block") result = { header: { hash, height: 1000 } };
    else if (request.method === "gas_price") result = { gas_price: "100000000" };
    else if (request.method === "EXPERIMENTAL_protocol_config") {
      const fee = { send_not_sir: 100000, execution: 100000 };
      result = { protocol_version: 88, runtime_config: { storage_amount_per_byte: "10000000000000000000",
        transaction_costs: { action_receipt_creation_config: fee, action_creation_config: { create_account_cost: fee,
          transfer_cost: fee, add_key_cost: { full_access_cost: fee } } } } };
    } else if (request.method === "query") {
      if (request.params.request_type === "view_account") {
        if (request.params.account_id !== parentAccount && !children.has(request.params.account_id))
          return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, error: { cause: { name: "UNKNOWN_ACCOUNT" } } }));
        result = { amount: request.params.account_id === parentAccount ? "10000000000000000000000000" : children.get(request.params.account_id),
          locked: "0", storage_usage: 100, block_hash: hash, code_hash: "11111111111111111111111111111111" };
      } else {
        const publicKey = request.params.account_id === parentAccount ? keys[0].public_key
          : keys.find(key => key.account_id === request.params.account_id)?.public_key;
        result = { block_hash: hash, keys: [{ public_key: state.wrongKey ? keys[4].public_key : publicKey,
          access_key: { nonce: state.unsafeNonce ? Number.MAX_SAFE_INTEGER + 1 : nonce, permission: "FullAccess" } }] };
      }
    } else if (request.method === "send_tx") {
      sends++; if (state.failSend) throw Error("UNTRUSTED SECRET-LIKE ERROR MUST NOT BE PRINTED");
      const tx = transactions.at(-1)!;
      children.set(tx.receiver_id, tx.amount); nonce = Number(tx.nonce);
      result = finalChildResponse(tx, hash); if (state.badFinal) (result as Record<string, unknown>).final_execution_status = "INCLUDED_FINAL";
    } else throw Error("UNEXPECTED_TEST_METHOD");
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }));
  };
  return { keys, state, transport, signer };
}
export function finalChildResponse(tx: ChildTransaction, blockHash: string) {
  const encoded = encodeChildTransaction(tx), receiptId = encodeBase58_32(Buffer.alloc(32, 21));
  return { final_execution_status: "FINAL", status: { SuccessValue: "" },
    transaction: { hash: encoded.transaction_hash, signer_id: parentAccount, public_key: tx.public_key, nonce: Number(tx.nonce), receiver_id: tx.receiver_id,
      actions: ["CreateAccount", { Transfer: { deposit: tx.amount } }, { AddKey: { public_key: tx.child_public_key, access_key: { nonce: 0, permission: "FullAccess" } } }] },
    transaction_outcome: { id: encoded.transaction_hash, block_hash: blockHash, outcome: { executor_id: parentAccount,
      receipt_ids: [receiptId], status: { SuccessReceiptId: receiptId } } },
    receipts_outcome: [{ id: receiptId, block_hash: blockHash, outcome: { executor_id: tx.receiver_id, receipt_ids: [] as string[], status: { SuccessValue: "" } } }] };
}
export function fixtureTransaction(fixture: ReturnType<typeof childFixture>, index = 0): ChildTransaction {
  return encodeChildTransaction({ network: "testnet", signer_id: parentAccount, public_key: fixture.keys[0].public_key,
    nonce: String(101 + index), receiver_id: childAccounts[index].account_id, block_hash: fixture.state.hash,
    child_public_key: fixture.keys[index + 1].public_key, amount: childAccounts[index].amount }).transaction;
}
