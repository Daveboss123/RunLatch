/** Fixed human-only contract surface. Never agent authority or arbitrary RPC dispatch. */
export const HUMAN_WORKSPACE_METHODS = ["create_project", "register_provider", "publish_quote", "create_capsule",
  "approve_purchase", "record_provisioning", "record_task_check", "record_human_acceptance",
  "set_project_status", "advance_project_revision", "set_provider_status", "set_capsule_paused",
  "revoke_capsule", "reject_purchase", "cancel_purchase", "close_capsule"] as const;
export type HumanWorkspaceMethod = typeof HUMAN_WORKSPACE_METHODS[number];
export const OWNER_CONTROL_METHODS: readonly HumanWorkspaceMethod[] = HUMAN_WORKSPACE_METHODS.slice(8);
export const HUMAN_METHOD_LABELS: Readonly<Record<HumanWorkspaceMethod, string>> = {
  create_project: "Create project", register_provider: "Register provider", publish_quote: "Publish canonical quote", create_capsule: "Create capsule",
  approve_purchase: "Review exact purchase approval", record_provisioning: "Record fixture provisioning",
  record_task_check: "Record objective task check", record_human_acceptance: "Record human acceptance",
  set_project_status: "Change project status", advance_project_revision: "Advance project revision", set_provider_status: "Change provider status",
  set_capsule_paused: "Pause or resume Capsule", revoke_capsule: "Revoke Capsule", reject_purchase: "Reject pending approval",
  cancel_purchase: "Cancel pending approval", close_capsule: "Close Capsule and review unused return",
};
export const OWNER_EFFECTS: Readonly<Record<string, string>> = {
  set_project_status: "A status change advances the project revision. Old Capsules and approvals do not regain authority. Scheduled transfers remain unchanged.",
  advance_project_revision: "Invalidates older project mandates. It does not edit policy, release reservations or grant new funding.",
  set_provider_status: "Changes provider availability for future authorization. Published terms and existing transfers remain unchanged.",
  set_capsule_paused: "Pauses or resumes eligible, unexpired authority. It cannot revive a stale revision or recall a scheduled transfer.",
  revoke_capsule: "Irreversibly stops future Capsule authorization. Pending transfers, records and future commitments remain intact.",
  reject_purchase: "Rejects only an approval-pending request, which held no funds. It cannot cancel a scheduled transfer.",
  cancel_purchase: "Cancels only an approval-pending request, which held no funds. No payment reservation is released.",
  close_capsule: "May return only unused funding to the stored owner after authority is inactive and no settlement is pending. Future commitments and history storage stay retained. This is not a task-quality refund.",
};
