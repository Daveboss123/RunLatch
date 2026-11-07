/** Fixed LOCAL workflow validator. Never loads a signer or sends an RPC call. */
import { open, realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { validateResearchArtifact, researchCriteriaHash, MAX_ARTIFACT_BYTES } from "../../src/lib/validation/research.ts";
import { prepareValidationAttestation } from "../../src/lib/validation/attestation.ts";

class WorkflowInputError extends Error {}
async function main(): Promise<void> {
  const [runId, policyHash, mode, ...extra] = process.argv.slice(2);
  if (extra.length || !runId || !/^[A-Za-z0-9_-]{1,64}$/u.test(runId)
    || !policyHash || !/^[0-9a-f]{64}$/u.test(policyHash) || !["artifact", "missing"].includes(mode ?? "")) {
    throw new WorkflowInputError("INVALID_WORKFLOW_VALIDATION_BINDING");
  }
  let bytes: Uint8Array | null = null;
  if (mode === "artifact") {
    const root = await realpath(fileURLToPath(new URL("../../", import.meta.url)));
    const expected = join(root, ".local", "workflows", runId, "research.json");
    const actual = await realpath(expected);
    if (actual !== expected) throw new WorkflowInputError("WORKFLOW_ARTIFACT_PATH_MISMATCH");
    const handle = await open(actual, "r");
    try {
      const metadata = await handle.stat();
      if (!metadata.isFile() || metadata.size > MAX_ARTIFACT_BYTES) throw new WorkflowInputError("WORKFLOW_ARTIFACT_SIZE_LIMIT");
      const buffer = new Uint8Array(MAX_ARTIFACT_BYTES + 1);
      let length = 0;
      while (length < buffer.length) {
        const chunk = await handle.read(buffer, length, buffer.length - length, length);
        if (chunk.bytesRead === 0) break;
        length += chunk.bytesRead;
      }
      if (length > MAX_ARTIFACT_BYTES) throw new WorkflowInputError("WORKFLOW_ARTIFACT_SIZE_LIMIT");
      bytes = buffer.subarray(0, length);
    } finally { await handle.close(); }
  }
  const report = await validateResearchArtifact(bytes);
  const prepared = await prepareValidationAttestation(JSON.stringify(report), runId, policyHash, await researchCriteriaHash());
  console.log(JSON.stringify(prepared));
  process.exitCode = report.status === "VALIDATION_PASSED" ? 0 : report.status === "VALIDATION_FAILED" ? 1 : 2;
}
try { await main(); }
catch (error) {
  console.log(JSON.stringify({ source: "LOCAL_WORKFLOW_VALIDATOR_INPUT_FAILURE",
    code: error instanceof WorkflowInputError ? error.message : "WORKFLOW_VALIDATOR_IO_ERROR" }));
  process.exitCode = 3;
}
