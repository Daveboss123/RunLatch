/** Generate harmless LOCAL report fixtures, not owner signatures or chain proof. */
import { readFile, mkdir, writeFile, stat } from "node:fs/promises";
import { validateResearchArtifact, researchCriteriaHash, MAX_ARTIFACT_BYTES } from "../../src/lib/validation/research.ts";
import { prepareValidationAttestation } from "../../src/lib/validation/attestation.ts";

async function fixture(name: string): Promise<Uint8Array> {
  const path = new URL(`../../fixtures/research/${name}`, import.meta.url);
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size > MAX_ARTIFACT_BYTES) throw new Error("SANDBOX_FIXTURE_SIZE_LIMIT");
  return readFile(path);
}
const criteria = await researchCriteriaHash();
const inputs = { pass: await fixture("valid-demo.json"), fail: await fixture("invalid-demo.json"), error: null };
const reports: Record<string, unknown> = {};
for (const [name, input] of Object.entries(inputs)) {
  const report = await validateResearchArtifact(input);
  // Only report summary is exported. Real capsule/policy binding comes from the
  // local contract; this placeholder is never submitted or exported.
  reports[name] = (await prepareValidationAttestation(JSON.stringify(report), "fixture-review", "00".repeat(32), criteria)).report;
}
const directory = new URL("../../.local/validation/", import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL("sandbox-reports.json", directory), JSON.stringify({ source: "LOCAL_GENERATED_REPORT_FIXTURES_UNATTESTED", reports }, null, 2));
console.log(JSON.stringify({ source: "LOCAL_GENERATED_REPORT_FIXTURES_UNATTESTED", output: ".local/validation/sandbox-reports.json", report_count: 3 }));
