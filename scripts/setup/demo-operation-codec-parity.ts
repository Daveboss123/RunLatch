/** Offline public transaction wire metadata plus generated in-memory signatures; no HTTP/WinCred. */
import { parseBoundedJson } from "../../src/lib/near/records.ts";
import { encodeDemoTransaction } from "./demo-operation-codec.ts";
import { prepareDemoOperation } from "./human-demo-operation.ts";
import { demoFixture } from "../../tests/near/helpers/demo-operation.ts";
try {
  const chunks: Buffer[] = []; let size = 0;
  for await (const part of process.stdin) { const chunk = Buffer.from(part); size += chunk.length; if (size > 65536) throw Error("PARITY_LIMIT"); chunks.push(chunk); }
  const values = parseBoundedJson(Buffer.concat(chunks).toString("utf8"), 65536);
  if (!Array.isArray(values) || values.length !== 12) throw Error("PARITY_CASES_INVALID");
  const results = values.map(value => { const encoded = encodeDemoTransaction(value); return { transaction_hash: encoded.transaction_hash,
    invalid_placeholder_wire_base64: Buffer.concat([encoded.unsigned_bytes, Buffer.alloc(65)]).toString("base64") }; });
  const ephemeral = [];
  for (const kind of ["project", "capsule", "quote", "agent-key"] as const) {
    const fixture = await demoFixture(kind), review = await prepareDemoOperation(kind, fixture.publicKey, fixture.transport), bytes = fixture.signer(review.transaction);
    ephemeral.push({ transaction: review.transaction, transaction_hash: review.transaction_hash,
      signature_bytes: [...bytes.slice(-64)], signed_wire_base64: Buffer.from(bytes).toString("base64") });
  }
  process.stdout.write(JSON.stringify({ public_execution: false, results, ephemeral }));
} catch { process.stderr.write("OFFLINE_DEMO_OPERATION_PARITY_FAILED\n"); process.exitCode = 1; }
