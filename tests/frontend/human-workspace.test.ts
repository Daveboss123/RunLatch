/** Synthetic read-only composition only. No wallet, registered public account or signing. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { HUMAN_WORKSPACE_METHODS, parseHumanWorkspaceAction, readHumanWorkspaceReview, exportHumanWorkspaceReview } from "../../src/lib/near/human-workspace.ts";
import { createTestnetReader } from "../../src/lib/near/testnet-rpc.ts";
import { target } from "./helpers/testnet-evidence.ts";
import { setupFixture, setupTransport } from "./helpers/setup-review.ts";
import { ownerFixture, ownerTransport } from "./helpers/owner-review.ts";

test("human workspace routes all four setup calls through the existing pinned reader; derived deposits stay exact", async () => {
  const f = setupFixture(), actions = [
    { ...f.actions.project, args: { project: { ...f.project.input, project_id: "new-project" } } },
    { ...f.actions.provider, args: { ...f.actions.provider.args, provider_id: "new-provider" } }, f.actions.capsule, f.actions.quote];
  for (const [i, action] of actions.entries()) {
    const rpc = setupTransport(f), r = await readHumanWorkspaceReview(createTestnetReader(target, rpc.transport), action);
    assert.equal(r.kind, "setup"); assert.equal(r.review.call.attached_deposit, ["8192", "4096", "262444", "8192"][i]);
    assert.equal(r.review.transport_source, "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE"); assert.equal(r.review.grants_payment_authority, false);
    assert.ok(rpc.calls.every(c => ["status", "block", "query"].includes(c.method)));
    assert.ok(rpc.calls.filter(c => c.method === "query").every(c => c.params.block_id === f.context.block.hash));
  }
});

test("provisioning and exact artifact check use the existing owner reader and never send artifact bytes", async () => {
  const f = await ownerFixture();
  for (const action of [f.actions.provisioning, f.actions.check]) {
    const rpc = ownerTransport(f), reader = createTestnetReader(target, rpc.transport);
    const r = await readHumanWorkspaceReview(reader, action, action.method === "record_task_check" ? { artifact: f.artifact } : undefined);
    assert.equal(r.kind, "owner"); assert.equal(r.review.call.attached_deposit, "1");
    assert.equal(r.review.call.signer_id, target.operator_id); assert.equal(r.review.grants_payment_authority, false);
    assert.ok(!JSON.stringify(rpc.calls).includes("health_body")); assert.ok(rpc.calls.every(c => ["status", "block", "query"].includes(c.method)));
  }
});

test("only the connected human methods are admitted; agent/admin/pay/key/settlement entry cannot be routed", () => {
  assert.equal(HUMAN_WORKSPACE_METHODS.length, 8);
  for (const method of ["submit_purchase", "resolve_purchase", "pay", "set_project_status", "add_key", "close_capsule", "record_validation"])
    assert.throws(() => parseHumanWorkspaceAction({ method }), /HUMAN_WORKSPACE_METHOD_NOT_ADMITTED/u);
});

test("exact approval and acceptance inputs are detached, validated without overwriting identity or money fields", async () => {
  const f = await ownerFixture("APPROVAL_PENDING");
  const approval = { method: "approve_purchase", signer_id: target.operator_id, public_key: f.actions.check.public_key, gas: "100000000000000",
    proposal: f.snapshot.purchases[0].proposal, expected_request_hash: f.snapshot.purchases[0].request_hash };
  assert.equal(parseHumanWorkspaceAction(approval).kind, "approval");
  assert.equal(parseHumanWorkspaceAction(f.actions.acceptance).kind, "owner");
  assert.throws(() => parseHumanWorkspaceAction({ ...approval, gas: 100000000000000 }));
  assert.throws(() => parseHumanWorkspaceAction({ ...f.actions.acceptance, private_key: "PRIVATE_CANARY" }));
  let ran = false;
  assert.throws(() => parseHumanWorkspaceAction({ get method() { ran = true; return "publish_quote"; } })); assert.equal(ran, false);
});

test("cancelled or extraneous-artifact requests fail before any network read; task artifact mismatch fails closed", async () => {
  const f = await ownerFixture(), rpc = ownerTransport(f), reader = createTestnetReader(target, rpc.transport), abort = new AbortController(); abort.abort();
  await assert.rejects(readHumanWorkspaceReview(reader, f.actions.provisioning, undefined, abort.signal), /WORKSPACE_READ_CANCELLED/u);
  await assert.rejects(readHumanWorkspaceReview(reader, f.actions.provisioning, { artifact: f.artifact }), /UNEXPECTED_OWNER_ARTIFACT/u);
  assert.equal(rpc.calls.length, 0);
  await assert.rejects(readHumanWorkspaceReview(reader, f.actions.check, { artifact: null }), /EXACT_LOCAL_TASK_REPORT_MISMATCH/u);
});

test("unsigned export contains exact public terms/strings but no artifact, token, signature or granted authority", async () => {
  const f = await ownerFixture(), rpc = ownerTransport(f), value = await readHumanWorkspaceReview(createTestnetReader(target, rpc.transport), f.actions.check, { artifact: f.artifact });
  const text = exportHumanWorkspaceReview(value), out = JSON.parse(text);
  assert.equal(out.source, "EXPORTED_UNSIGNED_HUMAN_REVIEW_NOT_SIGNING_CONSENT"); assert.equal(out.signing_enabled, false);
  assert.equal(out.grants_payment_authority, false); assert.equal(out.review.call.attached_deposit, "1");
  assert.ok(!text.includes("health_body")); assert.ok(!text.includes("private_key")); assert.ok(!text.includes("signed_bytes")); assert.ok(!("consent" in out));
});

test("production workspace has no signer/injected transport, automatic reads, storage, URL or server-action path", async () => {
  const component = await readFile(new URL("../../src/components/runlatch/testnet-workspace.tsx", import.meta.url), "utf8");
  const workflow = await readFile(new URL("../../src/lib/near/human-workspace.ts", import.meta.url), "utf8");
  assert.ok(!/scripts\/near|restricted-process-key|runner-admission|localStorage|sessionStorage|indexedDB|useSearchParams|signAndSend|wallet:|near-wallet-injected/u.test(component + workflow));
  assert.ok(component.includes("createTestnetReader(target)")); assert.ok(component.includes("controller.current?.abort()"));
  assert.ok(!component.includes('name="')); assert.ok(!component.includes('"use server"')); assert.ok(!component.includes("dangerouslySetInnerHTML"));
});
