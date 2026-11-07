/** Local candidate-tree scan. Never prints matched values; not an exhaustive secret detector. */
import { spawnSync } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const listed = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8", maxBuffer: 2_000_000 });
if (listed.status !== 0) throw new Error("CANDIDATE_LIST_FAILED");
const files = [...new Set(listed.stdout.split("\0").filter(Boolean))].sort();
const blocked = [], privacy = [], binaries = [], reviewedFixtures = [];
const rules = [
  ["PRIVATE_KEY_BLOCK", /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/u],
  ["GITHUB_TOKEN", /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/u],
  ["AWS_ACCESS_KEY", /(?:AKIA|ASIA)[A-Z0-9]{16}/u],
  ["NEAR_SECRET_LITERAL", /["']ed25519:[1-9A-HJ-NP-Za-km-z]{80,}["']/u],
  ["URL_CREDENTIALS", /https?:\/\/[^\s/:@]+:[^\s/@]+@/u],
];
for (const file of files) {
  if (/(?:^|\/)(?:\.local|\.tools|node_modules|\.next|target|\.near-credentials)(?:\/|$)/u.test(file)
    || /(?:^|\/)(?:\.env(?:\..*)?|credentials\.json)$/u.test(file) && path.basename(file) !== ".env.example"
    || /\.(?:pem|p12|pfx|key)$/iu.test(file)) { blocked.push({ file, code: "PRIVATE_OR_GENERATED_PATH" }); continue; }
  const bytes = await readFile(file);
  if (bytes.includes(0)) { binaries.push({ file, bytes: bytes.length }); continue; }
  const text = bytes.toString("utf8");
  // Exact, reviewed rejection fixture only; do not exempt other credentials or whole test files.
  const fixture = "https://user:password@sources.example/a";
  const fixtureFiles = ["tests/validation/research.test.ts", "scripts/web/check-release-source.mjs"];
  const scanText = fixtureFiles.includes(file) ? text.replace(fixture, "[REVIEWED_SYNTHETIC_INVALID_URL]") : text;
  if (scanText !== text) reviewedFixtures.push({ file, code: "EXACT_SYNTHETIC_URL_REJECTION_FIXTURE" });
  for (const [code, expression] of rules) if (expression.test(scanText)) blocked.push({ file, code });
  if (/[A-Z]:\\Users\\[^\\\s"']+|\/mnt\/[a-z]\/Users\/[^/\s]+|\/home\/[^/\s]+/u.test(text)) privacy.push({ file, code: "LOCAL_USER_PATH_REQUIRES_PUBLICATION_REVIEW" });
}
await mkdir(".local/release-hardening", { recursive: true });
const result = { label: "Bounded candidate-tree pattern/path review; no matched values retained; not exhaustive secret scanning or publication consent", files: files.length, blocked, privacy, binaries, reviewedFixtures };
await writeFile(".local/release-hardening/source-review.json", JSON.stringify(result, null, 2));
await writeFile(".local/release-hardening/candidate-files.txt", files.join("\0") + "\0");
console.log(JSON.stringify({ files: files.length, blocked, privacyFiles: privacy.length, binaryFiles: binaries.length, label: result.label }, null, 2));
if (blocked.length) process.exitCode = 1;
