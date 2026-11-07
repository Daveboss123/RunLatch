"use client";

import type { CSSProperties } from "react";
import { MOTION, useEntrance, useScrollInk } from "./motion";

/** Each line is real selectable text, read once. No scrambled/duplicated words. */
export function AnimatedHeading({ text, lines, as = "h2", id, entrance = false }: {
  text: string; lines?: readonly string[]; as?: "h1" | "h2"; id?: string; entrance?: boolean;
}) {
  const Tag = as;
  const entranceRef = useEntrance<HTMLHeadingElement>();
  const inkRef = useScrollInk<HTMLHeadingElement>(!entrance);
  const ref = entrance ? entranceRef : inkRef;
  return <Tag ref={ref} id={id} className={`animated-heading ${entrance ? "hero-heading" : "section-title"}`}>
    {(lines ?? [text]).map((line, index) => <span className="heading-line" key={line}><span className="heading-line-text" style={{ "--line-delay": `${index * MOTION.staggerMs}ms` } as CSSProperties}>{line}{" "}</span></span>)}
  </Tag>;
}
