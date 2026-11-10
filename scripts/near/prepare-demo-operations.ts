/** Read-only public readiness for the next exact demo actions. No signer, wallet, key access or write method. */
import { createTestnetReader } from "../../src/lib/near/testnet-rpc.ts";
import { DEMO_AGENT_SCOPE, DEMO_CAPSULE_ACTION, DEMO_PROJECT_ACTION, DEMO_QUOTE_ACTION, RUNLATCH_TESTNET_TARGET } from "../../src/lib/near/demo-operations.ts";

const kind = process.argv[2];
if (!new Set(["project", "capsule", "quote", "agent-key"]).has(kind)) throw Error("DEMO_OPERATION_KIND_INVALID");
const reader = createTestnetReader(RUNLATCH_TESTNET_TARGET);
let review;
if (kind === "project") review = await reader.readSetupReview(DEMO_PROJECT_ACTION);
else if (kind === "capsule") review = await reader.readSetupReview(DEMO_CAPSULE_ACTION);
else if (kind === "quote") review = await reader.readSetupReview(DEMO_QUOTE_ACTION);
else review = await reader.readAgentKeyInstallReview(DEMO_AGENT_SCOPE);
console.log(JSON.stringify({ status: "DEMO_OPERATION_UNSIGNED_REVIEW_READY", kind, review,
  signing_enabled: false, grants_payment_authority: false,
  limitation: "Read-only current testnet review. No wallet prompt, signature, key installation, capsule, quote or purchase was created by this command." }, null, 2));
