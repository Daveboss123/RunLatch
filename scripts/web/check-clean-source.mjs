import { mkdtemp, mkdir, readdir, copyFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";

const root = process.cwd();
const base = process.platform === "win32" ? path.join(os.homedir(), "AppData/Local/Temp/opencode") : os.tmpdir();
const staged = await mkdtemp(path.join(base, "runlatch-ui-source-"));
const allowed = new Set([".ts", ".tsx", ".mjs", ".json", ".css", ".md", ".rs", ".toml", ".lock", ".sh", ".svg", ".woff2", ".txt"]);
const excluded = new Set(["node_modules", "target", ".next", ".local", ".tools", ".git", ".cache"]);
let copied = 0;
async function copy(relative) {
  const from = path.join(root, relative), to = path.join(staged, relative);
  await mkdir(path.dirname(to), { recursive: true });
  await copyFile(from, to, constants.COPYFILE_EXCL); copied += 1;
}
async function directory(relative) {
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    if (entry.isSymbolicLink() || excluded.has(entry.name)) continue;
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) await directory(next);
    else if (allowed.has(path.extname(entry.name)) || entry.name === "Cargo.lock" || entry.name === "LICENSE") await copy(next);
  }
}
for (const file of ["package.json", "package-lock.json", "tsconfig.json", "next-env.d.ts", "next.config.ts", "postcss.config.mjs", "eslint.config.mjs", "components.json", "playwright.config.ts", "AGENTS.md", "README.md", "PRODUCT.md", "ARCHITECTURE.md", "DESIGN.md", "ACCEPTANCE_TESTS.md", "HACKATHON_COMPLIANCE.md", "THIRD_PARTY_NOTICES.md", "LICENSE"]) await copy(file);
for (const folder of ["src", "scripts", "tests", "fixtures", "public", "licenses", "docs", ".agents", ".claude"]) await directory(folder);
console.log(`Fresh source staging: ${copied} allowlisted files. No .git/.local/.tools/dependencies/env/credentials copied. ${staged}`);
const results = [];
for (const command of ["ci --no-fund", "run typecheck", "run lint", "test", "run test:frontend", "run build"]) {
  const result = process.platform === "win32"
    ? spawnSync("cmd.exe", ["/d", "/s", "/c", `npm.cmd ${command}`], { cwd: staged, encoding: "utf8", timeout: 240_000, maxBuffer: 2 * 1024 * 1024 })
    : spawnSync("npm", command.split(" "), { cwd: staged, encoding: "utf8", timeout: 240_000, maxBuffer: 2 * 1024 * 1024 });
  results.push({ command: `npm ${command}`, exit: result.status, error: result.error?.message ?? null, stdout: result.stdout, stderr: result.stderr });
  console.log(`npm ${command}: exit ${result.status}`);
  console.log((result.stdout ?? "").slice(-1600));
  if (result.status !== 0) { console.error((result.stderr ?? "").slice(-2000)); break; }
}
await mkdir(path.join(root, ".local/ui"), { recursive: true });
await writeFile(path.join(root, ".local/ui/clean-source.json"), JSON.stringify({ staged, copied, label: "Fresh source staging + npm ci, not a Git clone or fresh Rust environment", results }, null, 2));
if (results.length !== 6 || results.some(result => result.exit !== 0)) process.exitCode = 1;
