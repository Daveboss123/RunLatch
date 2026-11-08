/** Fixed credential-free read endpoints and explicit named-account testnet scope. */
import { account, fail, object, reference } from "./records.ts";

const ENDPOINTS = new Set(["https://rpc.testnet.near.org/", "https://test.rpc.fastnear.com/"]);
export interface TestnetTarget {
  readonly network: "testnet"; readonly rpc_url: string; readonly contract_id: string;
  readonly operator_id: string; readonly expected_code_hash: string;
}
export interface FinalBlock {
  readonly hash: string; readonly height: number; readonly timestamp_ns: string;
}
export function namedTestnetAccount(value: unknown): string {
  const result = account(value);
  if (!result.endsWith(".testnet")) return fail("NAMED_TESTNET_ACCOUNT_REQUIRED");
  return result;
}
export function parseTestnetTarget(value: unknown): TestnetTarget {
  const c = object(value, ["network", "rpc_url", "contract_id", "operator_id", "expected_code_hash"]);
  if (c.network !== "testnet") return fail("TESTNET_ONLY");
  let url: URL;
  try { if (typeof c.rpc_url !== "string" || c.rpc_url.length > 256) return fail("INVALID_TESTNET_RPC"); url = new URL(c.rpc_url); }
  catch { return fail("INVALID_TESTNET_RPC"); }
  if (url.username || url.password || url.search || url.hash || !ENDPOINTS.has(url.href)) return fail("TESTNET_RPC_NOT_ALLOWED");
  const contract = namedTestnetAccount(c.contract_id), operator = namedTestnetAccount(c.operator_id);
  if (contract === operator) return fail("CONTRACT_OPERATOR_ROLE_CONFLICT");
  return Object.freeze({ network: "testnet", rpc_url: url.href, contract_id: contract,
    operator_id: operator, expected_code_hash: reference(c.expected_code_hash) });
}
