/** Synthetic setup views only. No private key, signer, public account or network call. */
import { target, refs } from "./testnet-evidence.ts";
import { scope } from "./action-review.ts";

export function setupFixture() {
  const project = { input: { project_id: "client-work", organisation_id: "northstar", client_ref: "acme-demo", budget_ceiling: "300",
    expires_at_ns: "100000000030", outcome_definition_hash: "01".repeat(32) }, owner_id: target.operator_id, revision: "1", status: "ACTIVE",
    allocated_authority: "0", capsule_ids: [] as string[], created_at_ns: "1", updated_at_ns: "1" };
  const provider = { provider_id: "database-fixture", publisher_id: "publisher.testnet", recipient_id: "publisher.testnet", active: true, quote_count: 0 };
  const policy = { project_id: project.input.project_id, project_revision: "1", task_id: "website-database", workflow_id: "website-resource-fixture-v1",
    agent_id: scope.agent_id, agent_public_key: scope.public_key, budget: "300", per_purchase_limit: "50", per_commitment_limit: "300",
    recurring_policy: "REQUIRE_APPROVAL", allowed_provider_ids: [provider.provider_id], allowed_service_ids: ["database-plan"], allowed_categories: ["database"],
    max_quantity: 1, approval_threshold: null as string | null, expires_at_ns: "100000000000", validation_spec_hash: "02".repeat(32) };
  const quote = { quote_id: "database-quote", provider_id: provider.provider_id, recipient_id: provider.recipient_id, service_id: "database-plan",
    category: "database", resource_key: "booking-database", quantity: 1, price: "50", asset: "near-native" as const, recurring: false,
    expires_at_ns: "90000000000", previous_quote_id: null as string | null, commercial_terms: null };
  const common = { signer_id: target.operator_id, public_key: scope.recovery_public_key, gas: "100000000000000" };
  const actions = {
    project: { ...common, method: "create_project", args: { project: project.input } },
    provider: { ...common, method: "register_provider", args: { provider_id: provider.provider_id, publisher_id: provider.publisher_id, recipient_id: provider.recipient_id } },
    capsule: { ...common, method: "create_capsule", args: { capsule_id: "work", policy, storage_credit: "262144" } },
    quote: { ...common, signer_id: provider.publisher_id, method: "publish_quote", args: { quote } },
  };
  const context = { block: { hash: refs.finalBlock, height: 30, timestamp_ns: "30" },
    storage: { project_credit: "8192", capsule_credit: "262144", provider_credit: "4096", quote_credit: "8192" },
    signer_access: { nonce: 7, permission: "FullAccess" }, existing_record: null, project, providers: [provider], previous_quote: null,
    transport_source: "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE" as const };
  return { actions, project, provider, policy, quote, context };
}
export function setupTransport(f: ReturnType<typeof setupFixture>, change?: (params: Record<string, unknown>, value: unknown) => unknown) {
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  const transport: typeof fetch = async (_url, options) => {
    const r = JSON.parse(String(options?.body)); calls.push(r); let value: unknown;
    if (r.method === "status") value = { chain_id: "testnet", sync_info: { syncing: false }, version: { version: "2.14.0" } };
    else if (r.method === "block") value = { header: { hash: f.context.block.hash, height: f.context.block.height, timestamp_nanosec: f.context.block.timestamp_ns } };
    else if (r.method === "query") {
      const p = r.params, args = p.args_base64 ? JSON.parse(Buffer.from(p.args_base64, "base64").toString("utf8")) : {};
      let result: object;
      if (p.request_type === "view_account") result = { code_hash: target.expected_code_hash };
      else if (p.request_type === "view_access_key") result = f.context.signer_access;
      else if (p.request_type === "call_function") {
        const values: Record<string, unknown> = { get_operator: target.operator_id, get_schema_version: 2, get_network_tag: "testnet",
          get_storage_requirements: { ...f.context.storage, scope: "CONSERVATIVE_PREPAID_STATE_LIMITS_NOT_MEASURED_GAS" },
          get_project: args.project_id === f.project.input.project_id ? f.project : null,
          get_capsule: null, get_provider: args.provider_id === f.provider.provider_id ? f.provider : null, get_quote: null };
        if (!Object.hasOwn(values, p.method_name)) throw new Error("UNEXPECTED_VIEW");
        result = { result: [...Buffer.from(JSON.stringify(values[p.method_name]))] };
      } else throw new Error("UNEXPECTED_QUERY");
      value = { ...result, block_hash: f.context.block.hash, block_height: f.context.block.height };
    } else throw new Error("UNEXPECTED_WRITE_OR_DISPATCH");
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: r.id, result: change ? change(r.params, value) : value }),
      { headers: { "content-type": "application/json" } });
  };
  return { calls, transport };
}
