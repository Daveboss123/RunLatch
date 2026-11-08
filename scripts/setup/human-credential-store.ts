/** Node-only native Windows store. No script execution, network, credential enumeration or key files. */
import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { lstatSync, readFileSync } from "node:fs";

type NativeCall = (...args: unknown[]) => unknown;
interface Ffi {
  version: string;
  load(path: string): { func(...args: unknown[]): NativeCall };
  struct(name: string, fields: Record<string, unknown>): unknown;
  pointer(type: unknown): unknown;
  decode(pointer: unknown, type: unknown, length?: number): unknown;
  sizeof(type: unknown): number;
}
let loaded: ReturnType<typeof nativeStore> | null = null;
function nativeStore() {
  if (process.platform !== "win32" || process.arch !== "x64") throw Error("WINDOWS_X64_REQUIRED");
  // Pinned private local tool. Its npm install script is never run; no build or alternate binding fallback.
  const require = createRequire(import.meta.url);
  const modulePath = fileURLToPath(new URL("../../.tools/human-credential-store-3.3.7/node_modules/@koromix/koffi-win32-x64/win32_x64/koffi.node", import.meta.url));
  const metadata = lstatSync(modulePath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size !== 1_078_784) throw Error("STORE_TOOL_CHANGED");
  if (createHash("sha256").update(readFileSync(modulePath)).digest("hex") !== "38c7361513d2d26716b5da8d4e0b78bfe6500f51e0e87f7fefacc362f1e198cf") throw Error("STORE_TOOL_CHANGED");
  // Load this verified binary directly, not the package's alternate-path resolver.
  const raw: unknown = require(modulePath);
  if (!raw || typeof raw !== "object" || !Object.hasOwn(raw, "version")) throw Error("STORE_TOOL_UNAVAILABLE");
  const ffi = raw as Ffi;
  if (ffi.version !== "3.3.7" || [ffi.load, ffi.struct, ffi.pointer, ffi.decode, ffi.sizeof].some(fn => typeof fn !== "function")) throw Error("STORE_TOOL_UNAVAILABLE");
  const library = ffi.load("C:\\Windows\\System32\\advapi32.dll");
  const kernel = ffi.load("C:\\Windows\\System32\\kernel32.dll");
  const filetime = ffi.struct("RunLatchFileTime", { low: "uint32_t", high: "uint32_t" });
  const credential = ffi.struct("RunLatchCredential", {
    Flags: "uint32_t", Type: "uint32_t", TargetName: "str16", Comment: "str16", LastWritten: filetime,
    CredentialBlobSize: "uint32_t", CredentialBlob: "void *", Persist: "uint32_t", AttributeCount: "uint32_t",
    Attributes: "void *", TargetAlias: "str16", UserName: "str16",
  });
  if (ffi.sizeof(credential) !== 80) throw Error("STORE_ABI_MISMATCH");
  const read = library.func("int32_t __stdcall CredReadW(const char16_t *target, uint32_t type, uint32_t flags, _Out_ void **credential)");
  const write = library.func("__stdcall", "CredWriteW", "int32_t", [ffi.pointer(credential), "uint32_t"]);
  const free = library.func("void __stdcall CredFree(void *credential)");
  const removeProbe = library.func("int32_t __stdcall CredDeleteW(const char16_t *target, uint32_t type, uint32_t flags)");
  const lastError = kernel.func("uint32_t __stdcall GetLastError(void)");
  function writeNew(target: string, username: string, blob: Buffer) {
    if (target.length > 256 || username.length > 160 || !blob.length || blob.length > 2560) throw Error("STORE_INPUT_LIMIT");
    const existing: unknown[] = [null];
    if (read(target, 1, 0, existing) !== 0) { free(existing[0]); throw Error("STORE_TARGET_EXISTS"); }
    if (lastError() !== 1168) throw Error("STORE_UNAVAILABLE_NO_FALLBACK");
    // WinCred has no atomic create-only flag. The target includes a newly-generated random public key;
    // refuse an existing target, and do not claim protection against malicious same-user OS races.
    const input = { Flags: 0, Type: 1, TargetName: target, Comment: "RunLatch human-controlled testnet demo key",
      LastWritten: { low: 0, high: 0 }, CredentialBlobSize: blob.length, CredentialBlob: blob,
      Persist: 2, AttributeCount: 0, Attributes: null, TargetAlias: null, UserName: username };
    if (write(input, 0) === 0) throw Error("STORE_WRITE_UNAVAILABLE");
    const saved: unknown[] = [null];
    if (read(target, 1, 0, saved) === 0) throw Error("STORE_VERIFY_UNAVAILABLE");
    try {
      const record: unknown = ffi.decode(saved[0], credential);
      if (!record || typeof record !== "object") throw Error("STORE_VERIFY_UNAVAILABLE");
      const view = record as Record<string, unknown>;
      if (view.Type !== 1 || view.Persist !== 2 || view.UserName !== username || view.CredentialBlobSize !== blob.length) throw Error("STORE_VERIFY_UNAVAILABLE");
      const bytes: unknown = ffi.decode(view.CredentialBlob, "uint8_t", blob.length);
      if (!(bytes instanceof Uint8Array) && !(Array.isArray(bytes) && bytes.every(b => Number.isInteger(b) && b >= 0 && b <= 255))) throw Error("STORE_VERIFY_UNAVAILABLE");
      const copy = Buffer.from(bytes);
      try { if (!copy.equals(blob)) throw Error("STORE_VERIFY_UNAVAILABLE"); }
      finally { copy.fill(0); }
    } finally { free(saved[0]); }
  }
  return { writeNew, removeProbe };
}
function store() { return loaded ??= nativeStore(); }

export function probeHumanCredentialStore() {
  const target = `RunLatch.storage-probe.${randomUUID().replaceAll("-", "")}`;
  const blob = Buffer.from("Nonsensitive RunLatch storage probe", "utf16le");
  try {
    store().writeNew(target, "RunLatch.storage-probe", blob);
    // Only this newly-created nonsensitive target may be removed. Never a human key.
    if (store().removeProbe(target, 1, 0) === 0) throw Error("STORE_PROBE_CLEANUP_UNAVAILABLE");
    return Object.freeze({ status: "STORE_READY_NONSECRET_PROBE", human_keys_created: false, network_calls: 0 });
  } finally { blob.fill(0); }
}

export function storeGeneratedDemoKey(input: Buffer, expected: { account_id: string; public_key: string; credential_target: string }) {
  if (input.length > 2048) throw Error("STORE_INPUT_LIMIT");
  const data: unknown = JSON.parse(input.toString("utf8"));
  if (!data || typeof data !== "object") throw Error("STORE_INPUT_INVALID");
  const record = data as Record<string, unknown>;
  const accounts = ["runlatch-demo-1108.testnet", "gate.runlatch-demo-1108.testnet", "db.runlatch-demo-1108.testnet", "agent.runlatch-demo-1108.testnet"];
  if (!accounts.includes(expected.account_id) || record.account_id !== expected.account_id || record.public_key !== expected.public_key
    || !/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,44}$/u.test(expected.public_key)
    || typeof record.private_key !== "string" || !/^ed25519:[1-9A-HJ-NP-Za-km-z]{64,88}$/u.test(record.private_key)
    || Object.keys(record).sort().join(",") !== "account_id,private_key,public_key") throw Error("STORE_INPUT_INVALID");
  const username = `${expected.account_id}:${expected.public_key}`;
  if (expected.credential_target !== `${username}.near-testnet-${expected.account_id}`) throw Error("STORE_INPUT_INVALID");
  const blob = Buffer.from(JSON.stringify(record), "utf16le");
  try { store().writeNew(expected.credential_target, username, blob); }
  finally { blob.fill(0); record.private_key = undefined; }
}
