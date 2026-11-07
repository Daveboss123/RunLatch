import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const parserRequire = createRequire(require.resolve("@typescript-eslint/typescript-estree"));
type Matcher = { Minimatch: new (pattern: string, options?: { dot?: boolean; nocase?: boolean }) => { match(path: string): boolean } };

test("Release hardening: patched matcher is parent-scoped and retains parser glob API", () => {
  const metadata = parserRequire("minimatch/package.json") as { version: string };
  assert.equal(metadata.version, "11.0.1");
  const { Minimatch } = parserRequire("minimatch") as Matcher;
  assert.equal(new Minimatch("src/**/*.{ts,tsx}").match("src/components/example.tsx"), true);
  assert.equal(new Minimatch("src/**/*.{ts,tsx}").match("src/components/example.js"), false);
  assert.equal(new Minimatch("**/*", { dot: true }).match(".agents/skills/example.md"), true);
  assert.equal(new Minimatch("**/README.md", { nocase: true }).match("docs/readme.md"), true);
  const eslintRequire = createRequire(require.resolve("eslint"));
  const legacy = eslintRequire("minimatch/package.json") as { version: string };
  assert.equal(legacy.version.startsWith("3."), true, "Legacy matcher was not globally overridden");
});
