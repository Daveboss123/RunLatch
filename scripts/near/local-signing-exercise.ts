/** EPHEMERAL LOCAL TEST SIGNER ONLY. No supplied secret, environment/file read, account or broadcaster.
 * This tests the admitted codec inside the offline one-attempt seam, not a public testnet signer.
 */
import { generateKeyPairSync } from "node:crypto";
import { Buffer } from "node:buffer";
import { fail } from "../../src/lib/near/records.ts";
import { encodeBase58_32 } from "./base58.ts";
import { createLocalReviewSigner } from "./local-review-signer.ts";

export function createLocalSigningExercise() {
  // No import/export API for private keys. This key never belongs to a public account or owner/provider.
  const key = generateKeyPairSync("ed25519"), jwk = key.publicKey.export({ format: "jwk" });
  if (jwk.crv !== "Ed25519") return fail("LOCAL_SIGNING_KEY_TYPE");
  const x = typeof jwk.x === "string" ? jwk.x : fail("LOCAL_SIGNING_KEY_TYPE");
  const publicKey = `ed25519:${encodeBase58_32(Buffer.from(x, "base64url"))}`;
  return Object.freeze({ source: "EPHEMERAL_LOCAL_SIGNING_EXERCISE" as const, public_key: publicKey, public_signing_enabled: false as const,
    ...createLocalReviewSigner(publicKey, () => key.privateKey) });
}
