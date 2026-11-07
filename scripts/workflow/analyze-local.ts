/** Read only reviewed LOCAL workflow facts; never a chain verifier or signer. */
import { open, realpath, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { analyzeRunCosts } from "../../src/lib/intelligence/cohort.ts";

try {
  const root = await realpath(fileURLToPath(new URL("../../", import.meta.url)));
  const path = join(root, ".local", "workflows", "latest.json");
  if (await realpath(path) !== path) throw new Error("LOCAL_WORKFLOW_PATH_MISMATCH");
  const handle = await open(path, "r");
  let bytes: Uint8Array;
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.size > 524288) throw new Error("LOCAL_WORKFLOW_INPUT_LIMIT");
    const buffer = new Uint8Array(524289);
    let length = 0;
    while (length < buffer.length) {
      const read = await handle.read(buffer, length, buffer.length - length, length);
      if (!read.bytesRead) break;
      length += read.bytesRead;
    }
    if (length > 524288) throw new Error("LOCAL_WORKFLOW_INPUT_LIMIT");
    bytes = buffer.subarray(0, length);
  } finally { await handle.close(); }
  const document: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!document || typeof document !== "object" || Array.isArray(document)) throw new Error("INVALID_LOCAL_WORKFLOW_SOURCE");
  const input = document as Record<string, unknown>;
  if (input.source !== "LOCAL_NEAR_SANDBOX_SCRIPTED_WORKFLOW" || input.public_testnet !== false
    || input.result !== "WORKFLOW_CHECKS_PASSED") throw new Error("INVALID_LOCAL_WORKFLOW_SOURCE");
  if (!Array.isArray(input.facts)) throw new Error("LOCAL_WORKFLOW_FACTS_UNAVAILABLE");
  const serialized = JSON.stringify(input.facts);
  if (typeof serialized !== "string") throw new Error("LOCAL_WORKFLOW_FACTS_UNAVAILABLE");
  const result = analyzeRunCosts(serialized);
  await writeFile(join(root, ".local", "workflows", "intelligence.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch {
  console.log(JSON.stringify({ source: "LOCAL_ANALYSIS_INPUT_FAILURE", code: "INVALID_OR_UNAVAILABLE_LOCAL_WORKFLOW_FACTS" }));
  process.exitCode = 1;
}
