import Link from "next/link";
import { Header } from "@/components/runlatch/header";
import { Footer } from "@/components/runlatch/footer";
import { TestnetWorkspace } from "@/components/runlatch/testnet-workspace";
import "./workspace.css";

export default function TestnetPage() {
  return <><a className="skip-link" href="#main">Skip to content</a><Header /><main id="main" className="testnet-page page-width">
    <div className="workspace-heading"><div><h1>Review the action. Inspect the outcome.</h1><p>Exact human reviews, captured purchase evidence and a selected project report. No wallet or public run is connected by default.</p></div><Link href="/demo#contract-observation" className="button button-secondary">Inspect LOCAL records</Link></div>
    <TestnetWorkspace /><p className="fine-print">JavaScript is required for explicit memory-only reads. No form data is submitted or put in the URL without it. Use the documented LOCAL workflow; no signing is available.</p>
  </main><Footer /></>;
}
