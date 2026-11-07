"use client";

import { fillStyle } from "@/lib/dither/style";
import { formatNear, visualPercent } from "@/lib/preview/money";
import { budgetBreakdown } from "@/lib/purchasing/commitment";
import { useScrollBudget } from "./motion";

export function BudgetPartition({ budget }: { budget: ReturnType<typeof budgetBreakdown> }) {
  const ref = useScrollBudget<HTMLDivElement>();
  const segments = [
    { label: "Settled", value: budget.spent, color: "ink", texture: "solid" },
    { label: "Reserved", value: budget.reserved, color: "orange", texture: "hatched" },
    { label: "Future commitment", value: budget.committed_future, color: "grey", texture: "dotted" },
    { label: "Available to commit", value: budget.available_to_commit, color: "ink", texture: "gradient" },
  ] as const;
  return <div ref={ref} className="budget-partition" data-motion="budget">
    <div className="budget-track" role="img" aria-label={segments.map(s => `${s.label}: ${formatNear(s.value)} NEAR`).join("; ")} data-dither="budget">
      {segments.map(segment => <div key={segment.label} className={`budget-segment segment-${segment.texture}`} style={{ width: visualPercent(segment.value, budget.allocated) }}><span aria-hidden="true" style={fillStyle(segment.texture, { color: segment.color, edge: "left", from: .5, to: .0625, length: 80 })} /></div>)}
    </div>
    <div className="budget-legend">{segments.filter(s => s.value !== "0").map(s => <span key={s.label}><i className={`legend-${s.texture}`} aria-hidden="true" />{s.label}</span>)}</div>
  </div>;
}
