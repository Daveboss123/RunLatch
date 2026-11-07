/** Synthetic RPC replies only. No testnet calls, deployment, wallet or payment evidence. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestnetReader, parseTestnetTarget } from "../../src/lib/near/testnet-rpc.ts";
import { commercialQuoteHash } from "../../src/lib/purchasing/hashing.ts";
import { observationFixture } from "./helpers/observation.ts";

const target = { network: "testnet", rpc_url: "https://rpc.testnet.near.org/", contract_id: "contract.testnet",
  operator_id: "owner.testnet", expected_code_hash: "2".repeat(32) };
const selection = { project_id: "client-work", capsule_ids: ["work"], provider_ids: ["database-fixture", "hosting-fixture"], quote_ids: ["database-quote"],
  disclosure: { project_id: "client-work", budget: true, expenses: true, evidence: true } };
async function fixture() {
  const raw = await observationFixture();
  raw.quotes[0].terms = { ...raw.quotes[0].terms, publisher_id: "publisher.testnet", input: { ...raw.quotes[0].terms.input, recipient_id: "publisher.testnet" } };
  raw.quotes[0].quote_hash = await commercialQuoteHash(raw.quotes[0].terms, "testnet", target.contract_id);
  raw.providers[0].publisher_id = raw.providers[0].recipient_id = raw.providers[1].publisher_id = raw.providers[1].recipient_id = "publisher.testnet";
  raw.snapshots[0].capsule.owner_id = "owner.testnet";
  raw.snapshots[0].purchases[0].canonical_quote = raw.quotes[0].terms;
  raw.snapshots[0].purchases[0].proposal.expected_quote_hash = raw.quotes[0].quote_hash;
  return { ...raw, snapshots: [{ ...raw.snapshots[0], project: { ...raw.snapshots[0].project, owner_id: "owner.testnet" },
    capsule: { ...raw.snapshots[0].capsule, created_at_ns: "2", policy_schema_version: 2 } }] };
}
type Request = { id: string; method: string; params: Record<string, unknown> };
async function mock(change?: (request: Request, result: unknown) => unknown) {
  const data = await fixture(), calls: Request[] = [];
  const fetcher: typeof fetch = async (url, options) => {
    assert.equal(url, target.rpc_url); assert.equal(options?.method, "POST"); assert.equal(options.credentials, "omit"); assert.equal(options.redirect, "error");
    const request: Request = JSON.parse(String(options.body)); calls.push(request);
    assert.ok(["status", "block", "query"].includes(request.method), "No broadcast/signing RPC");
    let result: unknown;
    if (request.method === "status") result = { chain_id: "testnet", sync_info: { syncing: false } };
    else if (request.method === "block") { assert.deepEqual(request.params, { finality: "final" }); result = { header: { hash: "1".repeat(32), height: 100, timestamp_nanosec: "30" } }; }
    else {
      assert.equal(request.params.block_id, "1".repeat(32)); assert.equal(request.params.account_id, "contract.testnet");
      if (request.params.request_type === "view_account") result = { code_hash: target.expected_code_hash, block_hash: "1".repeat(32), block_height: 100 };
      else {
        const args = JSON.parse(Buffer.from(String(request.params.args_base64), "base64").toString("utf8"));
        const values: Record<string, unknown> = { get_operator: "owner.testnet", get_schema_version: 2, get_network_tag: "testnet",
          get_storage_requirements: { project_credit: "8192", capsule_credit: "262144", provider_credit: "4096", quote_credit: "8192", scope: "CONSERVATIVE_PREPAID_STATE_LIMITS_NOT_MEASURED_GAS" },
          get_project: data.snapshots[0].project, get_capsule_report_snapshot: data.snapshots[0], get_quote: data.quotes[0],
          get_provider: data.providers.find(p => p.provider_id === args.provider_id) };
        assert.ok(Object.hasOwn(values, String(request.params.method_name)), "Only explicit contract view methods");
        result = { result: [...new TextEncoder().encode(JSON.stringify(values[String(request.params.method_name)]))], block_hash: "1".repeat(32), block_height: 100 };
      }
    }
    result = change ? change(request, result) : result;
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }), { headers: { "content-type": "application/json" } });
  };
  return { fetcher, calls, data };
}
test("testnet configuration rejects missing targets, mainnet, role conflict and credential/redirect URLs before calls", () => {
  for (const value of [null, {}, { ...target, network: "mainnet" }, { ...target, contract_id: "contract.near" }, { ...target, operator_id: target.contract_id },
    ...["https://rpc.testnet.near.org/?token=fixture", "http://rpc.testnet.near.org/", "https://rpc.testnet.near.org.evil.invalid/", "https://rpc.testnet.near.org/#data", "https://rpc.testnet.near.org:4000/"].map(rpc_url => ({ ...target, rpc_url }))]) assert.throws(() => parseTestnetTarget(value));
  assert.equal(parseTestnetTarget({ ...target, rpc_url: "https://test.rpc.fastnear.com" }).rpc_url, "https://test.rpc.fastnear.com/");
});
test("preflight pins final views, operator/code/schema/network and marks injected transport unverified", async () => {
  const m = await mock(), reader = createTestnetReader(target, m.fetcher), p = await reader.preflight();
  assert.equal(p.block.timestamp_ns, "30"); assert.equal(p.transport_source, "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE");
  assert.equal(p.grants_payment_authority, false); assert.equal(p.independently_verified, false);
  assert.equal(m.calls.length, 7); assert.ok(!Object.hasOwn(reader, "rpc")); assert.ok(!Object.hasOwn(reader, "view"));
});
test("selected canonical project report keeps integer spend separate from unverified settlement", async () => {
  const m = await mock(), result = await createTestnetReader(target, m.fetcher).readProject(selection);
  assert.equal(result.report.financials?.spent, "50"); assert.equal(result.report.financials?.available_now, "250");
  assert.equal(result.report.source, "NEAR_TESTNET_OBSERVATION"); assert.match(result.settlement_verification, /^UNVERIFIED/u);
  assert.equal(result.quotes[0].quote_hash, m.data.quotes[0].quote_hash); assert.equal(result.report.coverage.complete_project, true);
  assert.equal(m.calls.length, 12);
});
test("explicit disclosure omits financials/expenses without inventing zeros", async () => {
  const m = await mock(), result = await createTestnetReader(target, m.fetcher).readProject({ ...selection, disclosure: { ...selection.disclosure, budget: false, expenses: false, evidence: false } });
  assert.equal(result.report.financials, null); assert.deepEqual(result.report.expenses, []);
});
test("wrong network/syncing/code/operator/schema and mixed-block responses fail closed", async () => {
  for (const modify of [
    (r: Request, v: unknown) => r.method === "status" ? { chain_id: "mainnet", sync_info: { syncing: false } } : v,
    (r: Request, v: unknown) => r.method === "status" ? { chain_id: "testnet", sync_info: { syncing: true } } : v,
    (r: Request, v: unknown) => r.params.request_type === "view_account" ? { ...v as object, code_hash: "3".repeat(32) } : v,
    (r: Request, v: unknown) => r.params.method_name === "get_operator" ? { ...v as object, result: [...Buffer.from('"intruder.testnet"')] } : v,
    (r: Request, v: unknown) => r.params.method_name === "get_schema_version" ? { ...v as object, result: [...Buffer.from("1")] } : v,
    (r: Request, v: unknown) => r.params.method_name === "get_network_tag" ? { ...v as object, result: [...Buffer.from('"mainnet"')] } : v,
    (r: Request, v: unknown) => r.method === "query" ? { ...v as object, block_hash: "4".repeat(32) } : v,
  ]) { const m = await mock(modify); await assert.rejects(createTestnetReader(target, m.fetcher).preflight()); }
});
test("cross-project/owner/capsule selection and malformed/duplicate inputs are rejected", async () => {
  const m = await mock();
  for (const value of [{ ...selection, capsule_ids: ["other"] }, { ...selection, capsule_ids: ["work", "work"] }, { ...selection, capsule_ids: [] },
    { ...selection, quote_ids: Array.from({ length: 17 }, (_, i) => `q${i}`) }, { ...selection, disclosure: { ...selection.disclosure, project_id: "other" } }]) await assert.rejects(createTestnetReader(target, m.fetcher).readProject(value));
  const wrong = await mock((r, v) => r.params.method_name === "get_capsule_report_snapshot" ? { ...v as object, result: [...Buffer.from(JSON.stringify({ ...m.data.snapshots[0], capsule: { ...m.data.snapshots[0].capsule, owner_id: "intruder.testnet" } }))] } : v);
  await assert.rejects(createTestnetReader(target, wrong.fetcher).readProject(selection), /TESTNET_SNAPSHOT_BINDING_MISMATCH/u);
});
test("RPC failures never echo provider error strings or invoke write/retry methods", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (_url, options) => { calls++; const r = JSON.parse(String(options?.body)); return new Response(JSON.stringify({ jsonrpc: "2.0", id: r.id, error: { code: -32000, message: "untrusted-provider-content", cause: { name: "TIMEOUT_ERROR" } } }), { headers: { "content-type": "application/json" } }); };
  await assert.rejects(createTestnetReader(target, fetcher).preflight(), /TESTNET_RPC_TIMEOUT_ERROR/u); assert.equal(calls, 1);
  await assert.rejects(createTestnetReader(target, async () => { throw new Error("untrusted-provider-content"); }).preflight(), /TESTNET_RPC_UNAVAILABLE/u);
  await assert.rejects(createTestnetReader(target, async () => { throw new Error("UNTRUSTED_SECRET_MESSAGE"); }).preflight(), /TESTNET_RPC_UNAVAILABLE/u);
});
test("malformed/duplicate/oversize/content-type/envelope replies fail closed and cancellation retained", async () => {
  for (const response of [() => new Response('{"jsonrpc":"2.0","id":"runlatch-read-1","result":{},"result":{}}', { headers: { "content-type": "application/json" } }),
    () => new Response("bad", { headers: { "content-type": "text/html" } }), () => new Response("{}", { headers: { "content-type": "application/json", "content-length": "1048577" } }),
    () => new Response(JSON.stringify({ jsonrpc: "2.0", id: "other", result: {} }), { headers: { "content-type": "application/json" } }),
    () => new Response("x".repeat(1048577), { headers: { "content-type": "application/json" } })]) await assert.rejects(createTestnetReader(target, async () => response()).preflight());
  const controller = new AbortController(); controller.abort();
  let calls = 0;
  await assert.rejects(createTestnetReader(target, async () => { calls++; throw new Error("unreachable"); }).preflight(controller.signal), /TESTNET_READ_CANCELLED/u);
  assert.equal(calls, 0);
});
