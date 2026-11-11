import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, access } from "node:fs/promises";
import path from "node:path";

test("served source and public assets contain no personal machine paths", async () => {
  async function inspect(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      assert.equal(entry.isSymbolicLink(), false, "No linked public/source paths");
      if (entry.isDirectory()) await inspect(file);
      else {
        const bytes = await readFile(file);
        if (bytes.includes(0)) continue;
        assert.doesNotMatch(bytes.toString("utf8"), /[A-Z]:\\Users\\[^\\\s"']+|\/mnt\/[a-z]\/Users\/[^/\s]+|\/home\/[^/\s]+/u, file);
      }
    }
  }
  await inspect("src");
  await inspect("public");
});

test("unverified NEAR artwork is retained but not served", async () => {
  await assert.rejects(access("public/marks/near.svg"), { code: "ENOENT" });
  assert.match(await readFile("assets/reference-marks/near.svg", "utf8"), /<title>NEAR<\/title>/u);
  assert.match(await readFile("src/components/runlatch/build-strip.tsx", "utf8"), /name: "NEAR"[^\n]+mark: null/u);
});

test("preview distinguishes recorded testnet setup from the unresolved purchase and private source", async () => {
  const footer = await readFile("src/components/runlatch/footer.tsx", "utf8");
  assert.match(footer, /four FINAL transactions/u);
  assert.match(footer, /one signed purchase remains unresolved/u);
  assert.match(footer, /Private source repository/u);
  assert.doesNotMatch(footer, /No public deployment|Repository not published/u);
  const docs = await readFile("src/app/docs/page.tsx", "utf8");
  assert.match(docs, /Human setup is observed on public testnet/u);
  assert.match(docs, /<code>project_demo_1110<\/code>/u);
  assert.match(docs, /FMKZhn3JU6k7KxEE9BLezanQoZmHufCHrrqHwSZudBza/u);
  assert.match(docs, /3N98awqyrxUbGqA7zGVsZtpT28pmdJf5j2cdXR8c3GkP/u);
  assert.match(docs, /The attempt is unresolved, not failed and not settled/u);
  assert.match(docs, /Meteor extension v2/u);
  assert.doesNotMatch(docs, /Not connected or deployed/u);
});
test("recorded testnet ledger keeps the signed purchase unresolved and free of settlement claims", async () => {
  const { VERIFIED_TESTNET } = await import("../../src/lib/near/verified-demo.ts");
  const steps = VERIFIED_TESTNET.steps;
  assert.equal(steps.filter(step => step.state === "FINAL").length, 4);
  assert.deepEqual(steps.map(step => [step.transaction_hash, step.block_height]), [
    ["FMKZhn3JU6k7KxEE9BLezanQoZmHufCHrrqHwSZudBza", 277134275],
    ["AeNBkfXrftqN85JEFgJAwXdnHnbr4Nb8A65ysi4drKKj", 277134741],
    ["2TYs5yEFkjFRWiAMTuMqETQ2FosvoaLZnKhjRZEWF1Pn", 277136000],
    ["H4cqJTWvx2GvSAaFMPt4JUjPk2EvrjsbpoYUuLfWufMK", 277138478],
    ["3N98awqyrxUbGqA7zGVsZtpT28pmdJf5j2cdXR8c3GkP", null],
  ]);
  const purchase = steps.at(-1)!;
  assert.equal(purchase.state, "UNRESOLVED"); assert.equal(purchase.block_height, null);
  assert.match(purchase.summary, /No on-chain record/u);
  assert.match(purchase.summary, /recorded contract snapshot shows no spend or reservation/u);
  assert.match(purchase.summary, /settlement remains unverified/u);
  for (const step of steps) if (step.transaction_hash) assert.match(step.transaction_hash, /^[1-9A-HJ-NP-Za-km-z]{43,44}$/u);
  assert.doesNotMatch(VERIFIED_TESTNET.limitation, /settled|delivered or accepted/u);
  assert.match(VERIFIED_TESTNET.limitation, /fail-closed/u);
});
