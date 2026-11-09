"use client";

import { useEffect, useRef, useState } from "react";
import { fillStyle } from "@/lib/dither/style";
import { usePrefersReducedMotion } from "@/lib/dither/motion";
import { Status } from "./status";

const steps = [
  { title: "Give the agent a job.", text: "A fictional studio authorizes infrastructure for a client booking website. One project, one assigned agent, one immutable capsule policy.", without: "The agent has an instruction and a spending cap.", with: "The owner defines project-bound authority.", state: "Task assigned", code: "booking-demo-01 · revision 1" },
  { title: "Pin the commercial terms.", text: "A registered provider publishes a one-use quote. Recipient, service, amount and fixed-term obligations belong to that quote—not to the agent’s explanation.", without: "A suggested price may leave the rest of the terms implicit.", with: "A canonical quote binds the whole purchase.", state: "Quote referenced", code: "database-demo-01 · 0.50 NEAR" },
  { title: "Then the work changes.", text: "The owner withdraws the project’s authority. The agent’s earlier instruction still exists, but it is no longer current authorization.", without: "The old instruction is still in the agent’s context.", with: "An authenticated project revision invalidates old authority.", state: "Authority withdrawn", code: "project revision 2 · illustrative" },
  { title: "An old request reaches the Gate.", text: "Being under a cap is not enough. The Gate checks current project state, canonical terms, agent identity, uniqueness and full commitment before any reservation.", without: "An amount-only cap cannot express project freshness.", with: "The outdated capsule reference fails a mandatory check.", state: "Freshness check fails", code: "STALE_PROJECT_REVISION" },
  { title: "No new payment. A clear reason.", text: "A hard denial cannot be overridden by owner approval. Existing scheduled transfers are a different matter: withdrawal cannot recall them or discard their pending records.", without: "The cap alone cannot explain whether the job still authorizes it.", with: "No new reservation or transfer for this denied request.", state: "Request denied", code: "DENIED · no new hold" },
] as const;

export function ProblemStory() {
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    const element = root.current;
    if (!element || reduced || !window.IntersectionObserver) return;
    let observer: IntersectionObserver | null = null;
    const observe = () => {
      observer?.disconnect();
      if (window.innerWidth <= 900) return;
      // Percent root margins resolve against WIDTH. Use pixels for a height-based band.
      const inset = Math.round(window.innerHeight * .45);
      observer = new IntersectionObserver(entries => {
        const visible = entries.filter(entry => entry.isIntersecting);
        if (visible.length) {
          visible.sort((a, b) => Math.abs(a.boundingClientRect.top + a.boundingClientRect.height / 2 - innerHeight / 2) - Math.abs(b.boundingClientRect.top + b.boundingClientRect.height / 2 - innerHeight / 2));
          setActive(Number((visible[0].target as HTMLElement).dataset.step));
        }
      }, { rootMargin: `-${inset}px 0px -${inset}px 0px`, threshold: 0 });
      element.querySelectorAll("[data-step]").forEach(step => observer?.observe(step));
    };
    observe();
    window.addEventListener("resize", observe, { passive: true });
    return () => { observer?.disconnect(); window.removeEventListener("resize", observe); };
  }, [reduced]);
  const step = steps[active];
  return <div className="problem-story" ref={root}>
    <div className="story-visual" data-active-step={active}>
      <div className="story-visual-top"><span>One request. Two boundaries.</span><span className="demo-tag">Illustrative</span></div>
      <div className="story-paths"><div className="story-unbounded"><span>Amount-only cap</span><div className="story-path-line" aria-hidden="true" /><p>{step.without}</p></div><div className="story-bounded"><span>RunLatch Gate</span><div className="story-path-line" aria-hidden="true"><i style={fillStyle("gradient", { color: "--dither-accent", from: .8, to: .25, length: 14 })} /></div><p>{step.with}</p></div></div>
      <div className="story-state" key={active}><Status tone={active >= 3 ? "bad" : active === 2 ? "pending" : "neutral"}>{step.state}</Status><code>{step.code}</code></div>
      <div className="story-controls" aria-label="Explore the illustrative request timeline">{steps.map((item, index) => <button key={item.title} aria-label={`Story step ${index + 1}: ${item.title}`} aria-pressed={active === index} onClick={() => setActive(index)}>{index + 1}</button>)}</div>
      <p className="fine-print">Explanation, not a chain run. An external message never changes trusted project authority.</p>
    </div>
    <ol className="story-steps">{steps.map((item, index) => <li key={item.title} data-step={index} data-active={active === index}><span className="story-step-number">{index + 1}</span><h3>{item.title}</h3><p>{item.text}</p></li>)}</ol>
  </div>;
}
