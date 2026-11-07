import { FillPattern } from "@/lib/dither/fill";
import { fillStyle } from "@/lib/dither/style";
import Link from "next/link";

export default function SetupPage() {
  return <main className="setup"><h1>Frontend technical checks</h1>
    <p>Local, credential-free preparation. Static SVG and CSS engine surfaces; no WebGL or payment connection.</p>
    <svg width="240" height="100" aria-hidden="true" data-dither="setup-svg"><defs><FillPattern id="setup-gradient" fill="gradient" level={0.75} ramp={{ edge: "right", at: 240, length: 240 }} /></defs><rect width="240" height="100" fill="url(#setup-gradient)" /></svg>
    <div aria-hidden="true" data-dither="setup-css" style={{ height: 40, ...fillStyle("hatched") }} />
    <p><Link href="/">Return to RunLatch</Link></p>
  </main>;
}
