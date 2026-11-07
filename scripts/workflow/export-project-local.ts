/** Read-only LOCAL report export. Default disclosure is empty; no signer/network/upload. */
import { open, realpath } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildProjectReport } from "../../src/lib/reporting/project.ts";

const [projectId, ...flags] = process.argv.slice(2);
try {
  const allowed = ["--budget", "--expenses", "--evidence"];
  if (!/^[A-Za-z0-9_-]{1,64}$/u.test(projectId ?? "") || flags.some(flag => !allowed.includes(flag)) || new Set(flags).size !== flags.length) throw new Error("INVALID_EXPORT_SCOPE");
  const root = await realpath(fileURLToPath(new URL("../../", import.meta.url)));
  const path = join(root, ".local", "projects", projectId, "canonical.json");
  if (await realpath(path) !== path) throw new Error("REPORT_PATH_MISMATCH");
  const handle = await open(path, "r");
  let serialized: string;
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.size > 1_048_576) throw new Error("REPORT_INPUT_LIMIT");
    const bytes = new Uint8Array(1_048_577); let length = 0;
    while (length < bytes.length) { const read = await handle.read(bytes, length, bytes.length - length, length); if (!read.bytesRead) break; length += read.bytesRead; }
    if (length > 1_048_576) throw new Error("REPORT_INPUT_LIMIT");
    serialized = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length));
  } finally { await handle.close(); }
  // This CLI accepts only its LOCAL Sandbox envelope. Public evidence uses a separate approved observer.
  if (JSON.parse(serialized).source !== "LOCAL_NEAR_SANDBOX_OBSERVATION") throw new Error("NONLOCAL_REPORT_SOURCE");
  console.log(JSON.stringify(await buildProjectReport(serialized, { project_id: projectId, budget: flags.includes("--budget"),
    expenses: flags.includes("--expenses"), evidence: flags.includes("--evidence") })));
} catch { console.log(JSON.stringify({ source: "LOCAL_PROJECT_REPORT_INPUT_FAILURE", code: "INVALID_OR_UNAVAILABLE_PROJECT_REPORT" })); process.exitCode = 1; }
