/** Generated EPHEMERAL material only, in memory. Never load a real environment/credential file. */
import { generateKeyPairSync } from "node:crypto";
import { Buffer } from "node:buffer";
import { encodeBase58_32 } from "../../../scripts/near/base58.ts";
import { consumeRestrictedProcessKey, createInjectedLocalSigningExercise } from "../../../scripts/near/restricted-process-key.ts";
import { scope } from "../../frontend/helpers/action-review.ts";
import { target } from "../../frontend/helpers/testnet-evidence.ts";

export function processKeyMaterial() {
  const key = generateKeyPairSync("ed25519"), jwk = key.publicKey.export({ format: "jwk" });
  if (typeof jwk.x !== "string") throw new Error("EPHEMERAL_PUBLIC_KEY_UNAVAILABLE");
  const publicKey = `ed25519:${encodeBase58_32(Buffer.from(jwk.x, "base64url"))}`;
  const bytes = key.privateKey.export({ format: "der", type: "pkcs8" });
  const environment = { RUNLATCH_AGENT_PRIVATE_KEY: bytes.toString("base64url") }; bytes.fill(0);
  const keyScope = { ...scope, public_key: publicKey };
  return { key, publicKey, target, keyScope, environment };
}
export function injectedKeyFixture() {
  const material = processKeyMaterial(), handle = consumeRestrictedProcessKey(material.target, material.keyScope, material.environment);
  return { ...material, handle, signer: createInjectedLocalSigningExercise(handle) };
}
