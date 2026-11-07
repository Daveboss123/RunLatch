import { FillPattern } from "@/lib/dither/fill";

/** Matching request / finite capsule / Gate / receipt composition without WebGL. */
export function LatchField({ id = "hero-latch", progress = .7, focus = [.5, .5] }: { id?: string; progress?: number; focus?: readonly [number, number] }) {
  return <div className="latch-field" aria-hidden="true" data-dither="hero-fallback" data-state="static">
    <svg viewBox="0 0 600 500" fill="none" preserveAspectRatio="none">
      <defs>
        <FillPattern id={`${id}-grain`} fill="gradient" color="ink" cell={3} level={0.9} floor={0.06} ramp={{ edge: "bottom", at: 400, length: 360 }} />
        <FillPattern id={`${id}-fade`} fill="gradient" color="ink" cell={3} level={0.6} floor={0} ramp={{ edge: "right", at: 390, length: 390 }} />
        <FillPattern id={`${id}-lime`} fill="gradient" color="--dither-accent" cell={3} level={0.8} floor={0.1} ramp={{ edge: "right", at: 570, length: 140 }} />
      </defs>
      <g stroke={`url(#${id}-fade)`} strokeWidth="8"><path d="M0 95c80 0 100 155 220 155" /><path d="M0 157c75 0 110 93 220 93" /><path d="M0 220c80 0 110 30 220 30" /><path d="M0 283c75 0 110-33 220-33" /><path d="M0 345c80 0 100-95 220-95" /><path d="M0 408c90 0 110-158 220-158" /></g>
      <rect x="132" y="100" width="270" height="300" rx="28" fill={`url(#${id}-fade)`} opacity={.15 + focus[0] * .2} stroke={`url(#${id}-grain)`} strokeWidth="6" />
      <path d="M220 250h228" stroke={`url(#${id}-grain)`} strokeWidth="8" />
      <rect x="396" y="115" width="10" height="270" fill="var(--color-accent)" />
      <rect x="432" y="133" width="138" height="234" rx="10" stroke={`url(#${id}-grain)`} strokeWidth="4" />
      <g stroke={`url(#${id}-grain)`} strokeWidth="10"><path d="M450 174h97" /><path d="M450 204h85" /><path d="M450 235h74" /><path d="M450 265h97" /><path d="M450 296h85" /><path d="M450 326h74" /></g>
      <rect x={30 + progress * 516} y="236" width="10" height="28" fill="var(--color-ink)" />
    </svg>
  </div>;
}
