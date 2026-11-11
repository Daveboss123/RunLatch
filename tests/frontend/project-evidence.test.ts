import assert from "node:assert/strict";
import { test } from "node:test";
import { readVerifiedProject } from "../../src/lib/near/project-evidence.ts";
import { createTestnetReader } from "../../src/lib/near/testnet-rpc.ts";
import { importLocalObservation } from "../../src/lib/near/observation.ts";
import { evidenceFixture, evidenceTransport, target } from "./helpers/testnet-evidence.ts";
import { ownerFixture } from "./helpers/owner-review.ts";
import { object } from "../../src/lib/near/records.ts";

function input(f: Awaited<ReturnType<typeof evidenceFixture>>, intents: unknown[] = [f.intent], visible = true) {
  const project = f.snapshot.project.input.project_id;
  return { selection: { project_id: project, capsule_ids: ["work"], provider_ids: [f.provider.provider_id], quote_ids: [f.quote.terms.input.quote_id],
    disclosure: { project_id: project, budget: visible, expenses: visible, evidence: visible } }, intents };
}
test("public adapter joins current snapshot to exact native proof without LOCAL relabelling", async () => {
  const f = (await ownerFixture()).f, rpc = evidenceTransport(f), result = await readVerifiedProject(createTestnetReader(target, rpc.transport), input(f));
  assert.equal(result.source, "INJECTED_TESTNET_RECORDS"); assert.equal(result.outcome.observation.public_testnet, false);
  assert.equal(result.outcome.receipts[0].settlement, "SETTLED"); assert.equal(result.report.verified_purchase_spend, "50");
  assert.equal(result.report.expenses[0].payment_evidence, "SETTLED"); assert.equal(result.grants_payment_authority, false);
  assert.equal(rpc.calls.filter(c => c.method === "tx_status").length, 1);
  await assert.rejects(importLocalObservation(JSON.stringify(result.outcome.observation)));
});
test("a SETTLED ledger with no transaction proof stays unverified and is excluded from cost facts", async () => {
  const f = (await ownerFixture()).f, result = await readVerifiedProject(createTestnetReader(target, evidenceTransport(f).transport), input(f, []));
  assert.equal(result.outcome.receipts[0].settlement, "SETTLEMENT_UNVERIFIED"); assert.equal(result.outcome.runs[0].cost_fact, null);
  assert.equal(result.report.financials?.spent, "50"); assert.equal(result.report.expenses[0].payment_evidence, "SETTLEMENT_UNVERIFIED");
});
test("unknown captured transaction remains an unresolved identity, never a fabricated denial", async () => {
  const f = (await ownerFixture()).f, rpc = evidenceTransport(f, "2.14.0", (method) => method === "tx_status"
    ? { error: { cause: { name: "UNKNOWN_TRANSACTION" } } } : undefined);
  const result = await readVerifiedProject(createTestnetReader(target, rpc.transport), input(f));
  assert.equal(result.unverified_requests.length, 1); assert.equal(result.unverified_requests[0].transaction_hash, f.intent.transaction_hash);
  assert.equal(result.outcome.observation.attempts.length, 0); assert.equal(result.outcome.runs[0].cost_fact, null);
});
test("disclosure starts off: proof never silently adds financials or expenses to the exported report", async () => {
  const f = (await ownerFixture()).f, result = await readVerifiedProject(createTestnetReader(target, evidenceTransport(f).transport), input(f, [f.intent], false));
  assert.equal(result.report.financials, null); assert.equal(result.report.verified_purchase_spend, null); assert.deepEqual(result.report.expenses, []);
});
test("cross-project, duplicate, excessive and malformed selections fail before network", async () => {
  const f = await evidenceFixture(), rpc = evidenceTransport(f), reader = createTestnetReader(target, rpc.transport);
  await assert.rejects(readVerifiedProject(reader, input(f, [f.intent, f.intent])), /SCOPE/u);
  await assert.rejects(readVerifiedProject(reader, input(f, [{ ...f.intent, proposal: { ...f.intent.proposal, project_id: "other" } }])), /SCOPE/u);
  await assert.rejects(readVerifiedProject(reader, { ...input(f), selection: { ...input(f).selection, provider_ids: "wrong" } }));
  assert.equal(rpc.calls.length, 0);
});

test("changed terminal records and stale/mixed final-block or transport reads cannot produce costs", async () => {
  const f = (await ownerFixture()).f, base = createTestnetReader(target, evidenceTransport(f).transport);
  for (const mutation of ["terminal", "block", "transport"] as const) {
    const reader = { observePurchase: base.observePurchase, async readProject(value: unknown, signal?: AbortSignal) {
      const selected = await base.readProject(value, signal);
      if (mutation === "block") return { ...selected, block: { ...selected.block, hash: "B".repeat(32) } };
      if (mutation === "transport") return { ...selected, transport_source: "EXPLICIT_TESTNET_HTTP_READBACK" as const };
      const snapshots = structuredClone(selected.snapshots);
      object((object(snapshots[0]).purchases as unknown[])[0]).request_hash = "ab".repeat(32);
      return { ...selected, snapshots };
    } };
    await assert.rejects(readVerifiedProject(reader, input(f)), /PROJECT_EVIDENCE_(TERMINAL_RECORD|STALE_BLOCK|TRANSPORT)_MISMATCH|PROJECT_EVIDENCE_STALE_BLOCK/u);
  }
});

test("zero reported spend with an absent unknown attempt is unavailable cost evidence, not failed payment", async () => {
  const f = (await ownerFixture()).f;
  f.snapshot.purchases = []; f.snapshot.provisioning = []; f.snapshot.capsule.request_ids = []; f.snapshot.capsule.spent = "0";
  const rpc = evidenceTransport(f, "2.14.0", method => method === "tx_status" ? { error: { cause: { name: "UNKNOWN_TRANSACTION" } } } : undefined);
  const result = await readVerifiedProject(createTestnetReader(target, rpc.transport), input(f));
  assert.equal(result.report.financials?.spent, "0"); assert.equal(result.unverified_requests.length, 1);
  assert.deepEqual(result.outcome.receipts, []); assert.equal(result.outcome.runs[0].cost_fact, null);
});
