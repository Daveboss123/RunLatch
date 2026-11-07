"""Offline notice collection from the already approved Linux Cargo registry."""
import hashlib
import json
from pathlib import Path
import re

root = Path(__file__).resolve().parents[2]
packages = {}
for scope in ("contract", "sandbox"):
    metadata = json.loads((root / f".local/release-hardening/cargo-{scope}-metadata.json").read_text())
    for package in metadata["packages"]:
        if package["source"]:
            packages[package["id"]] = package

parts = ["RunLatch cached Linux Cargo source notices\n"
         "Root LICENSE/COPYING/NOTICE files and license directories only.\n"
         "No non-Linux missing registry source or bundled-binary rights inferred.\n"]
inventory = []
for package_id, package in sorted(packages.items()):
    base = Path(package["manifest_path"]).parent
    candidates = []
    for entry in sorted(base.iterdir()):
        if entry.is_symlink():
            continue
        if entry.is_file() and re.match(r"^(license|licence|copying|notice)([._-].*)?$", entry.name, re.I):
            candidates.append(entry)
        if entry.is_dir() and re.match(r"^(licenses?|legal)$", entry.name, re.I):
            candidates.extend(p for p in sorted(entry.rglob("*")) if p.is_file() and not p.is_symlink())
    if package.get("license_file"):
        explicit = base / package["license_file"]
        if explicit.is_file() and explicit.resolve().is_relative_to(base.resolve()):
            candidates.append(explicit)
    notices = []
    for file in sorted(set(candidates)):
        data = file.read_bytes()
        if len(data) > 1_000_000 or b"\0" in data:
            raise RuntimeError("NOTICE_NOT_BOUNDED_TEXT")
        text = data.decode("utf-8")
        name = file.relative_to(base).as_posix()
        notices.append({"file": name, "sha256": hashlib.sha256(data).hexdigest()})
        parts.append(f"\n===== {package['name']} @ {package['version']} / {name} =====\n{text}\n")
    inventory.append({"id": package_id, "name": package["name"], "version": package["version"], "license": package["license"], "notices": notices})

(root / "licenses/cargo-linux-transitive-NOTICES.txt").write_text("".join(parts), encoding="utf-8", newline="\n")
missing = [p["name"] + "@" + p["version"] for p in inventory if not p["notices"]]
result = {"label": "Cached Linux registry notices, not an all-target or binary licence clearance", "packages": len(inventory), "withoutCollectedNotice": missing, "inventory": inventory}
(root / "docs/release/CARGO_NOTICE_INVENTORY.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8", newline="\n")
print(json.dumps({"packages": len(inventory), "withoutCollectedNotice": missing}, indent=2))
