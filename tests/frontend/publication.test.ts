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

test("preview distinguishes recorded testnet setup from absent public purchase and private source", async () => {
  const footer = await readFile("src/components/runlatch/footer.tsx", "utf8");
  assert.match(footer, /Testnet setup exists; no public purchase or outcome yet/u);
  assert.match(footer, /Private source repository/u);
  assert.doesNotMatch(footer, /No public deployment|Repository not published/u);
  const docs = await readFile("src/app/docs/page.tsx", "utf8");
  assert.match(docs, /Human setup is observed on public testnet/u);
  assert.match(docs, /active provider <code>db_demo_1108/u);
  assert.match(docs, /5DnrDArTCEN8rGaDCAqacX2CmxvCymYozNam7iys4DLu/u);
  assert.match(docs, /No capsule, quote, restricted key, public purchase or outcome exists/u);
  assert.match(docs, /Meteor Wallet extension v2/u);
  assert.match(docs, /expired on 10 November/u);
  assert.match(docs, /A new unsigned work order is prepared, not created or renewed/u);
  assert.doesNotMatch(docs, /Not connected or deployed/u);
});
