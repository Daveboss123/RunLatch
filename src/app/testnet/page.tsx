import Link from "next/link";
import { Header } from "@/components/runlatch/header";
import { Footer } from "@/components/runlatch/footer";
import { TestnetWorkspace } from "@/components/runlatch/testnet-workspace";
import { VerifiedSetup } from "@/components/runlatch/verified-setup";
import { PageGuide } from "@/components/runlatch/page-guide";
import "./workspace.css";

export default function TestnetPage() {
  return <><a className="skip-link" href="#main">Skip to content</a><Header /><main id="main" className="testnet-page page-width">
    <div className="workspace-heading"><div><h1>Review the action. Inspect the outcome.</h1><p>Exact human reviews, captured purchase evidence and a selected project report. A compatible testnet wallet signs one reviewed action at a time; RunLatch never holds the key.</p></div><Link href="/demo#contract-observation" className="button button-secondary">Inspect LOCAL records</Link></div>
    <PageGuide title="Inspect evidence or review an action" summary="Start with the recorded testnet references below. Wallet connection is optional and grants no project or spending authority." steps={["Inspect the four FINAL setup steps and the unresolved purchase.", "For a read, load the target and explicitly permit only the selected RPC requests.", "If preparing a human action, review its exact terms before any separate external-wallet confirmation."]} result="Recorded references, an unsigned review or a readback—not an assumed payment." /><VerifiedSetup /><TestnetWorkspace /><p className="fine-print">JavaScript is required for explicit reads and wallet prompts. An installed compatible testnet extension is required only for optional browser signing. The recorded demo used the human terminal; connecting here does not repeat it or resolve its purchase. No private key or seed phrase belongs in this app. If connection is unavailable, use the inline guidance and continue inspecting records without a wallet.</p>
  </main><Footer /></>;
}
