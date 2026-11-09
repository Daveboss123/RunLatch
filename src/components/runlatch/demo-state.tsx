"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEMO_DOMAIN, QUOTES, SCENARIOS, SCENARIO_PRESETS, demoContext, type Scenario } from "@/lib/preview/fixtures";
import { commercialQuoteHash } from "@/lib/purchasing/hashing";
import { budgetBreakdown } from "@/lib/purchasing/commitment";
import { evaluateGate } from "@/lib/preview/gate";
import { parseNear } from "@/lib/preview/money";

type Preview = { key: string; result: ReturnType<typeof evaluateGate>; hash: string; submitted_hash: string; balances: ReturnType<typeof budgetBreakdown> } | { key: string; error: string };
function usePreviewState() {
  const [scenario, setScenario] = useState<Scenario>("valid");
  const [budget, setBudget] = useState("3");
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [receipt, setReceipt] = useState("database");
  const key = `${scenario}:${budget}:${quoteIndex}`;
  const q = QUOTES[quoteIndex].input;
  useEffect(() => {
    let cancelled = false;
    async function evaluate() {
      try {
        const hash = await commercialQuoteHash({ input: q, publisher_id: q.recipient_id, schema_version: 2 }, DEMO_DOMAIN.network, DEMO_DOMAIN.contract);
        const context = demoContext(q, hash, budget, scenario);
        if (BigInt(parseNear(budget)) < BigInt(parseNear("0.7"))) throw new Error("Enter at least 0.70 NEAR to cover this demo's existing settled and reserved amounts.");
        if (scenario === "tamper") context.expected_quote_hash = await commercialQuoteHash({ input: { ...q, recipient_id: "altered.fixture.testnet" }, publisher_id: q.recipient_id, schema_version: 2 }, DEMO_DOMAIN.network, DEMO_DOMAIN.contract);
        const result = evaluateGate(context);
        if (!cancelled) setPreview({ key, result, hash, submitted_hash: context.expected_quote_hash, balances: budgetBreakdown(context.capsule) });
      } catch (error) {
        if (!cancelled) setPreview({ key, error: error instanceof Error ? error.message : "The local preview could not be evaluated. Reset the inputs to try again." });
      }
    }
    void evaluate();
    return () => { cancelled = true; };
  }, [key, budget, scenario, q]);
  const current = preview?.key === key ? preview : null;
  return useMemo(() => ({ scenario, budget, quoteIndex, q, current, receipt, setReceipt, setBudget,
    selected: SCENARIOS.find(s => s.id === scenario)!,
    preset: SCENARIO_PRESETS[scenario],
    choose: (id: Scenario) => { const preset = SCENARIO_PRESETS[id]; setScenario(id); setQuoteIndex(preset.quote_index); setBudget(preset.allocation); },
    selectQuote: (index: number) => { if (Number.isInteger(index) && index >= 0 && index < QUOTES.length) { setQuoteIndex(index); setScenario(index === 2 ? "recurring" : index === 3 ? "expired" : index === 4 ? "unbounded" : index === 5 ? "concurrent" : "valid"); } },
  }), [scenario, budget, quoteIndex, q, current, receipt]);
}
const DemoContext = createContext<ReturnType<typeof usePreviewState> | null>(null);
/** Proposal preview and seeded receipt selection are separate; neither mutates the ledger. */
export function DemoProvider({ children }: { children: ReactNode }) {
  const state = usePreviewState();
  return <DemoContext value={state}>{children}</DemoContext>;
}
export function useDemoState() {
  const state = useContext(DemoContext);
  if (!state) throw new Error("Demo controls require DemoProvider");
  return state;
}
