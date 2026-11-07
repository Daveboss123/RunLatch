import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("local web launcher binds loopback and opts out of telemetry", async () => {
  const source = await readFile(new URL("../../scripts/web/next-local.mjs", import.meta.url), "utf8");
  assert.match(source, /127\.0\.0\.1/u);
  assert.match(source, /NEXT_TELEMETRY_DISABLED: "1"/u);
});
