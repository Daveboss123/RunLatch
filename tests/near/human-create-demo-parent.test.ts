import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { demoKeyRoles } from "../../scripts/setup/human-demo-keys.ts";
import { encodeBase58_32 } from "../../scripts/near/base58.ts";
import { parsePublicDemoKeys, observeParent, claimParentFaucet, faucetUrl } from "../../scripts/setup/human-create-demo-parent.ts";

function bundle() {
  return { source: "HUMAN_REPORTED_PUBLIC_KEY_RECORDS_NOT_AGENT_CREDENTIAL_VERIFICATION", keys: demoKeyRoles.map((role, i) => {
    const key = `ed25519:${encodeBase58_32(Buffer.alloc(32, i + 1))}`;
    return { ...role, public_key: key, credential_target: `${role.account_id}:${key}.near-testnet-${role.account_id}`, status: "STORED_VERIFIED" };
  }) };
}
test("five public records bind exact roles/accounts/key targets, never store claims as authentication", () => {
  const data = bundle(); assert.equal(parsePublicDemoKeys(data).length, 5);
  data.keys[4].public_key = data.keys[3].public_key;
  data.keys[4].credential_target = data.keys[3].credential_target;
  assert.throws(() => parsePublicDemoKeys(data), /PUBLIC_KEYS_NOT_DISTINCT/u);
  const changed = bundle(); changed.keys[0].account_id = "other.testnet";
  assert.throws(() => parsePublicDemoKeys(changed));
});
test("read-only absent parent is not success/failure/permission to POST; network mismatches stop", async () => {
  const hash = encodeBase58_32(Buffer.alloc(32, 10)), calls: string[] = [];
  const transport = async (url: string, input: RequestInit) => {
    calls.push(url); const request = JSON.parse(String(input.body));
    const reply = request.method === "status" ? { result: { chain_id: "testnet" } }
      : request.method === "block" ? { result: { header: { hash } } } : { error: { cause: { name: "UNKNOWN_ACCOUNT" } } };
    return new Response(JSON.stringify(reply));
  };
  const result = await observeParent(bundle().keys[0].public_key, transport);
  assert.equal(result.status, "PARENT_ABSENT"); assert.equal(calls.length, 3);
  assert.equal(calls.includes(faucetUrl), false);
  await assert.rejects(observeParent(bundle().keys[0].public_key, async () => new Response('{"result":{"chain_id":"mainnet"}}')), /TESTNET_RPC_REQUIRED/u);
});
test("parent readback requires exact key, one full-access entry and same finalized block", async () => {
  const publicKey = bundle().keys[0].public_key, hash = encodeBase58_32(Buffer.alloc(32, 11));
  let extraKey = false;
  const transport = async (_url: string, input: RequestInit) => {
    const request = JSON.parse(String(input.body));
    let result: unknown;
    if (request.method === "status") result = { chain_id: "testnet" };
    else if (request.method === "block") result = { header: { hash } };
    else if (request.params.request_type === "view_account") result = { amount: "10000000000000000000000000", block_hash: hash };
    else if (request.params.request_type === "view_access_key") result = { permission: "FullAccess", block_hash: hash };
    else result = { keys: Array(extraKey ? 2 : 1).fill({ public_key: publicKey, access_key: { permission: "FullAccess" } }), block_hash: hash };
    return new Response(JSON.stringify({ result }));
  };
  assert.equal((await observeParent(publicKey, transport)).status, "PARENT_ACCOUNT_OBSERVED");
  extraKey = true; await assert.rejects(observeParent(publicKey, transport), /UNEXPECTED_PARENT_KEYS/u);
});
test("one exclusive synced public faucet marker survives errors and prevents another claim", async () => {
  const base = process.platform === "win32" ? join(homedir(), "AppData/Local/Temp/opencode") : tmpdir();
  const directory = await mkdtemp(join(base, "runlatch-parent-faucet-")), key = bundle().keys[0].public_key;
  const body = await claimParentFaucet(directory, key);
  assert.deepEqual(body, { newAccountId: "runlatch-demo-1108.testnet", newAccountPublicKey: key });
  await assert.rejects(claimParentFaucet(directory, key), { code: "EEXIST" });
  const saved = JSON.parse(await readFile(join(directory, "parent-faucet-attempt.json"), "utf8"));
  assert.equal(saved.endpoint, faucetUrl); assert.equal(saved.body.newAccountPublicKey, key);
  assert.equal(JSON.stringify(saved).includes("private_key"), false);
});
test("noninteractive command cannot enter the faucet flow or read human credentials", async () => {
  const script = fileURLToPath(new URL("../../scripts/setup/human-create-demo-parent.ts", import.meta.url));
  const result = spawnSync(process.execPath, [script], { encoding: "utf8", timeout: 5000 });
  assert.equal(result.status, 1); assert.equal(result.stdout, "");
  assert.match(result.stderr, /PARENT_SETUP_STOPPED/u);
  const source = await readFile(script, "utf8");
  assert.doesNotMatch(source, /createPrivateKey|CredRead|storeGeneratedDemoKey|sign\(|Set-ExecutionPolicy/u);
  assert.match(source, /redirect: "error"/u);
  assert.match(source, /claimParentFaucet\(local, owner.public_key\)/u);
});
