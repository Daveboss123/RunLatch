/** Offline public wire metadata and generated in-memory signature; no HTTP or human store. */
import { parseBoundedJson } from "../../src/lib/near/records.ts";
import { prepareProvider } from "./human-register-demo-provider.ts";
import { encodeProviderTransaction } from "./provider-codec.ts";
import { providerFixture } from "../../tests/near/helpers/provider.ts";
try {
  const chunks: Buffer[] = []; let size = 0;
  for await (const part of process.stdin) {
    const chunk = Buffer.from(part); size += chunk.length; if (size > 16384) throw Error("PARITY_LIMIT"); chunks.push(chunk);
  }
  const values = parseBoundedJson(Buffer.concat(chunks).toString("utf8"), 16384);
  if (!Array.isArray(values) || values.length !== 4) throw Error("PARITY_CASES_INVALID");
  const results = values.map(value => {
    const encoded = encodeProviderTransaction(value);
    return { transaction_hash: encoded.transaction_hash,
      invalid_placeholder_wire_base64: Buffer.concat([encoded.unsigned_bytes, Buffer.alloc(65)]).toString("base64") };
  });
  const f = providerFixture(), r = await prepareProvider(f.publicKey, f.gateKey, f.databaseKey, f.transport), bytes = f.signer(r.transaction);
  process.stdout.write(JSON.stringify({ public_execution: false, results, ephemeral: { transaction: r.transaction,
    transaction_hash: r.transaction_hash, signature_bytes: [...bytes.slice(-64)], signed_wire_base64: Buffer.from(bytes).toString("base64") } }));
} catch { process.stderr.write("OFFLINE_PROVIDER_PARITY_FAILED\n"); process.exitCode = 1; }
