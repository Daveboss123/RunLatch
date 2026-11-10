import Link from "next/link";
import { Header } from "@/components/runlatch/header";
import { Footer } from "@/components/runlatch/footer";
import { RunIntelligence } from "@/components/runlatch/run-intelligence";
import { PageGuide } from "@/components/runlatch/page-guide";

export default function IntelligencePage() {
  return <><a className="skip-link" href="#main">Skip to content</a><Header /><main id="main" className="intelligence-page page-width">
    <div className="workspace-heading"><div><p className="hero-context">Run Intelligence · read-only</p><h1>Paid is not the same as done.</h1><p>Trace bounded purchases to their recorded outcomes. Keep approval, settlement, task checks and human acceptance separate.</p></div><Link href="/demo#contract-observation" className="button button-secondary">Inspect the contract flow</Link></div>
    <PageGuide title="Read cost and outcome together" summary="Intelligence derives project answers from selected receipts while keeping authorization, settlement, delivery checks and human acceptance separate." steps={["Load the labelled sample or import LOCAL observations.", "Choose project bundles and an optional time range.", "Inspect spend, commitments, blocked reasons and receipt evidence."]} result="A selected project report with real denominators and explicit unavailable evidence." /><RunIntelligence /><noscript><p>JavaScript is required for memory-only receipt inspection. Use the documented LOCAL CLI report and analyze:local workflow instead. No signing or payment is available.</p></noscript>
  </main><Footer /></>;
}
