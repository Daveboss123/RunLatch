import { DEMO_TIME, DEMO_EXPIRY, QUOTES } from "../preview/fixtures.ts";
import type { PolicyContext, ProviderRecord } from "./schema.ts";

// Registry identity/recipients are copied from existing canonical fixtures, not inferred from user prose.
const providers: readonly ProviderRecord[] = Object.freeze([QUOTES[0], QUOTES[1]].map(({ input }) => Object.freeze({
  id: input.provider_id, recipient: input.recipient_id, active: true,
  services: Object.freeze([input.service_id]), categories: Object.freeze([input.category]),
})));
/** Hypothetical new allocation. Does not modify the seeded board or observe a live project. */
export const POLICY_DEMO_CONTEXT: PolicyContext = Object.freeze({ project_id: "booking-demo-01", project_revision: "1",
  project_active: true, budget_ceiling: "3000000000000000000000000", allocated_authority: "0",
  now_ns: DEMO_TIME, project_expires_at_ns: DEMO_EXPIRY, providers });
