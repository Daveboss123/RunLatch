/** Fixed local fixture reader/checker; no URL, signer, arbitrary command or upload. */
import { open, realpath } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateResourceFixture } from "../../src/lib/validation/resource.ts";
const [projectId, resourceKey, observedAtNs, mode] = process.argv.slice(2);
try {
  if (!/^[A-Za-z0-9_-]{1,64}$/u.test(projectId ?? "") || !/^[A-Za-z0-9_-]{1,64}$/u.test(resourceKey ?? "")
    || !/^(0|[1-9][0-9]{0,19})$/u.test(observedAtNs ?? "") || !["artifact", "missing"].includes(mode ?? "") || process.argv.length !== 6) throw new Error("INVALID_RESOURCE_ARGUMENTS");
  let bytes: Uint8Array | null = null;
  if (mode === "artifact") {
    const root = await realpath(fileURLToPath(new URL("../../", import.meta.url)));
    const path = join(root, ".local", "projects", projectId, "resource.json");
    if (await realpath(path) !== path) throw new Error("RESOURCE_PATH_MISMATCH");
    const handle = await open(path, "r");
    try {
      const metadata = await handle.stat(); if (!metadata.isFile() || metadata.size > 16384) throw new Error("RESOURCE_INPUT_LIMIT");
      const buffer = new Uint8Array(16385); let length = 0;
      while (length < buffer.length) { const result = await handle.read(buffer, length, buffer.length - length, length); if (!result.bytesRead) break; length += result.bytesRead; }
      if (length > 16384) throw new Error("RESOURCE_INPUT_LIMIT"); bytes = buffer.subarray(0, length);
    } finally { await handle.close(); }
  }
  const report = await validateResourceFixture(bytes, { project_id: projectId, resource_key: resourceKey }, observedAtNs);
  console.log(JSON.stringify(report)); process.exitCode = report.status === "VALIDATION_PASSED" ? 0 : report.status === "VALIDATION_FAILED" ? 1 : 2;
} catch { console.log(JSON.stringify({ source: "LOCAL_RESOURCE_INPUT_FAILURE", code: "INVALID_OR_UNAVAILABLE_RESOURCE_INPUT" })); process.exitCode = 3; }
