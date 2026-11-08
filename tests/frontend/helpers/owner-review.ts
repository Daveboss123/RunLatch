/** Synthetic schema2 owner/outcome views, no contract execution or public data. */
import { evidenceFixture, evidenceTransport, target } from "./testnet-evidence.ts";
import { setupFixture } from "./setup-review.ts";
import { resourceCriteriaHash, validateResourceFixture } from "../../../src/lib/validation/resource.ts";
import type { OwnerContext } from "../../../src/lib/near/owner-review.ts";

export async function ownerFixture(state = "SETTLED") {
  const f = await evidenceFixture(state), s = setupFixture();
  const policy = { ...s.policy, validation_spec_hash: await resourceCriteriaHash() };
  const project = { ...s.project, allocated_authority: "300", capsule_ids: ["work"] };
  const snapshot = { ...f.snapshot, project, capsule: { ...f.snapshot.capsule, policy, storage_credit: "262144", revoked_at_ns: null as string | null,
    refund_attempts: 0, owner_refund: null } };
  f.snapshot = snapshot;
  const artifact = new TextEncoder().encode(JSON.stringify({ fixture_version: 1, project_id: policy.project_id, resource_key: "booking-database",
    fixture_provider_id: "database-fixture", provisioning_status: "PROVISIONED", health_status: 200, https_fixture: true, route: "/health", health_body: "ok", observed_at_ns: "20" }));
  const report = await validateResourceFixture(artifact, { project_id: policy.project_id, resource_key: "booking-database" }, "21");
  const common = { signer_id: target.operator_id, public_key: s.actions.project.public_key, gas: "100000000000000" };
  const p = f.snapshot.purchases[0];
  const actions = {
    project: { ...common, method: "set_project_status", args: { project_id: project.input.project_id, expected_revision: "1", status: "PAUSED" } },
    revision: { ...common, method: "advance_project_revision", args: { project_id: project.input.project_id, expected_revision: "1" } },
    provider: { ...common, method: "set_provider_status", args: { provider_id: f.provider.provider_id, active: false } },
    pause: { ...common, method: "set_capsule_paused", args: { capsule_id: "work", paused: true } },
    revoke: { ...common, method: "revoke_capsule", args: { capsule_id: "work" } },
    close: { ...common, method: "close_capsule", args: { capsule_id: "work" } },
    reject: { ...common, method: "reject_purchase", args: { capsule_id: "work", request_id: "database" } },
    cancel: { ...common, method: "cancel_purchase", args: { capsule_id: "work", request_id: "database" } },
    provisioning: { ...common, method: "record_provisioning", args: { capsule_id: "work", request_id: "database", expected_request_hash: p.request_hash,
      expected_previous_record_hash: null as string | null, evidence: { status: "PROVISIONED", trust_class: "DEMO_FIXTURE", source_id: "database-fixture",
        observed_at_ns: "20", artifact_hash: report.artifact_hash, evidence_hash: report.evidence_hash } } },
    check: { ...common, method: "record_task_check", args: { capsule_id: "work", request_id: "database", expected_request_hash: p.request_hash, expected_policy_hash: p.policy_hash, report } },
    acceptance: { ...common, method: "record_human_acceptance", args: { capsule_id: "work", expected_outcome_hash: "07".repeat(32),
      expected_evidence_snapshot_hash: snapshot.evidence_snapshot_hash, decision: "ACCEPTED" } },
  };
  const context: OwnerContext = { block: f.context.block, signer_access: { nonce: 7, permission: "FullAccess" }, project, provider: null, snapshot,
    transport_source: "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE" };
  const task = { capsule_id: "work", request_id: "database", request_hash: p.request_hash, policy_hash: p.policy_hash, report,
    attested_by: target.operator_id, recorded_at_ns: "22", outcome_hash: actions.acceptance.args.expected_outcome_hash,
    source: "OWNER_ATTESTED_LOCAL_FIXTURE_CHECK_NOT_EXTERNAL_TRUTH" };
  return { f, snapshot, context, artifact, actions, report, task };
}
export function ownerTransport(data: Awaited<ReturnType<typeof ownerFixture>>, change?: (params: Record<string, unknown>, result: unknown) => unknown) {
  const base = evidenceTransport(data.f), calls: { method: string; params: Record<string, unknown> }[] = [];
  const transport: typeof fetch = async (url, options) => {
    const r = JSON.parse(String(options?.body)); calls.push(r); let result: unknown;
    if (r.method === "query" && r.params.request_type === "view_access_key") result = { nonce: 7, permission: "FullAccess",
      block_hash: data.context.block.hash, block_height: data.context.block.height };
    else result = (await (await base.transport(url, options)).json()).result;
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: r.id, result: change ? change(r.params, result) : result }), { headers: { "content-type": "application/json" } });
  };
  return { calls, transport };
}
