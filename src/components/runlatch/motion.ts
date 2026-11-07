import { useEffect, useRef } from "react";

/** Durations live in CSS; these are shared composition / observation settings. */
export const MOTION = { staggerMs: 80, heroFps: 24, heroStillTime: 8 } as const;

// One scroll reader for the small set of editorial headings, not a loop per heading.
const inkTargets = new Map<HTMLElement, "ink" | "budget">();
let inkFrame = 0;
let inkMedia: MediaQueryList | null = null;
function paintInk() {
  inkFrame = 0;
  const height = window.innerHeight;
  const reduced = inkMedia?.matches;
  // Batch layout reads before style writes. No React renders during scrolling.
  const values = [...inkTargets].map(([element, kind]) => ({ element, kind, progress: reduced ? 1 : Math.max(0, Math.min(1, (height * (kind === "budget" ? .95 : .9) - element.getBoundingClientRect().top) / (height * (kind === "budget" ? .65 : .36)))) }));
  for (const { element, kind, progress } of values) {
    const value = progress.toFixed(4);
    element.style.setProperty(`--${kind}-progress`, value);
    if (kind === "ink") element.dataset.inkProgress = value;
    else element.dataset.budgetProgress = value;
  }
}
function scheduleInk() {
  if (!inkFrame) inkFrame = requestAnimationFrame(paintInk);
}

/** Readable ink follows position in both scroll directions; no opacity or text copies. */
function useScrollProgress<T extends HTMLElement>(kind: "ink" | "budget", enabled = true) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;
    if (!inkTargets.size) {
      inkMedia = matchMedia("(prefers-reduced-motion: reduce)");
      window.addEventListener("scroll", scheduleInk, { passive: true });
      window.addEventListener("resize", scheduleInk);
      inkMedia.addEventListener("change", scheduleInk);
    }
    inkTargets.set(element, kind);
    scheduleInk();
    return () => {
      inkTargets.delete(element);
      if (!inkTargets.size) {
        window.removeEventListener("scroll", scheduleInk);
        window.removeEventListener("resize", scheduleInk);
        inkMedia?.removeEventListener("change", scheduleInk);
        inkMedia = null;
        cancelAnimationFrame(inkFrame);
        inkFrame = 0;
      }
    };
  }, [enabled, kind]);
  return ref;
}

export function useScrollInk<T extends HTMLElement>(enabled = true) { return useScrollProgress<T>("ink", enabled); }
/** Reversible reveal only; exact ratios and money text never animate. */
export function useScrollBudget<T extends HTMLElement>() { return useScrollProgress<T>("budget"); }

/** Optional, once-only enhancement. Server/no-JS content starts fully readable. */
export function useEntrance<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || !window.IntersectionObserver) return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        element.dataset.seen = "true";
        observer.disconnect();
      }
    }, { threshold: .12 });
    const reduce = () => { if (media.matches) { observer.disconnect(); element.dataset.seen = "true"; } };
    if (media.matches) reduce(); else observer.observe(element);
    media.addEventListener("change", reduce);
    return () => { observer.disconnect(); media.removeEventListener("change", reduce); };
  }, []);
  return ref;
}
