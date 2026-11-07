import type { SVGProps } from "react";

export function LatchMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 32 32" aria-hidden="true" className={className} {...props}><path d="M5 5h17v7H12v15H5zm14 15h8v7h-8z" fill="currentColor" /></svg>;
}
export function ArrowIcon({ direction = "right" }: { direction?: "right" | "diagonal" }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d={direction === "right" ? "M4 12h15m-6-6 6 6-6 6" : "M6 18 18 6M6 6h12v12"} /></svg>;
}
export function StatusIcon({ state }: { state: "good" | "bad" | "pending" | "neutral" }) {
  return <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    {state === "good" ? <path d="m3 8 3 3 7-7" /> : state === "bad" ? <path d="m4 4 8 8m0-8-8 8" /> : state === "pending" ? <><circle cx="8" cy="8" r="5.5" /><path d="M8 4v4l3 2" /></> : <path d="M3 8h10" />}
  </svg>;
}
