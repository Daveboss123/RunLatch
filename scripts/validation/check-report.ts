/** Offline CLI. Reads bounded regular JSON only, never fetches source URLs. */
import { open } from "node:fs/promises";
import { extname } from "node:path";
import { MAX_ARTIFACT_BYTES, validateResearchArtifact } from "../../src/lib/validation/research.ts";

const file = process.argv[2];
if (!file || process.argv.length !== 3 || extname(file).toLowerCase() !== ".json") {
  console.error("Usage: node scripts/validation/check-report.ts <local-artifact.json>");
  process.exitCode = 2;
} else {
  try {
    const handle = await open(file, "r");
    let bytes: Uint8Array;
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > MAX_ARTIFACT_BYTES) throw new Error("ARTIFACT_NOT_BOUNDED_REGULAR_JSON");
      const buffer = new Uint8Array(MAX_ARTIFACT_BYTES + 1);
      let offset = 0;
      while (offset < buffer.byteLength) {
        const { bytesRead } = await handle.read(buffer, offset, buffer.byteLength - offset, null);
        if (!bytesRead) break;
        offset += bytesRead;
      }
      if (offset > MAX_ARTIFACT_BYTES) throw new Error("ARTIFACT_GREW_BEYOND_LIMIT");
      bytes = buffer.slice(0, offset);
    } finally { await handle.close(); }
    const report = await validateResearchArtifact(bytes);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.status === "VALIDATION_PASSED" ? 0 : 1;
  } catch {
    // Do not echo source contents, private paths, or operating-system error data.
    console.error(JSON.stringify({ source: "LOCAL_VALIDATOR_CLI", code: "ARTIFACT_READ_ERROR",
      message: "Unable to read a regular JSON artifact of at most 1 MiB. No validation or payment result is claimed." }));
    process.exitCode = 2;
  }
}
