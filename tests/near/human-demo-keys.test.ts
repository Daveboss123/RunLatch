import test from "node:test";
import assert from "node:assert/strict";
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { demoKeyRoles, prepareGeneratedDemoKey, probeHumanCredentialStore } from "../../scripts/setup/human-demo-keys.ts";
import { encodeBase58_32 } from "../../scripts/near/base58.ts";

test("four distinct accounts and five fixed roles, with separate agent recovery", () => {
  assert.equal(demoKeyRoles.length, 5);
  assert.equal(new Set(demoKeyRoles.map(r => r.account_id)).size, 4);
  assert.equal(demoKeyRoles[3].role, "agent_recovery"); assert.equal(demoKeyRoles[4].role, "agent_restricted");
  assert.throws(() => prepareGeneratedDemoKey({ ...demoKeyRoles[0] }), /KEY_ROLE_INVALID/u);
});

test("ephemeral NEAR representation matches Node Ed25519 public key/signature; public record contains no private data", () => {
  const prepared = prepareGeneratedDemoKey(demoKeyRoles[0]);
  try {
    const data = JSON.parse(prepared.input.toString("utf8"));
    const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let n = 0n;
    for (const c of data.private_key.slice(8)) n = n * 58n + BigInt(alphabet.indexOf(c));
    const raw = Buffer.alloc(64);
    for (let i = 63; i >= 0; i--) { raw[i] = Number(n & 255n); n >>= 8n; }
    const privateKey = createPrivateKey({ key: { kty: "OKP", crv: "Ed25519", d: raw.subarray(0, 32).toString("base64url"), x: raw.subarray(32).toString("base64url") }, format: "jwk" });
    const jwk = createPublicKey(privateKey).export({ format: "jwk" });
    assert.equal(`ed25519:${encodeBase58_32(Buffer.from(jwk.x!, "base64url"))}`, data.public_key);
    assert.equal(verify(null, Buffer.from("ephemeral wire check"), createPublicKey(privateKey), sign(null, Buffer.from("ephemeral wire check"), privateKey)), true);
    assert.deepEqual(Object.keys(prepared.publicRecord), ["role", "account_id", "public_key", "credential_target"]);
    assert.equal(JSON.stringify(prepared.publicRecord).includes(data.private_key), false);
    raw.fill(0);
  } finally { prepared.input.fill(0); }
});

test("default command refuses agent/noninteractive execution before any key generation", () => {
  const script = fileURLToPath(new URL("../../scripts/setup/human-demo-keys.ts", import.meta.url));
  const result = spawnSync(process.execPath, [script], { encoding: "utf8", timeout: 5000 });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /KEY_SETUP_STOPPED_NO_FALLBACK/u);
  assert.doesNotMatch(result.stderr, /ed25519:/u);
});

test("native storage has no key-file/network/policy fallback or human-key delete path", async () => {
  const source = await readFile("scripts/setup/human-credential-store.ts", "utf8");
  assert.doesNotMatch(source, /Set-ExecutionPolicy|ExecutionPolicy Bypass|Invoke-WebRequest|WriteAll|Out-File|Set-Content|save-to-legacy|child_process|fetch\(/u);
  assert.match(source, /Persist: 2/u);
  assert.match(source, /RunLatch\.storage-probe\./u);
  assert.match(source, /STORE_TARGET_EXISTS/u);
  assert.match(source, /STORE_UNAVAILABLE_NO_FALLBACK/u);
  assert.match(source, /STORE_TOOL_CHANGED/u);
  assert.match(source, /38c7361513d2d26716b5da8d4e0b78bfe6500f51e0e87f7fefacc362f1e198cf/u);
});

test("native Windows secure-store probe uses and deletes only a nonsensitive new target", {
  skip: process.platform !== "win32" || !existsSync(".tools/human-credential-store-3.3.7/node_modules/@koromix/koffi-win32-x64/win32_x64/koffi.node"),
}, () => {
  assert.deepEqual(probeHumanCredentialStore(), { status: "STORE_READY_NONSECRET_PROBE", human_keys_created: false, network_calls: 0 });
});
