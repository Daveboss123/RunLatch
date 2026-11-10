/** Read-only checks for the planned ordinary function-call key. No secrets, signing or key installation. */
import { amount, count, fail, list, object } from "./records.ts";
import { publicKey } from "./testnet-evidence.ts";
import { namedTestnetAccount, parseTestnetTarget, type TestnetTarget } from "./testnet-target.ts";

export interface RestrictedAgentScope {
  readonly agent_id: string; readonly public_key: string; readonly recovery_public_key: string; readonly max_allowance: string;
}
export function parseRestrictedAgentScope(value: unknown, target: TestnetTarget): RestrictedAgentScope {
  const s = object(value, ["agent_id", "public_key", "recovery_public_key", "max_allowance"]);
  const agent = namedTestnetAccount(s.agent_id), key = publicKey(s.public_key), recovery = publicKey(s.recovery_public_key), cap = amount(s.max_allowance);
  if (agent === target.contract_id || agent === target.operator_id || key === recovery || BigInt(cap) === 0n) return fail("INVALID_RESTRICTED_AGENT_SCOPE");
  return Object.freeze({ agent_id: agent, public_key: key, recovery_public_key: recovery, max_allowance: cap });
}
function accessKey(value: unknown) {
  const k = object(value, ["nonce", "permission"]), nonce = count(k.nonce, Number.MAX_SAFE_INTEGER).toString();
  if (k.permission === "FullAccess") return Object.freeze({ nonce, permission: "FullAccess" as const });
  // Gas-key lanes and other permission kinds are deliberately unsupported in this narrow MVP.
  const permission = object(k.permission, ["FunctionCall"]), p = object(permission.FunctionCall, ["allowance", "receiver_id", "method_names"]);
  return Object.freeze({ nonce, permission: Object.freeze({ FunctionCall: Object.freeze({ allowance: amount(p.allowance),
    receiver_id: namedTestnetAccount(p.receiver_id), method_names: Object.freeze(list(p.method_names, 8).map(v => {
      if (typeof v !== "string" || !/^[A-Za-z0-9_]{1,64}$/u.test(v)) return fail("INVALID_ACCESS_KEY_METHOD");
      return v;
    })) }) }) });
}
export function inspectRestrictedAccess(scope: RestrictedAgentScope, target: TestnetTarget, rawKey: unknown, rawList: unknown) {
  target = parseTestnetTarget(target);
  scope = parseRestrictedAgentScope(scope, target);
  const exact = accessKey(rawKey), rows = list(object(rawList).keys, 8).map(value => {
    const r = object(value, ["public_key", "access_key"]);
    return { public_key: publicKey(r.public_key), access_key: accessKey(r.access_key) };
  });
  if (new Set(rows.map(r => r.public_key)).size !== rows.length) return fail("DUPLICATE_AGENT_ACCESS_KEY");
  const listed = rows.find(r => r.public_key === scope.public_key), recovery = rows.find(r => r.public_key === scope.recovery_public_key);
  if (!listed || JSON.stringify(listed.access_key) !== JSON.stringify(exact)) return fail("AGENT_ACCESS_KEY_READBACK_MISMATCH");
  if (exact.permission === "FullAccess") return fail("AGENT_FULL_ACCESS_FORBIDDEN");
  const p = exact.permission.FunctionCall;
  if (p.receiver_id !== target.contract_id || p.method_names.length !== 1 || p.method_names[0] !== "submit_purchase") return fail("AGENT_ACCESS_KEY_SCOPE_MISMATCH");
  if (BigInt(p.allowance) === 0n || BigInt(p.allowance) > BigInt(scope.max_allowance)) return fail("AGENT_ALLOWANCE_OUT_OF_SCOPE");
  if (!recovery || recovery.access_key.permission !== "FullAccess") return fail("AGENT_RECOVERY_ACCESS_NOT_OBSERVED");
  return Object.freeze({ agent_id: scope.agent_id, public_key: scope.public_key, recovery_public_key: scope.recovery_public_key,
    nonce: exact.nonce, allowance: p.allowance, allowance_cap: scope.max_allowance, receiver_id: p.receiver_id,
    method_names: p.method_names, recovery_access_observed: true as const,
    limitation: "RPC-reported ordinary function-call permission and recovery key presence, not proof of human key control or payment authority." });
}

/** Exact pre-install state: one human recovery key, no restricted key or unknown additional authority. */
export function inspectAgentKeyInstallState(scope: RestrictedAgentScope, target: TestnetTarget, rawList: unknown) {
  target = parseTestnetTarget(target); scope = parseRestrictedAgentScope(scope, target);
  const rows = list(object(rawList).keys, 8).map(value => {
    const row = object(value, ["public_key", "access_key"]);
    return Object.freeze({ public_key: publicKey(row.public_key), access_key: accessKey(row.access_key) });
  });
  if (new Set(rows.map(row => row.public_key)).size !== rows.length) return fail("DUPLICATE_AGENT_ACCESS_KEY");
  if (rows.some(row => row.public_key === scope.public_key)) return fail("AGENT_RESTRICTED_KEY_ALREADY_EXISTS");
  if (rows.length !== 1 || rows[0].public_key !== scope.recovery_public_key || rows[0].access_key.permission !== "FullAccess")
    return fail("AGENT_PREINSTALL_AUTHORITY_UNEXPECTED");
  return Object.freeze({ agent_id: scope.agent_id, restricted_public_key: scope.public_key, recovery_public_key: scope.recovery_public_key,
    recovery_nonce: rows[0].access_key.nonce, receiver_id: target.contract_id, method_names: Object.freeze(["submit_purchase"]), allowance: scope.max_allowance,
    limitation: "RPC-reported exact pre-install recovery authority and restricted-key absence. Not human control, signing consent or installed permission." });
}
