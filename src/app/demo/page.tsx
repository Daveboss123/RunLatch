import Link from "next/link";
import { Header } from "@/components/runlatch/header";
import { RunBoard } from "@/components/runlatch/run-board";
import { Footer } from "@/components/runlatch/footer";
import { ArrowIcon } from "@/components/runlatch/icons";
import { DemoWalkthrough } from "@/components/runlatch/demo-walkthrough";

export default function DemoPage() {
  return <><a className="skip-link" href="#main">Skip to content</a><Header /><main id="main" className="demo-workspace page-width"><div className="workspace-heading"><div><p className="hero-context">Local demo workspace</p><h1>Keep the job in view.</h1><p>Inspect fictional project records and test a separate browser walkthrough. No signer or public network is connected.</p></div><Link href="/gate" className="button button-secondary">Test the Gate<ArrowIcon /></Link></div><RunBoard dashboard /><DemoWalkthrough /><section className="workspace-boundary"><h2>No hidden financial controls.</h2><p>Seeded records stay read-only; the walkthrough changes only labelled illustrative browser state. Capsule creation, owner approvals and real purchases are not connected to a wallet. The actual tested local contract workflow uses documented commands.</p><Link href="/docs#reproduce" className="text-link">Read the local workflow<ArrowIcon direction="diagonal" /></Link></section></main><Footer /></>;
}
