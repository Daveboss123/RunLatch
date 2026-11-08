"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { useDocumentVisible, useInView, usePrefersReducedMotion } from "@/lib/dither/motion";

const tools = [
  // Keep the accurate technology reference; the unverified logo stays outside public/.
  { name: "NEAR", href: "https://near.org/", mark: null },
  { name: "Rust", href: "https://rust-lang.org/", mark: "rust" },
  { name: "Next.js", href: "https://nextjs.org/", mark: "nextdotjs" },
  { name: "React", href: "https://react.dev/", mark: "react" },
  { name: "Tailwind CSS", href: "https://tailwindcss.com/", mark: "tailwindcss" },
  { name: "dithercn", href: "https://dithercn.dev/", mark: "dithercn" },
] as const;

export function BuildStrip() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { rootMargin: "0px" });
  const visible = useDocumentVisible();
  const reduced = usePrefersReducedMotion();
  const [paused, setPaused] = useState(false);
  const [focused, setFocused] = useState(false);
  const running = inView && visible && !reduced && !paused && !focused;
  return <div className="build-strip" ref={ref} data-state={reduced ? "static" : running ? "running" : "paused"} data-manual-pause={paused || focused} aria-label="Technologies actually used in RunLatch" onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <div className="build-strip-heading"><p>Built with</p><span>Tools, not sponsors. NEAR execution is LOCAL.</span><button onClick={() => setPaused(!paused)} aria-pressed={paused}>{paused ? "Resume motion" : "Pause motion"}</button></div>
    <div className="build-strip-window"><div className="build-strip-track" style={{ animationPlayState: running ? "running" : "paused" }}>{[0, 1].map(copy => <div key={copy} className="build-strip-group" aria-hidden={copy === 1 ? "true" : undefined}>{tools.map(tool => <a key={tool.name} href={tool.href} target="_blank" rel="noopener noreferrer" aria-label={`${tool.name} (opens in a new tab)`} tabIndex={copy === 1 ? -1 : 0}>
      {tool.mark ? <Image src={`/marks/${tool.mark}.svg`} width={25} height={25} alt="" aria-hidden="true" unoptimized /> : null}
      <span><strong>{tool.name}</strong></span>
    </a>)}</div>)}</div></div>
  </div>;
}
