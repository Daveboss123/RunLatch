import { access, mkdir, rename } from "node:fs/promises";
import path from "node:path";

// shadcn4.23 resolves registry:file targets under src in this alias setup.
// Move only the exact new skill files it generated, never overwrite a destination.
const names = ["SKILL.md", ...["engine-api", "examples", "fields", "landing-pages", "placement", "quality", "recipes", "theme"].map(name => `references/${name}.md`)];
for (const folder of [".agents", ".claude"]) {
  for (const name of names) {
    const from = path.join("src", folder, "skills/dithercn", name);
    const to = path.join(folder, "skills/dithercn", name);
    await access(from);
    try { await access(to); throw new Error(`Refusing to overwrite ${to}`); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    await mkdir(path.dirname(to), { recursive: true });
    await rename(from, to);
    console.log(`Moved ${from} -> ${to}`);
  }
}
