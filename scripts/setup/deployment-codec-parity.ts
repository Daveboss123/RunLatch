/** Bounded offline Rust bridge: public metadata, pinned default code and ephemeral signatures only. */
import { parseBoundedJson } from "../../src/lib/near/records.ts";
import { loadDeploymentArtifact, prepareDeployment } from "./human-deploy-demo-gate.ts";
import { encodeDeploymentTransaction } from "./deployment-codec.ts";
import { deploymentFixture } from "../../tests/near/helpers/deployment.ts";
try {
  const chunks: Buffer[] = []; let size = 0;
  for await (const part of process.stdin) {
    const chunk = Buffer.from(part); size += chunk.length; if (size > 16384) throw Error("PARITY_LIMIT"); chunks.push(chunk);
  }
  const values = parseBoundedJson(Buffer.concat(chunks).toString("utf8"), 16384);
  if (!Array.isArray(values) || values.length !== 4) throw Error("PARITY_CASES_INVALID");
  const code = await loadDeploymentArtifact(), results = values.map(value => {
    const encoded = encodeDeploymentTransaction(value, code);
    return { transaction_hash: encoded.transaction_hash,
      invalid_placeholder_wire_base64: Buffer.concat([encoded.unsigned_bytes, Buffer.alloc(65)]).toString("base64") };
  });
  const fixture = deploymentFixture(code), review = await prepareDeployment(fixture.publicKey, code, fixture.transport);
  const bytes = fixture.signer(review.transaction, code);
  process.stdout.write(JSON.stringify({ public_execution: false, results, ephemeral: {
    transaction: review.transaction, transaction_hash: review.transaction_hash,
    signature_bytes: [...bytes.slice(-64)], signed_wire_base64: Buffer.from(bytes).toString("base64") } }));
} catch { process.stderr.write("OFFLINE_DEPLOYMENT_PARITY_FAILED\n"); process.exitCode = 1; }
