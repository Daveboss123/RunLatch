/** Offline lockfile inventory, not legal clearance or a binary-distribution audit. */
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const lockBytes = await readFile("package-lock.json");
const lock = JSON.parse(lockBytes.toString("utf8"));
const npm = [];
const noticeParts = ["RunLatch installed npm package notices\nOffline collection of root LICENSE/COPYING/NOTICE files and license directories.\nNot every optional platform package is installed; see dependency inventory.\nMetadata declarations do not resolve trademarks, bundled third-party components or all distribution obligations.\n"];
for (const [location, pkg] of Object.entries(lock.packages).filter(([location]) => location).sort(([a], [b]) => a.localeCompare(b))) {
  let installed = false;
  const notices = [];
  try {
    const local = JSON.parse(await readFile(path.join(location, "package.json"), "utf8"));
    if (local.version !== pkg.version) throw new Error(`INSTALLED_VERSION_MISMATCH:${location}`);
    installed = true;
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (installed) {
    async function collect(relative = "", depth = 0) {
      for (const entry of await readdir(path.join(location, relative), { withFileTypes: true })) {
        if (entry.isSymbolicLink()) continue;
        const next = path.join(relative, entry.name);
        if (entry.isDirectory() && depth < 2 && /^(?:licenses?|legal)$/iu.test(entry.name)) await collect(next, depth + 1);
        else if (entry.isFile() && (/^(?:licen[cs]e|copying|notice)(?:[._-].*)?$/iu.test(entry.name) || depth > 0 && /\.(?:txt|md)$/iu.test(entry.name))) {
          const bytes = await readFile(path.join(location, next));
          if (bytes.length > 1_000_000 || bytes.includes(0)) throw new Error(`NOTICE_NOT_BOUNDED_TEXT:${location}`);
          const file = next.split(path.sep).join("/");
          notices.push({ file, sha256: sha256(bytes) });
          noticeParts.push(`\n===== ${location} @ ${pkg.version} / ${file} =====\n${bytes.toString("utf8")}\n`);
        }
      }
    }
    await collect();
  }
  npm.push({ location, version: pkg.version, license: pkg.license ?? null, source: pkg.resolved ?? null, integrity: pkg.integrity ?? null, dev: !!pkg.dev, optional: !!pkg.optional, os: pkg.os ?? [], cpu: pkg.cpu ?? [], installed, notices });
}

function cargoLock(text) {
  return text.split(/^\[\[package\]\]\s*$/mu).slice(1).map(block => {
    const field = name => block.match(new RegExp(`^${name} = "([^"]+)"`, "mu"))?.[1] ?? null;
    return { name: field("name"), version: field("version"), source: field("source"), checksum: field("checksum") };
  });
}
const cargo = [];
for (const [scope, lockfile] of [["contract", "contracts/runlatch/Cargo.lock"], ["sandbox", "scripts/sandbox/Cargo.lock"]]) {
  const bytes = await readFile(lockfile);
  const metadata = JSON.parse(await readFile(`.local/release-hardening/cargo-${scope}-metadata.json`, "utf8"));
  const packages = cargoLock(bytes.toString("utf8")).map(pkg => {
    const meta = metadata.packages.find(candidate => candidate.name === pkg.name && candidate.version === pkg.version && (candidate.source ?? null) === pkg.source);
    return { ...pkg, license: meta?.license ?? null, licenseFile: meta?.license_file ?? null, evidence: meta ? "LOCAL_LINUX_FILTERED_CARGO_METADATA" : "NOT_IN_LINUX_METADATA_REQUIRES_OTHER_TARGET_REVIEW" };
  });
  cargo.push({ scope, lockfile, lockSha256: sha256(bytes), metadataPlatform: "x86_64-unknown-linux-gnu", packages });
}
const summary = {
  npmPackages: npm.length,
  npmMissingLicense: npm.filter(pkg => !pkg.license).length,
  npmInstalled: npm.filter(pkg => pkg.installed).length,
  npmNotInstalled: npm.filter(pkg => !pkg.installed).length,
  npmInstalledWithoutCollectedNotice: npm.filter(pkg => pkg.installed && !pkg.notices.length).map(pkg => pkg.location),
  cargo: cargo.map(scope => ({ scope: scope.scope, locked: scope.packages.length, metadataCovered: scope.packages.filter(pkg => pkg.license).length, otherTargetUnresolved: scope.packages.filter(pkg => !pkg.license).length })),
};
await mkdir("docs/release", { recursive: true });
await mkdir("licenses", { recursive: true });
await writeFile("docs/release/DEPENDENCY_INVENTORY.json", JSON.stringify({ schemaVersion: 1, label: "Offline exact lockfile and installed notice inventory; not legal clearance. Non-Linux Cargo records and uninstalled npm optional packages are explicitly unresolved for distribution.", npmLockSha256: sha256(lockBytes), summary, npm, cargo }, null, 2) + "\n");
await writeFile("licenses/npm-transitive-NOTICES.txt", noticeParts.join(""));
console.log(JSON.stringify(summary, null, 2));
if (summary.npmMissingLicense) process.exitCode = 1;
