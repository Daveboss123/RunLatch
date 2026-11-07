import { constants } from "node:fs";
import { copyFile, readFile, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";

await copyFile("node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2", "public/fonts/inter-latin-wght-normal.woff2", constants.COPYFILE_EXCL);
await copyFile("node_modules/@fontsource-variable/inter/LICENSE", "public/fonts/Inter-OFL.txt", constants.COPYFILE_EXCL);
const bytes = await readFile("public/fonts/inter-latin-wght-normal.woff2");
console.log(`Inter: ${bytes.length} bytes, sha256 ${createHash("sha256").update(bytes).digest("hex")}`);
// Remove only this session's now-unused DM Sans asset after an exact hash check.
const old = "public/fonts/dm-sans-latin-wght-normal.woff2";
const digest = createHash("sha256").update(await readFile(old)).digest("hex");
if (digest !== "9fea608a947e67020c33cad9a6fe3d60c54119dfb8cff87768a8117a15ed7543") throw new Error("Unused font changed; refusing removal");
await unlink(old);
await unlink("public/fonts/DM-Sans-OFL.txt");
