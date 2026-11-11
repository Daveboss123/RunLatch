import Link from "next/link";
import { Header } from "@/components/runlatch/header";
import { Footer } from "@/components/runlatch/footer";
import { TestnetWorkspace } from "@/components/runlatch/testnet-workspace";
import { PageGuide } from "@/components/runlatch/page-guide";
import "./workspace.css";

export default function TestnetPage() {
  return <><a className="skip-link" href="#main">Skip to content</a><Header /><main id="main" className="testnet-page page-width">
    <div className="workspace-heading"><div><h1>Review the action. Inspect the outcome.</h1><p>Exact human reviews, captured purchase evidence and a selected project report. A compatible testnet wallet signs one reviewed action at a time; RunLatch never holds the key.</p></div><Link href="/demo#contract-observation" className="button button-secondary">Inspect LOCAL records</Link></div>
    <PageGuide title="Review, sign and verify one action" summary="The owner workspace binds a human wallet prompt to a fresh exact testnet review. Wallet connection alone grants no project or spending authority." steps={["Load the RunLatch target and connect a compatible injected testnet wallet.", "Prepare and inspect one exact current action.", "Confirm the wallet prompt, then inspect returned identity and current state."]} result="One bounded transaction identity or a fail-closed stop—never a hidden fallback." /><TestnetWorkspace /><p className="fine-print">Browser signing here is optional and limited to the Meteor extension v2 transport; it is not needed for the demo purchase, which is signed in your own terminal with the restricted agent key. No private key or seed phrase belongs in this app. If no compatible extension is detected, an error is expected, not a security failure, and never triggers a fallback key.</p>
  </main><Footer /></>;
}
