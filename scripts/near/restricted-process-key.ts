/** Explicit Node-only process injection. No default env read, file/keystore/seed/CLI input or network.
 * Loading proves public-key consistency only, NOT on-chain restriction or human signing consent.
 */
import { createPrivateKey, createPublicKey, type KeyObject } from "node:crypto";
import { Buffer } from "node:buffer";
import { types } from "node:util";
import { parseTestnetTarget, type TestnetTarget } from "../../src/lib/near/testnet-target.ts";
import { parseRestrictedAgentScope, type RestrictedAgentScope } from "../../src/lib/near/agent-access.ts";
import { fail } from "../../src/lib/near/records.ts";
import { canonicalReviewContent } from "../../src/lib/near/review-content.ts";
import { encodeBase58_32 } from "./base58.ts";
import { createLocalReviewSigner } from "./local-review-signer.ts";

const VARIABLE = "RUNLATCH_AGENT_PRIVATE_KEY";
export interface RestrictedProcessKey {
  readonly source: "EXPLICIT_RESTRICTED_PROCESS_KEY_INJECTION";
  readonly target: TestnetTarget; readonly scope: RestrictedAgentScope; readonly public_key: string;
  readonly public_signing_enabled: false;
  readonly limitation: string;
}
interface State { key: KeyObject | null; signer: ReturnType<typeof createLocalReviewSigner> | null }
const states = new WeakMap<RestrictedProcessKey, State>();
const loaded = new Set<string>(); // Permanent for this process, including after disposal; bounded below.

export function consumeRestrictedProcessKey(inputTarget: unknown, inputScope: unknown, environment: unknown): RestrictedProcessKey {
  // Validate PUBLIC config before accessing the sole explicit injection slot. Never enumerate environment values.
  const target = parseTestnetTarget(inputTarget), scope = parseRestrictedAgentScope(inputScope, target);
  const identity = JSON.stringify(["testnet", scope.agent_id, scope.public_key]);
  if (loaded.has(identity)) return fail("PROCESS_KEY_ALREADY_LOADED");
  if (loaded.size >= 64) return fail("PROCESS_KEY_LOAD_LIMIT");
  if (environment === null || typeof environment !== "object" || Array.isArray(environment) || types.isProxy(environment)) return fail("UNSAFE_PROCESS_KEY_ENVIRONMENT");
  let value: unknown;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(environment, VARIABLE);
    if (!descriptor) return fail("PROCESS_KEY_INJECTION_MISSING");
    if (descriptor.get || descriptor.set || !descriptor.configurable || !descriptor.writable) return fail("UNSAFE_PROCESS_KEY_ENVIRONMENT");
    value = descriptor.value;
    // Synchronous removal BEFORE parsing/crypto/async work; errors never restore or reread the secret.
    if (!Reflect.deleteProperty(environment, VARIABLE) || Object.getOwnPropertyDescriptor(environment, VARIABLE)) return fail("PROCESS_KEY_REMOVAL_FAILED");
  } catch { return fail("PROCESS_KEY_INJECTION_UNAVAILABLE"); }
  let bytes: Buffer | null = null, canonical: Buffer | null = null;
  try {
    // Exactly one canonical base64url encoding of Node's unencrypted Ed25519 PKCS#8 DER(48bytes).
    // No hand-written ASN.1, raw NEAR secret/seed, PEM, JWK, passphrase or format auto-detection.
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]{64}$/u.test(value)) return fail("PROCESS_KEY_FORMAT_INVALID");
    bytes = Buffer.from(value, "base64url"); value = undefined;
    if (bytes.byteLength !== 48 || bytes.toString("base64url").length !== 64) return fail("PROCESS_KEY_FORMAT_INVALID");
    const key = createPrivateKey({ key: bytes, format: "der", type: "pkcs8" });
    if (key.type !== "private" || key.asymmetricKeyType !== "ed25519") return fail("PROCESS_KEY_FORMAT_INVALID");
    canonical = key.export({ format: "der", type: "pkcs8" });
    if (!canonical.equals(bytes)) return fail("PROCESS_KEY_FORMAT_INVALID");
    const jwk = createPublicKey(key).export({ format: "jwk" });
    if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || typeof jwk.x !== "string") return fail("PROCESS_KEY_FORMAT_INVALID");
    const publicKey = `ed25519:${encodeBase58_32(Buffer.from(jwk.x, "base64url"))}`;
    if (publicKey !== scope.public_key) return fail("PROCESS_KEY_PUBLIC_MISMATCH");
    const handle: RestrictedProcessKey = Object.freeze({ source: "EXPLICIT_RESTRICTED_PROCESS_KEY_INJECTION", target, scope, public_key: publicKey,
      public_signing_enabled: false, limitation: "Key consistency only; no chain restriction/consent proof. Local signing requires issued review; public path is not admitted. Disposal drops references, not guaranteed memory erasure." });
    loaded.add(identity);
    states.set(handle, { key, signer: null });
    return handle;
  } catch {
    // Do not expose crypto exceptions, input fragments, stacks/causes or caller-supplied diagnostic values.
    return fail("PROCESS_KEY_INVALID_OR_MISMATCHED");
  } finally { bytes?.fill(0); canonical?.fill(0); value = undefined; }
}
function state(handle: RestrictedProcessKey) {
  return states.get(handle) ?? fail("UNISSUED_PROCESS_KEY_HANDLE");
}
export function disposeRestrictedProcessKey(handle: RestrictedProcessKey) {
  const stored = state(handle); stored.key = null; stored.signer = null;
  // Existing adapter closures also consult this state. Disposing never resets request/key markers.
}
export function createInjectedLocalSigningExercise(handle: RestrictedProcessKey) {
  const stored = state(handle);
  if (!stored.key) return fail("PROCESS_KEY_DISPOSED");
  // One shared consumed-request set per handle, even when several adapters are requested.
  stored.signer ??= createLocalReviewSigner(handle.public_key, () => stored.key ?? fail("PROCESS_KEY_DISPOSED"), review => {
    const access = review.access ?? fail("PROCESS_KEY_SCOPE_REVIEW_MISMATCH"), scope = handle.scope;
    if (canonicalReviewContent(review.target) !== canonicalReviewContent(handle.target) || review.action.signer_id !== scope.agent_id
      || access.agent_id !== scope.agent_id || access.public_key !== scope.public_key || access.recovery_public_key !== scope.recovery_public_key
      || access.allowance_cap !== scope.max_allowance) return fail("PROCESS_KEY_SCOPE_REVIEW_MISMATCH");
  });
  return Object.freeze({ source: "INJECTED_PROCESS_KEY_LOCAL_SIGNING_EXERCISE" as const, public_key: handle.public_key,
    public_signing_enabled: false as const, ...stored.signer });
}
