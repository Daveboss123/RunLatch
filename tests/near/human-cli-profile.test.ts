/** Synthetic local config files only. Native Windows renames, no CLI/key store/network/signing. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, stat, utimes } from "node:fs/promises";
import { join, resolve } from "node:path";
import { activateCliProfile, cliProfilePaths, inspectCliProfile, moveCliFileNoReplace, restoreCliProfile, testnetCliProfile } from "../../scripts/setup/human-cli-profile.ts";

const nativeWindows = { skip: process.platform !== "win32" ? "Native Windows File.Move case; not simulated on other platforms" : false };

async function fixture() {
  const dir = resolve(process.env.LOCALAPPDATA ?? ".local", "Temp/opencode", `runlatch-cli-profile-test-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  const original = "Synthetic original settings; no private key or account.\n";
  await writeFile(join(dir, "config.toml"), original, { flag: "wx" });
  return { dir, original, id: randomUUID().replaceAll("-", "") };
}

test("canonical v5 profile has only testnet and no credentials, mainnet, funding or relay fields", () => {
  const path = "C:\\Users\\Fixture's folder\\near-cli\\empty", text = testnetCliProfile(path);
  assert.ok(text.includes('version = "5"')); assert.equal(text.match(/\[network_connection\./gu)?.length, 1);
  assert.ok(text.includes('[network_connection.testnet]')); assert.ok(text.includes('rpc_url = "https://rpc.testnet.near.org/"'));
  assert.equal(JSON.parse(text.split("\n").find(l => l.startsWith("credentials_home_dir"))!.split(" = ")[1]), path);
  assert.ok(!/mainnet|rpc_api_key|private_key|signer|allowance|faucet_url|meta_transaction_relayer/u.test(text));
});

test("unsafe relative/device/UNC/URL/control/traversal paths and substituted profile IDs are refused", () => {
  for (const path of ["relative", "\\\\server\\share", "https://rpc.testnet.near.org", "C:\\x\nsecret", "C:\\x\\..\\other", "C:\\" + "x".repeat(1025)]) assert.throws(() => testnetCliProfile(path));
  for (const id of ["../other", "key", "A".repeat(32), "0".repeat(33)]) assert.throws(() => cliProfilePaths("C:\\fixture", id), /ID_INVALID/u);
});

test("native same-directory move refuses an existing destination and preserves both files", nativeWindows, async () => {
  const f = await fixture(), from = join(f.dir, "from'quote.txt"), to = join(f.dir, "to'quote.txt");
  await writeFile(from, "source fixture", { flag: "wx" }); await writeFile(to, "destination fixture", { flag: "wx" });
  await assert.rejects(moveCliFileNoReplace(from, to), /MOVE_NOT_CONFIRMED/u);
  assert.equal(await readFile(from, "utf8"), "source fixture"); assert.equal(await readFile(to, "utf8"), "destination fixture");
  const fresh = join(f.dir, "new'quote.txt"); await moveCliFileNoReplace(from, fresh);
  assert.equal(await readFile(fresh, "utf8"), "source fixture");
});

test("activation preserves original file identity/bytes and creates the exact public profile/empty legacy directory", nativeWindows, async () => {
  const f = await fixture(), before = await stat(join(f.dir, "config.toml"), { bigint: true }), p = cliProfilePaths(f.dir, f.id);
  const result = await activateCliProfile(f.dir, f.id);
  assert.equal(result.original_contents_read, false); assert.equal(result.signing_enabled, false);
  assert.equal(await readFile(p.preserved, "utf8"), f.original); // Test reads SYNTHETIC bytes; implementation never does.
  assert.equal((await stat(p.preserved, { bigint: true })).ino, before.ino);
  assert.equal(await readFile(p.active, "utf8"), testnetCliProfile(p.legacy));
  const active = await stat(p.active, { bigint: true });
  assert.equal(active.ino.toString(), result.prepared.ino); assert.equal(active.mtimeNs.toString(), result.prepared.mtime_ns);
  // NTFS may tunnel the old destination's birthtime; it must not invalidate stable identity.
  const observed = await inspectCliProfile(f.dir, f.id); assert.equal(observed.status, "ACTIVE_TESTNET_PROFILE"); assert.equal(observed.legacy_directory_empty, true);
  await assert.rejects(activateCliProfile(f.dir), /SWITCH_ALREADY_CLAIMED/u);
});

test("restoration returns the original same file and retains the inactive public profile and every record", nativeWindows, async () => {
  const f = await fixture(), p = cliProfilePaths(f.dir, f.id);
  const activated = await activateCliProfile(f.dir, f.id), restored = await restoreCliProfile(f.dir, f.id);
  assert.equal(restored.status, "ORIGINAL_RESTORED"); assert.equal(await readFile(p.active, "utf8"), f.original);
  assert.equal((await stat(p.active, { bigint: true })).ino.toString(), activated.original.ino);
  assert.equal(await readFile(p.inactive, "utf8"), testnetCliProfile(p.legacy));
  assert.ok(await stat(p.record)); assert.ok(await stat(p.closedMarker));
  await assert.rejects(restoreCliProfile(f.dir, f.id), /CHANGED_OR_INCOMPLETE/u);
});

test("changed user work blocks restoration rather than being read as a known profile or overwritten", nativeWindows, async () => {
  const f = await fixture(), p = cliProfilePaths(f.dir, f.id); await activateCliProfile(f.dir, f.id);
  const edited = testnetCliProfile(p.legacy).replace("RunLatch", "UserEdit");
  await writeFile(p.active, edited); await utimes(p.active, new Date(), new Date(Date.now() + 2000));
  await assert.rejects(restoreCliProfile(f.dir, f.id), /CHANGED_OR_INCOMPLETE/u);
  assert.equal(await readFile(p.active, "utf8"), edited); assert.equal(await readFile(p.preserved, "utf8"), f.original);
  assert.equal((await inspectCliProfile(f.dir, f.id)).status, "CHANGED_OR_INCOMPLETE");
});

test("interrupted second rename retains the original backup/staging/claim and cannot be blindly rerun", nativeWindows, async () => {
  const f = await fixture(), p = cliProfilePaths(f.dir, f.id); let moves = 0;
  await assert.rejects(activateCliProfile(f.dir, f.id, async (from, to) => {
    if (++moves === 2) throw Error("SYNTHETIC_INTERRUPTION"); await moveCliFileNoReplace(from, to);
  }), /SYNTHETIC_INTERRUPTION/u);
  assert.equal(await readFile(p.preserved, "utf8"), f.original); assert.ok(await stat(p.staged)); assert.ok(await stat(p.marker));
  await assert.rejects(activateCliProfile(f.dir), /ORIGINAL_MISSING/u);
  assert.equal((await inspectCliProfile(f.dir, f.id)).status, "CHANGED_OR_INCOMPLETE");
});

test("competing switches get only one exclusive claim; original is preserved once", nativeWindows, async () => {
  const f = await fixture(), otherId = randomUUID().replaceAll("-", "");
  const results = await Promise.allSettled([activateCliProfile(f.dir, f.id), activateCliProfile(f.dir, otherId)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  const winner = results.find(r => r.status === "fulfilled"); assert.ok(winner && winner.status === "fulfilled");
  assert.equal(await readFile(winner.value.preserved_config, "utf8"), f.original);
});

test("original and preserved config contents are never read; production command accepts no caller-supplied directory or CLI invocation", async () => {
  const source = await readFile(new URL("../../scripts/setup/human-cli-profile.ts", import.meta.url), "utf8");
  assert.ok(!source.includes("readOwned(p.preserved")); assert.ok(!source.includes("readFile(p.preserved"));
  assert.ok(source.includes("[Environment]::GetFolderPath")); assert.ok(source.includes('["activate", "status", "restore"]'));
  assert.ok(!/fetch\(|near\.exe|ExecutionPolicy|signAndSend|keyring/u.test(source));
});
