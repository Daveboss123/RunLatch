import Link from "next/link";
import { Header } from "@/components/runlatch/header";
import { Footer } from "@/components/runlatch/footer";
import { Simulator } from "@/components/runlatch/simulator";

export default function GatePage() {
  return <><a className="skip-link" href="#main">Skip to content</a><Header /><main id="main" className="gate-page page-width"><div className="workspace-heading"><div><p className="hero-context">Gate testing workspace</p><h1>Test the spending boundary.</h1><p>Try valid, altered, replayed, stale, revoked and recurring requests. Same deterministic browser preview, no signing or payments.</p></div><Link href="/demo" className="button button-secondary">Open the demo</Link></div><Simulator headingLevel={2} /><noscript><p className="notice">JavaScript is required to evaluate this local simulator. No payment is submitted. The documentation has actual Rust reproduction commands.</p></noscript><section className="workspace-boundary"><h2>A preview is not authority.</h2><p>TypeScript explains the policy using reviewed fixtures and exact integer accounting. Rust enforces actual authenticated project/quote state. A browser decision cannot authorize funds, activate policy or set settlement facts.</p><Link href="/docs#reproduce" className="text-link">Read the contract test commands</Link></section></main><Footer showClosing={false} /></>;
}
