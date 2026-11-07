import Link from "next/link";
import { Header } from "@/components/runlatch/header";
import { RunBoard } from "@/components/runlatch/run-board";
import { Footer } from "@/components/runlatch/footer";
import { ArrowIcon } from "@/components/runlatch/icons";
import { DemoWalkthrough } from "@/components/runlatch/demo-walkthrough";
import { ContractObservation } from "@/components/runlatch/contract-observation";

export default function DemoPage() {
  return <><a className="skip-link" href="#main">Skip to content</a><Header /><main id="main" className="demo-workspace page-width"><div className="workspace-heading"><div><p className="hero-context">Local demo workspace</p><h1>Keep the job in view.</h1><p>Inspect imported LOCAL contract records and separate fictional browser fixtures. No signer or public network is connected.</p></div><Link href="/gate" className="button button-secondary">Test the Gate<ArrowIcon /></Link></div><ContractObservation /><noscript><p>JavaScript is required for local file inspection. Use the documented LOCAL CLI read-back instead. No signing or payment is available.</p></noscript><RunBoard dashboard /><p className="policy-entry"><Link href="/policy" className="text-link">Draft and review purchasing rules<ArrowIcon /></Link><span className="fine-print">Separate local workshop; does not edit this seeded capsule.</span></p><DemoWalkthrough /><section className="workspace-boundary"><h2>No hidden financial controls.</h2><p>Imported records and seeded records stay read-only; the walkthrough changes only labelled illustrative browser state. Capsule creation, owner approvals and real purchases are not connected to a wallet. The actual tested local contract workflow uses documented commands.</p><Link href="/docs#reproduce" className="text-link">Read the local workflow<ArrowIcon direction="diagonal" /></Link></section></main><Footer /></>;
}
