/** Offline bridge: public inputs, generated in-memory keys, public signatures only. */
import { parseBoundedJson } from "../../src/lib/near/records.ts";
import { encodeChildTransaction, verifyChildSignature } from "./child-account-codec.ts";
import { childFixture, fixtureTransaction } from "../../tests/near/helpers/child-accounts.ts";
try {
  const chunks: Buffer[] = []; let size = 0;
  for await (const part of process.stdin) {
    const chunk = Buffer.from(part); size += chunk.length; if (size > 16384) throw Error("PARITY_LIMIT"); chunks.push(chunk);
  }
  const values = parseBoundedJson(Buffer.concat(chunks).toString("utf8"), 16384);
  if (!Array.isArray(values) || values.length !== 12) throw Error("PARITY_CASES_INVALID");
  const results = values.map(value => {
    const encoded = encodeChildTransaction(value);
    return { transaction_hash: encoded.transaction_hash,
      invalid_placeholder_wire_base64: Buffer.concat([encoded.unsigned_bytes, Buffer.alloc(65)]).toString("base64") };
  });
  const fixture = childFixture(), ephemeral = [0, 1, 2].map(index => {
    const tx = fixtureTransaction(fixture, index), signed = fixture.signer(tx);
    verifyChildSignature(tx, signed.slice(-64));
    return { transaction: tx, transaction_hash: encodeChildTransaction(tx).transaction_hash,
      signature_bytes: [...signed.slice(-64)], signed_wire_base64: Buffer.from(signed).toString("base64") };
  });
  process.stdout.write(JSON.stringify({ results, ephemeral, public_execution: false }));
} catch { process.stderr.write("OFFLINE_CHILD_PARITY_FAILED\n"); process.exitCode = 1; }
