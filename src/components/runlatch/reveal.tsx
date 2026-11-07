"use client";

import { useEntrance } from "./motion";

/** One quiet, optional entrance. Content is visible without JS or motion. */
export function Reveal({ children, className = "", kind = "group" }: { children: React.ReactNode; className?: string; kind?: "group" | "diagram" | "rows" }) {
  const ref = useEntrance<HTMLDivElement>();
  return <div ref={ref} className={`quiet-reveal ${className}`} data-motion={kind}>{children}</div>;
}
