import Link from "next/link";
import { LatchMark, ArrowIcon } from "./icons";
import { TextureToggle } from "./display-settings";
import { Reveal } from "./reveal";
import { AnimatedHeading } from "./animated-heading";
import { FillPattern } from "@/lib/dither/fill";

export function Footer({ showClosing = true }: { showClosing?: boolean }) {
  return <footer className="site-footer">{showClosing ? <div className="footer-closing page-width"><div className="closing-dither" data-dither="closing" aria-hidden="true"><svg viewBox="0 0 180 36" fill="none"><defs><FillPattern id="footer-passage-echo" fill="gradient" color="ink" cell={2} level={.55} floor={.08} ramp={{ edge: "left", at: 0, length: 180 }} /></defs><path d="M0 18h72m12 0h96" stroke="url(#footer-passage-echo)" strokeWidth="12" /><path d="M78 4v28" stroke="var(--color-accent)" strokeWidth="3" /></svg></div><Reveal className="closing-content"><AnimatedHeading text="Keep the job moving. Keep the authority yours." lines={["Keep the job moving.", "Keep the authority yours."]} entrance /><div className="closing-next"><p>One project. Approved terms. A record that separates payment from outcome.</p><div className="hero-actions"><Link href="/gate" className="button">Try the Gate<ArrowIcon /></Link><Link href="/docs" className="text-link">Read how it works<ArrowIcon direction="diagonal" /></Link></div><small>Browser fixture · no wallet required</small></div></Reveal></div> : null}
    <div className="footer-directory"><div className="page-width footer-directory-grid"><div className="footer-about"><Link href="/" className="brand footer-brand"><LatchMark />RunLatch</Link><p>Project-bound purchasing authority and outcome accountability for AI-powered businesses.</p><p>LOCAL prototype. Native NEAR only. No public deployment, production custody or security audit.</p><TextureToggle /></div>
      <nav aria-label="Footer product"><h3>Product</h3><Link href="/demo">Demo workspace</Link><Link href="/gate">Client Work Capsule</Link><Link href="/#receipts">Outcome Receipts</Link><Link href="/#intelligence">Project intelligence</Link></nav>
      <nav aria-label="Footer reading"><h3>Read</h3><Link href="/docs#enforcement">Enforcement & limits</Link><Link href="/docs#outcomes">Evidence boundaries</Link><Link href="/docs#privacy">Privacy assumptions</Link><Link href="/docs#credits">Asset credits</Link></nav>
      <nav aria-label="Footer development"><h3>Build</h3><Link href="/docs#architecture">Architecture</Link><Link href="/docs#contract">Contract API</Link><Link href="/docs#reproduce">Reproduce locally</Link><a href="https://nearhackathon.com/" rel="noreferrer">NEAR HACKATHON</a></nav>
    </div></div><div className="page-width footer-bottom"><span>RunLatch · provisional name · 2026</span><span>Built for NEAR HACKATHON 2026</span><span>Repository not published · no mainnet actions</span></div><p className="page-width trademark-note">Vercel, the Vercel design, Next.js and related marks, designs and logos are trademarks or registered trademarks of Vercel, Inc. or its affiliates in the US and other countries. Tools shown do not imply sponsorship or endorsement.</p>
  </footer>;
}
