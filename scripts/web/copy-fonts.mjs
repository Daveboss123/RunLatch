import { constants } from "node:fs";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

await mkdir("public/fonts", { recursive: true });
const fonts = [
  ["@fontsource-variable/space-grotesk", "space-grotesk-latin-wght-normal.woff2", "Space-Grotesk"],
  ["@fontsource-variable/dm-sans", "dm-sans-latin-wght-normal.woff2", "DM-Sans"],
  ["@fontsource/ibm-plex-mono", "ibm-plex-mono-latin-400-normal.woff2", "IBM-Plex-Mono"],
];
for (const [pkg, file, name] of fonts) {
  await copyFile(`node_modules/${pkg}/files/${file}`, `public/fonts/${file}`, constants.COPYFILE_EXCL);
  await copyFile(`node_modules/${pkg}/LICENSE`, `public/fonts/${name}-OFL.txt`, constants.COPYFILE_EXCL);
  const bytes = await readFile(`public/fonts/${file}`);
  console.log(`${file}: ${bytes.length} bytes, sha256 ${createHash("sha256").update(bytes).digest("hex")}`);
}
