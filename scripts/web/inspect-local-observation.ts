/** Explicit LOCAL development read-back; never serves artifacts or submits a transaction. */
import { readFile } from "node:fs/promises";
import { importLocalObservation } from "../../src/lib/near/observation.ts";
import { id } from "../../src/lib/near/records.ts";

if (process.argv.length !== 3) throw new Error("Use: node scripts/web/inspect-local-observation.ts <generated-project-id>");
const project = id(process.argv[2]);
const observation = await importLocalObservation(await readFile(new URL(`../../.local/projects/${project}/observation.json`, import.meta.url), "utf8"));
if (observation.project_id !== project) throw new Error("OBSERVATION_SCOPE_MISMATCH");
console.log(JSON.stringify({ result: "LOCAL_OBSERVATION_ADAPTER_CHECKED", source: observation.source,
  independently_verified: false, public_testnet: false, providers: observation.providers.length, quotes: observation.quotes.length,
  purchases: observation.purchases.map(p => ({ request_id: p.record.proposal.request_id, reported_status: p.record.status, payment_evidence: p.payment_evidence })),
  attempts: observation.attempts.length, spent: observation.report.financials?.spent, reserved: observation.report.financials?.reserved }));
