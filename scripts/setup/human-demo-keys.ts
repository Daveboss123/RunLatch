/** Human-only local key generation. No account creation, signatures, files or network. */
import { generateKeyPairSync } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { encodeBase58_32 } from "../near/base58.ts";
import { probeHumanCredentialStore, storeGeneratedDemoKey } from "./human-credential-store.ts";
export { probeHumanCredentialStore } from "./human-credential-store.ts";

export const demoKeyRoles = Object.freeze([
  { role: "operator", account_id: "runlatch-demo-1108.testnet" },
  { role: "contract", account_id: "gate.runlatch-demo-1108.testnet" },
  { role: "provider", account_id: "db.runlatch-demo-1108.testnet" },
  { role: "agent_recovery", account_id: "agent.runlatch-demo-1108.testnet" },
  { role: "agent_restricted", account_id: "agent.runlatch-demo-1108.testnet" },
].map(value => Object.freeze(value)));

// Only the fixed Ed25519 seed+public representation used by NEAR, never a general secret codec.
function encodeSecret64(bytes: Uint8Array) {
  if (bytes.length !== 64) throw Error("KEY_FORMAT_INVALID");
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = 0n, leading = 0, result = "";
  for (const byte of bytes) n = (n << 8n) | BigInt(byte);
  for (const byte of bytes) { if (byte !== 0) break; leading++; }
  while (n > 0n) { result = alphabet[Number(n % 58n)] + result; n /= 58n; }
  return "1".repeat(leading) + result;
}

/** Generated in-memory material only; called by the human command or ephemeral tests. */
export function prepareGeneratedDemoKey(role: typeof demoKeyRoles[number]) {
  if (!demoKeyRoles.includes(role)) throw Error("KEY_ROLE_INVALID");
  const pair = generateKeyPairSync("ed25519");
  const privateJwk = pair.privateKey.export({ format: "jwk" });
  if (privateJwk.kty !== "OKP" || privateJwk.crv !== "Ed25519" || typeof privateJwk.d !== "string" || typeof privateJwk.x !== "string") throw Error("KEY_FORMAT_INVALID");
  const seed = Buffer.from(privateJwk.d, "base64url"), publicBytes = Buffer.from(privateJwk.x, "base64url");
  if (seed.length !== 32 || publicBytes.length !== 32) throw Error("KEY_FORMAT_INVALID");
  const secretBytes = Buffer.concat([seed, publicBytes]);
  try {
    const publicKey = `ed25519:${encodeBase58_32(publicBytes)}`;
    const user = `${role.account_id}:${publicKey}`;
    const publicRecord = Object.freeze({ role: role.role, account_id: role.account_id, public_key: publicKey,
      credential_target: `${user}.near-testnet-${role.account_id}` });
    const input = Buffer.from(JSON.stringify({ account_id: role.account_id, public_key: publicKey, private_key: `ed25519:${encodeSecret64(secretBytes)}` }), "utf8");
    return { publicRecord, input };
  } finally { seed.fill(0); secretBytes.fill(0); privateJwk.d = undefined; }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--probe") { console.log(JSON.stringify(probeHumanCredentialStore())); return; }
  if (args.length) throw Error("NO_KEY_ARGUMENTS_ACCEPTED");
  if (process.platform !== "win32") throw Error("WINDOWS_REQUIRED");
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw Error("HUMAN_TERMINAL_REQUIRED");
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log("LOCAL ONLY: five keys for the four proposed testnet demo accounts.");
    console.log("Stored in this Windows user's Credential Manager. No private-key files, network calls or signatures.");
    for (const role of demoKeyRoles) console.log(`${role.role}: ${role.account_id}`);
    const answer = await terminal.question("Type CREATE LOCAL DEMO KEYS to approve this local generation (otherwise cancel): ");
    if (answer !== "CREATE LOCAL DEMO KEYS") { console.log("CANCELLED_NO_KEYS_CREATED"); return; }
    probeHumanCredentialStore(); // Before generating any key. No fallback on failure.
    for (const role of demoKeyRoles) {
      const prepared = prepareGeneratedDemoKey(role);
      // Retain public identity before a possibly uncertain store write. Never print the input buffer.
      console.log(JSON.stringify({ ...prepared.publicRecord, status: "STORE_ATTEMPT" }));
      try {
        storeGeneratedDemoKey(prepared.input, prepared.publicRecord);
        console.log(JSON.stringify({ ...prepared.publicRecord, status: "STORED_VERIFIED" }));
      } finally { prepared.input.fill(0); }
    }
    console.log("LOCAL_KEYS_READY: send only the five STORED_VERIFIED public records. No accounts created or signed.");
  } finally { terminal.close(); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(() => { console.error("KEY_SETUP_STOPPED_NO_FALLBACK: retain any public STORE_ATTEMPT records; do not rerun or send secrets."); process.exitCode = 1; });
}
