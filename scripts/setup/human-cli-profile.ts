/** Explicit reversible LOCAL CLI configuration switch. No CLI, key store, signer or network.
 * The original file is moved, never read/copied. Only owned public records/profile bytes are read.
 */
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { lstat, realpath, mkdir, open, readFile, opendir } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, parse, resolve, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { object, parseBoundedJson } from "../../src/lib/near/records.ts";

const run = promisify(execFile);
const fail = (code: string): never => { throw Error(code); };
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const samePath = (a: string, b: string) => process.platform === "win32" ? normalize(a).toLowerCase() === normalize(b).toLowerCase() : normalize(a) === normalize(b);
const profileId = (s: string) => /^[0-9a-f]{32}$/u.test(s) ? s : fail("CLI_PROFILE_ID_INVALID");

export function testnetCliProfile(legacyDirectory: string) {
  if (typeof legacyDirectory !== "string" || legacyDirectory.length > 1024 || /[\x00-\x1f]/u.test(legacyDirectory)
    || !/^[A-Za-z]:[\\/]/u.test(legacyDirectory) || !win32.isAbsolute(legacyDirectory)
    || /(^|[\\/])\.\.([\\/]|$)/u.test(legacyDirectory)) return fail("CLI_PROFILE_DIRECTORY_INVALID");
  return `# RunLatch public-only CLI profile. Not signing or spending authority.
version = "5"
credentials_home_dir = ${JSON.stringify(legacyDirectory)}

[network_connection.testnet]
network_name = "testnet"
rpc_url = "https://rpc.testnet.near.org/"
wallet_url = "https://testnet.mynearwallet.com/"
explorer_transaction_url = "https://explorer.testnet.near.org/transactions/"
`;
}
export function cliProfilePaths(directory: string, id: string) {
  profileId(id);
  if (!isAbsolute(directory) || (process.platform === "win32" && !/^[A-Za-z]:[\\/]/u.test(directory))) return fail("CLI_PROFILE_DIRECTORY_INVALID");
  return Object.freeze({ directory, id, active: join(directory, "config.toml"),
    preserved: join(directory, `config.runlatch-preserved-${id}.toml`),
    staged: join(directory, `config.runlatch-staged-${id}.toml`),
    inactive: join(directory, `config.runlatch-inactive-${id}.toml`),
    legacy: join(directory, `runlatch-empty-legacy-${id}`),
    record: join(directory, `.runlatch-cli-profile-${id}.json`),
    marker: join(directory, ".runlatch-cli-profile-active.json"),
    closedMarker: join(directory, `.runlatch-cli-profile-closed-${id}.json`) });
}
async function stat(path: string) {
  try { return await lstat(path, { bigint: true }); }
  catch (e) { if (e instanceof Error && "code" in e && e.code === "ENOENT") return null; return fail("CLI_PROFILE_METADATA_UNAVAILABLE"); }
}
async function directoryGuard(path: string) {
  const ancestors = []; let current = resolve(path);
  while (current !== parse(current).root) { ancestors.push(current); current = dirname(current); }
  for (const part of ancestors.reverse()) {
    const s = await stat(part);
    if (!s?.isDirectory() || s.isSymbolicLink() || !samePath(await realpath(part), part)) return fail("CLI_PROFILE_UNSAFE_DIRECTORY");
  }
}
async function metadata(path: string) {
  const s = await stat(path);
  if (!s) return null;
  if (!s.isFile() || s.isSymbolicLink() || !samePath(await realpath(path), path) || s.ino === 0n) return fail("CLI_PROFILE_UNSAFE_FILE");
  return Object.freeze({ dev: s.dev.toString(), ino: s.ino.toString(), size: s.size.toString(), mtime_ns: s.mtimeNs.toString(), birthtime_ns: s.birthtimeNs.toString() });
}
type Metadata = NonNullable<Awaited<ReturnType<typeof metadata>>>;
function parseMetadata(v: unknown): Metadata {
  const m = object(v, ["dev", "ino", "size", "mtime_ns", "birthtime_ns"]);
  for (const key of Object.keys(m)) if (typeof m[key] !== "string" || !/^-?[0-9]{1,32}$/u.test(m[key] as string)) return fail("CLI_PROFILE_RECORD_INVALID");
  return { dev: m.dev as string, ino: m.ino as string, size: m.size as string, mtime_ns: m.mtime_ns as string, birthtime_ns: m.birthtime_ns as string };
}
// NTFS name tunneling can inherit the prior config.toml creation time on rename.
// Retain birthtime as information, never as identity. Volume/file ID, size and
// last-write time must still match; owned public profile bytes are checked separately.
const same = (a: Metadata | null, b: Metadata) => a !== null
  && (["dev", "ino", "size", "mtime_ns"] as const).every(key => a[key] === b[key]);
async function writeNew(path: string, text: string) {
  const bytes = Buffer.from(text, "utf8"); if (bytes.length > 8192) return fail("CLI_PROFILE_RECORD_SIZE_LIMIT");
  const h = await open(path, "wx", 0o600);
  try { await h.writeFile(bytes); await h.sync(); } finally { await h.close(); }
}
async function readOwned(path: string, maximum = 8192) {
  const m = await metadata(path);
  if (!m || BigInt(m.size) > BigInt(maximum)) return fail("CLI_PROFILE_RECORD_INVALID");
  return readFile(path, "utf8");
}
async function isEmpty(path: string) {
  await directoryGuard(path);
  const dir = await opendir(path, { bufferSize: 1 });
  try { return await dir.read() === null; } finally { await dir.close(); }
}

/** Native same-directory move with NO destination replacement. No execution-policy flags. */
export async function moveCliFileNoReplace(from: string, to: string) {
  if (process.platform !== "win32" || !isAbsolute(from) || !isAbsolute(to) || !samePath(dirname(from), dirname(to))
    || /[\x00-\x1f]/u.test(from + to)) return fail("CLI_PROFILE_MOVE_SCOPE_INVALID");
  const literal = (s: string) => `'${s.replaceAll("'", "''")}'`;
  const powershell = join(process.env.SystemRoot ?? fail("CLI_PROFILE_WINDOWS_REQUIRED"), "System32/WindowsPowerShell/v1.0/powershell.exe");
  try {
    await run(powershell, ["-NoProfile", "-NonInteractive", "-Command",
      `$ErrorActionPreference='Stop'; [System.IO.File]::Move(${literal(from)},${literal(to)})`], { timeout: 10_000, maxBuffer: 8192, windowsHide: true });
  } catch { return fail("CLI_PROFILE_MOVE_NOT_CONFIRMED"); }
}
type Move = typeof moveCliFileNoReplace;

/** Trusted local caller chooses directory; production CLI below fixes it to the Windows known folder.
 * Test directories/movers are synthetic only, not signing or stock CLI admission.
 */
export async function activateCliProfile(directory: string, id = randomUUID().replaceAll("-", ""), move: Move = moveCliFileNoReplace) {
  const p = cliProfilePaths(directory, id); await directoryGuard(directory);
  const original = await metadata(p.active); if (!original) return fail("CLI_PROFILE_ORIGINAL_MISSING");
  const text = testnetCliProfile(p.legacy);
  for (const path of [p.preserved, p.staged, p.inactive, p.legacy, p.record, p.closedMarker]) if (await stat(path)) return fail("CLI_PROFILE_PATH_ALREADY_EXISTS");
  // One shared exclusive marker stops repeat/concurrent switches, including incomplete operations.
  try { await writeNew(p.marker, JSON.stringify({ profile_id: id })); } catch { return fail("CLI_PROFILE_SWITCH_ALREADY_CLAIMED"); }
  await mkdir(p.legacy); await writeNew(p.staged, text);
  const prepared = await metadata(p.staged); if (!prepared) return fail("CLI_PROFILE_PREPARATION_FAILED");
  await writeNew(p.record, JSON.stringify({ source: "REVERSIBLE_PUBLIC_TESTNET_CLI_PROFILE", profile_id: id,
    original, prepared, profile_sha256: digest(text), original_contents_read: false, signing_enabled: false }));
  if (!same(await metadata(p.active), original) || !await isEmpty(p.legacy)) return fail("CLI_PROFILE_ORIGINAL_CHANGED");
  await move(p.active, p.preserved); // Same-file rename; original contents/ACL/streams not copied.
  if (!same(await metadata(p.preserved), original)) return fail("CLI_PROFILE_PRESERVATION_NOT_CONFIRMED");
  await move(p.staged, p.active);
  if (!same(await metadata(p.active), prepared) || await readOwned(p.active) !== text) return fail("CLI_PROFILE_ACTIVATION_NOT_CONFIRMED");
  return Object.freeze({ source: "REVERSIBLE_PUBLIC_TESTNET_CLI_PROFILE", profile_id: id, active_config: p.active,
    preserved_config: p.preserved, empty_legacy_directory: p.legacy, profile_sha256: digest(text),
    original_contents_read: false, signing_enabled: false, original, prepared });
}
async function record(p: ReturnType<typeof cliProfilePaths>) {
  const r = object(parseBoundedJson(await readOwned(p.record)), ["source", "profile_id", "original", "prepared", "profile_sha256", "original_contents_read", "signing_enabled"]);
  if (r.source !== "REVERSIBLE_PUBLIC_TESTNET_CLI_PROFILE" || r.profile_id !== p.id || r.profile_sha256 !== digest(testnetCliProfile(p.legacy))
    || r.original_contents_read !== false || r.signing_enabled !== false) return fail("CLI_PROFILE_RECORD_INVALID");
  return { original: parseMetadata(r.original), prepared: parseMetadata(r.prepared) };
}
export async function inspectCliProfile(directory: string, id: string) {
  const p = cliProfilePaths(directory, id); await directoryGuard(directory); const r = await record(p);
  const active = await metadata(p.active), preserved = await metadata(p.preserved), inactive = await metadata(p.inactive);
  const status = same(active, r.prepared) && same(preserved, r.original) ? "ACTIVE_TESTNET_PROFILE"
    : same(active, r.original) && same(inactive, r.prepared) && preserved === null ? "ORIGINAL_RESTORED" : "CHANGED_OR_INCOMPLETE";
  return Object.freeze({ status, profile_id: id, active_config: p.active, preserved_config: p.preserved,
    legacy_directory_empty: await isEmpty(p.legacy), signing_enabled: false });
}
export async function restoreCliProfile(directory: string, id: string, move: Move = moveCliFileNoReplace) {
  const p = cliProfilePaths(directory, id); await directoryGuard(directory); const r = await record(p);
  if (!same(await metadata(p.active), r.prepared) || !same(await metadata(p.preserved), r.original)) return fail("CLI_PROFILE_CHANGED_OR_INCOMPLETE");
  const marker = object(parseBoundedJson(await readOwned(p.marker, 1024)), ["profile_id"]);
  if (marker.profile_id !== id || await stat(p.inactive) || await stat(p.closedMarker)) return fail("CLI_PROFILE_RESTORE_CONFLICT");
  // Only read the current file after metadata proves it is the public profile we created.
  if (await readOwned(p.active) !== testnetCliProfile(p.legacy)) return fail("CLI_PROFILE_CHANGED_OR_INCOMPLETE");
  await move(p.active, p.inactive); await move(p.preserved, p.active);
  if (!same(await metadata(p.active), r.original)) return fail("CLI_PROFILE_RESTORATION_NOT_CONFIRMED");
  await move(p.marker, p.closedMarker); // Retain every record/profile; delete nothing.
  return inspectCliProfile(directory, id);
}
async function main() {
  if (process.platform !== "win32") return fail("CLI_PROFILE_WINDOWS_REQUIRED");
  const [action, id, ...extra] = process.argv.slice(2);
  if (extra.length || !["activate", "status", "restore"].includes(action) || (action === "activate" ? id !== undefined : id === undefined)) return fail("CLI_PROFILE_USAGE");
  const powershell = join(process.env.SystemRoot ?? fail("CLI_PROFILE_WINDOWS_REQUIRED"), "System32/WindowsPowerShell/v1.0/powershell.exe");
  const result = await run(powershell, ["-NoProfile", "-NonInteractive", "-Command",
    "[Console]::OutputEncoding=[Text.Encoding]::UTF8; [Console]::Write([Environment]::GetFolderPath([Environment+SpecialFolder]::ApplicationData))"], { timeout: 10_000, maxBuffer: 4096, windowsHide: true });
  const directory = join(result.stdout.trim(), "near-cli");
  const value = action === "activate" ? await activateCliProfile(directory) : action === "status" ? await inspectCliProfile(directory, id) : await restoreCliProfile(directory, id);
  console.log(JSON.stringify(value, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
