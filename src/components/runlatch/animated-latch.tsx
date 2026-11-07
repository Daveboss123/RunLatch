"use client";

import { useId, useRef, useState, type PointerEvent } from "react";
import { DitherShader } from "@/lib/dither/shader";
import { usePrefersReducedMotion } from "@/lib/dither/motion";
import { LatchField } from "./latch-field";
import { useDisplaySettings } from "./display-settings";
import { MOTION } from "./motion";
import { useDemoState } from "./demo-state";

const PALETTE = ["--dither-paper", "--dither-ink", "--dither-accent"] as const;

// Smooth tones only. The installed engine supplies quantization and Bayer cells.
const FIELD = `
float roundedAuthority(vec2 p, vec2 c, vec2 halfSize, float radius) {
  vec2 d = abs(p - c) - halfSize + radius;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - radius;
}
float field(vec2 uv, vec2 res, float t) {
  float aspect = res.x / res.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float cell = 1.0 / res.y;
  float paths = 0.0;
  float approach = smoothstep(.02, .30, uv.x);
  for (int i = 0; i < 6; i++) {
    float k = float(i);
    float y = mix(.18 + k * .125, .50, approach);
    y += .018 * sin(uv.x * 10.0 + k * .8 - t * .16) * (1.0 - approach);
    float stream = exp(-pow((p.y - y) / .014, 2.0));
    float travel = .22 + .45 * pow(.5 + .5 * sin(uv.x * 18.0 - t * .32 + k), 2.0);
    paths = max(paths, stream * travel * (1.0 - smoothstep(.29, .38, uv.x)));
  }
  float box = roundedAuthority(p, vec2(.445 * aspect, .50), vec2(.225 * aspect, .30), .055);
  float boundary = exp(-pow(box / (.007 + cell), 2.0)) * .65;
  float interior = (1.0 - smoothstep(-.02, .01, box));
  vec2 focus = vec2(passageFocus.x * aspect, 1.0 - passageFocus.y);
  float lens = exp(-dot(p - focus, p - focus) * 6.0);
  float atmosphere = fbm(p * 2.0 + vec2(t * .006, -t * .004));
  float body = interior * (.03 + .18 * atmosphere + .22 * lens) * smoothstep(.0, .28, abs(p.y - .5));
  float passage = exp(-pow((p.y - .50) / .02, 2.0)) * smoothstep(.27, .38, uv.x) * (1.0 - smoothstep(.71, .77, uv.x)) * .56;
  float gate = exp(-pow((uv.x - .668) * aspect / .015, 2.0)) * (1.0 - smoothstep(.24, .29, abs(p.y - .5)));
  float receiptBox = roundedAuthority(p, vec2(.835 * aspect, .50), vec2(.115 * aspect, .235), .02);
  float receipt = exp(-pow(receiptBox / (.004 + cell), 2.0)) * .35;
  for (int i = 0; i < 6; i++) {
    float k = float(i);
    float row = exp(-pow((p.y - (.655 - k * .061)) / .011, 2.0));
    float right = .91 - mod(k, 3.0) * .019;
    row *= smoothstep(.747, .756, uv.x) * (1.0 - smoothstep(right - .01, right, uv.x));
    receipt = max(receipt, row * (.72 - k * .045));
  }
  float signalX = mix(.05, .91, passageProgress);
  // A blocked/review-needed preview never paints a signal past the Gate.
  if (gateDecision > .5) signalX = min(signalX, .65);
  float signal = exp(-dot(p - vec2(signalX * aspect, .5), p - vec2(signalX * aspect, .5)) / .002) * .82;
  float edge = smoothstep(.0, .04, uv.x) * (1.0 - smoothstep(.96, 1.0, uv.x));
  return clamp(max(max(max(paths, boundary), max(body, passage)), max(max(receipt, gate * .85), signal)) * edge, 0.0, .92);
}
`;
const COLOR_FIELD = `
vec3 colorField(vec2 uv, vec2 res, float t) {
  float accent = (1.0 - smoothstep(.012, .035, abs(uv.x - .668))) * (1.0 - smoothstep(.24, .29, abs(uv.y - .5)));
  // paletteColor reads entries AFTER paper: 0 = ink, 1 = lime in this palette.
  return mix(paletteColor(0.0).rgb, paletteColor(1.0).rgb, accent);
}
`;

export function AnimatedLatch() {
  const { textures } = useDisplaySettings();
  const reduced = usePrefersReducedMotion();
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(70);
  const [focus, setFocus] = useState<readonly [number, number]>([.5, .5]);
  const lastPointer = useRef(0);
  const id = useId();
  const { current } = useDemoState();
  const decision = current && "result" in current ? current.result.decision : "PENDING";
  const gateDecision = decision === "APPROVED" ? 0 : decision === "DENIED" ? 2 : 1;
  const stage = progress < 25 ? 0 : progress < 63 ? 1 : progress < 80 ? 2 : 3;
  const stages = ["Agent request", "Bounded capsule", "Gate", "Outcome Receipt"];
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (paused || reduced || !textures || event.pointerType === "touch") return;
    const now = performance.now();
    if (now - lastPointer.current < 1000 / MOTION.heroFps) return;
    lastPointer.current = now;
    const box = event.currentTarget.getBoundingClientRect();
    setFocus([Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)), Math.max(0, Math.min(1, (event.clientY - box.top) / box.height))]);
  };
  return <div className="hero-visual" role="group" aria-label="Interactive request-to-receipt illustration">
    <div className="animated-latch-frame" aria-hidden="true" data-preview-decision={decision} data-focus-x={focus[0].toFixed(3)} onPointerMove={move} onPointerLeave={() => setFocus([.5, .5])}>
      <DitherShader data-dither="hero" className="animated-latch" field={FIELD} colorField={COLOR_FIELD} uniforms={{ passageFocus: focus, passageProgress: progress / 100, gateDecision }} palette={PALETTE} matrix="bayer8" cell={2} fps={MOTION.heroFps} speed={1} animate={textures && !paused} stillTime={MOTION.heroStillTime} fallback={<LatchField id={id} progress={gateDecision > 0 ? Math.min(progress / 100, .69) : progress / 100} focus={focus} />} />
    </div>
    <div className="hero-visual-caption" aria-hidden="true">{stages.map((label, index) => <span key={label} data-active={stage === index}>{label}</span>)}</div>
    <p className="passage-decision">{decision === "APPROVED" ? "Eligible preview · not a payment" : decision === "DENIED" ? "Denied preview · signal stops at the Gate" : "Awaiting preview / approval · no passage authorized"}</p>
    <div className="illustration-controls"><label htmlFor={`${id}-position`}>Explore the passage<input id={`${id}-position`} type="range" min="0" max="100" step="1" value={progress} aria-valuetext={stages[stage]} onChange={event => setProgress(Number(event.target.value))} /></label><button type="button" onClick={() => setPaused(value => !value)} disabled={reduced || !textures}>{reduced || !textures ? "Motion reduced" : paused ? "Play illustration" : "Pause illustration"}</button><span>Illustrative · no payment</span></div>
  </div>;
}
