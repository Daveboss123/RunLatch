import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const mode = process.argv[2];
if (!["dev", "build", "start"].includes(mode)) throw new Error("Unknown Next command");
// No .env files or signing configuration are needed by this local preview.
const args = [require.resolve("next/dist/bin/next"), mode];
if (mode !== "build") args.push("--hostname", "127.0.0.1", "--port", "3000");
const child = spawn(process.execPath, args, {
  stdio: "inherit",
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
});
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
