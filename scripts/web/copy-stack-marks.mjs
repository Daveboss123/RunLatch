import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

// Reviewed simple static geometry only; never execute remote SVG/registry content.
const base = "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/";
await mkdir("public/marks", { recursive: true });
for (const name of ["react", "nextdotjs", "tailwindcss", "rust"]) {
  const response = await fetch(`${base}icons/${name}.svg`);
  if (!response.ok) throw new Error(`Cannot obtain reviewed ${name} asset: ${response.status}`);
  const svg = await response.text();
  if (svg.length > 24_000 || !/^<svg role="img" viewBox="0 0 24 24" xmlns="http:\/\/www.w3.org\/2000\/svg"><title>[^<>]+<\/title><path d="[0-9a-zA-Z .,+\-]+"\/><\/svg>\s*$/u.test(svg)) throw new Error(`Unexpected active/complex SVG content in ${name}`);
  await writeFile(`public/marks/${name}.svg`, svg, { flag: "wx" });
  console.log(`${name}: ${svg.length} bytes / sha256 ${createHash("sha256").update(svg).digest("hex")}`);
}
const response = await fetch(`${base}LICENSE.md`);
if (!response.ok) throw new Error("CC0 notice unavailable");
const license = await response.text();
if (!license.startsWith("# CC0 1.0 Universal")) throw new Error("Unexpected license response");
await writeFile("licenses/simple-icons-CC0.md", license, { flag: "wx" });
