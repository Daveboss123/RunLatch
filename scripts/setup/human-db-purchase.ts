/** Human-terminal ONE-call purchase. --preflight/--check are read-only and never resume, sign or send. */
import { createInterface } from "node:readline/promises";
import { lstat, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createTestnetReader } from "../../src/lib/near/testnet-rpc.ts";
import { DEMO_PURCHASE_ANSWER, DEMO_PURCHASE_TARGET } from "../near/demo-purchase-scope.ts";
import { confirmDemoDbExecution, executeDemoDbPurchase, prepareDemoDbPurchase, readDemoDbIntent, safeDbDirectory } from "../near/demo-purchase-flow.ts";
import { admitHumanDbPurchaseKey, loadHumanDbPurchaseKey } from "./human-db-purchase-key.ts";

const root = fileURLToPath(new URL("../../", import.meta.url)), local = join(root, ".local", "human-key-setup"), directory = join(local, "demo-db-purchase-attempt");
let phase = "LOCAL_PREFLIGHT";
async function check() {
  try { await safeDbDirectory(directory); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") { console.log("DB_PURCHASE_NO_LOCAL_ATTEMPT_NO_SIGNATURE_OR_SEND_BY_THIS_COMMAND"); return; } throw error; }
  const intent = await readDemoDbIntent(directory);
  if (!intent) {
    console.log(JSON.stringify({ status: "DB_PURCHASE_ATTEMPT_WITHOUT_KNOWN_IDENTITY_READBACK_ONLY", target: DEMO_PURCHASE_TARGET,
      rule: "Retain every local marker. No signature/send/resume/release; inspect public journals if needed, never delete or retry." })); return;
  }
  const observation = await createTestnetReader(DEMO_PURCHASE_TARGET).observePurchase(intent);
  console.log(JSON.stringify({ status: "DB_PURCHASE_READ_ONLY_OBSERVATION", intent, observation,
    limitation: "Known exact identity observation only. No signature/send or provisioning/check/acceptance inferred; unproven results never permit retry." }));
}
async function main() {
  const args = process.argv.slice(2), mode = args.length === 0 ? "sign" : args.length === 1 && ["--check", "--preflight"].includes(args[0]) ? args[0] : "invalid";
  if (mode === "invalid") throw Error("DB_PURCHASE_ARGUMENTS_INVALID");
  if (mode === "sign" && (!process.stdin.isTTY || !process.stdout.isTTY)) throw Error("HUMAN_TERMINAL_REQUIRED");
  await safeDbDirectory(join(root, ".local")); await safeDbDirectory(local);
  if (mode === "--check") { phase = "READ_ONLY_OBSERVATION"; await check(); return; }
  try { await lstat(directory); throw Error("DB_PURCHASE_EXISTING_ATTEMPT_READBACK_ONLY"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  phase = "UNSIGNED_PURCHASE_AND_COST_REVIEW";
  const prepared = await prepareDemoDbPurchase();
  if (mode === "--preflight") { console.log(JSON.stringify({ status: "DB_PURCHASE_UNSIGNED_PREFLIGHT_OK", prepared,
    key_loaded: false, signing: false, send: false, attempt_created: false })); return; }
  console.log(JSON.stringify({ prepared, signer: "HUMAN_TERMINAL_FIXED_RESTRICTED_AGENT_KEY_ONLY_NO_FULL_ACCESS_FALLBACK",
    disclosure: "ONE submit_purchase, request db_purchase_demo_1111, zero attached deposit,100Tgas. Rust loads canonical quote1110 and can reserve/pay0.05 native testnet NEAR to db.runlatch-demo-1108.testnet from Capsule1110. Full commitment0.05/future0. Agent gas is separate and bounded by the ordinary function-call key's existing0.05 NEAR gas allowance. No other purchase/setup/provider/owner/acceptance/refund method, mainnet or retry. Successful native transfer/private callback would leave0.25 NEAR; an acknowledgement alone proves neither. No real database provisioning is promised." }, null, 2));
  const terminal = createInterface({ input: process.stdin, output: process.stdout }); let answer: string;
  phase = "HUMAN_EXACT_PURCHASE_PROMPT";
  try { answer = await terminal.question(`Type ${DEMO_PURCHASE_ANSWER} to approve exactly this one restricted testnet call: `); } finally { terminal.close(); }
  if (answer !== DEMO_PURCHASE_ANSWER) { console.log("CANCELLED_NO_KEY_SIGNATURE_OR_SEND"); return; }
  phase = "HUMAN_APPROVAL_AND_PERMANENT_CLAIM";
  const keyApproval = admitHumanDbPurchaseKey(prepared, answer);
  const approval = confirmDemoDbExecution(prepared, { authorization: "HUMAN_APPROVED_EXACT_DEMO_DB_PURCHASE", consent: true,
    review_hash: prepared.review.review_hash, costs: prepared.costs, calls: 1 });
  await mkdir(directory);
  phase = "CLAIMED_SINGLE_RESTRICTED_RUN";
  const result = await executeDemoDbPurchase(directory, approval, { loadKey: () => loadHumanDbPurchaseKey(prepared, keyApproval) });
  console.log(JSON.stringify(result));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    const reason = error instanceof Error && /^[A-Z][A-Z0-9_]{1,80}$/u.test(error.message) ? error.message : "SANITIZED_LOCAL_OR_RPC_FAILURE";
    console.error(`DB_PURCHASE_STOPPED ${reason} phase=${phase}: retain all request/key/attempt markers; --check only. No re-sign/resend/new IDs/full-access or recovery fallback.`); process.exitCode = 1;
  });
}
