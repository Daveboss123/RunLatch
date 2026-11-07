import Link from "next/link";
import { Header } from "@/components/runlatch/header";
import { Footer } from "@/components/runlatch/footer";
import { PolicyEditor } from "@/components/runlatch/policy-editor";

export default function PolicyPage() {
  return <><a className="skip-link" href="#main">Skip to content</a><Header /><main id="main" className="policy-page page-width">
    <div className="workspace-heading"><div><p className="hero-context">Credential-free policy workshop</p><h1>Instructions are not authority.</h1><p>Turn explicit purchasing instructions into checked terms. Review what they allow before approving an immutable local example.</p></div><Link href="/demo" className="button button-secondary">Return to project</Link></div>
    <PolicyEditor /><noscript><p>Interactive drafting requires JavaScript. No policy is activated without it. Use the documented authenticated contract workflow for real authority.</p></noscript>
  </main><Footer /></>;
}
