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

test("hosted preview copy does not claim a deployed NEAR contract or public repository", async () => {
  const footer = await readFile("src/components/runlatch/footer.tsx", "utf8");
  assert.match(footer, /No public NEAR contract/u);
  assert.match(footer, /Private source repository/u);
  assert.doesNotMatch(footer, /No public deployment|Repository not published/u);
  assert.match(await readFile("src/app/docs/page.tsx", "utf8"), /Not connected or deployed/u);
});
