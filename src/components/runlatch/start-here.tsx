import Link from "next/link";
import { AnimatedHeading } from "./animated-heading";
import { ArrowIcon } from "./icons";

const paths = [
  { href: "/gate", title: "Challenge the Gate", detail: "Alter a recipient, reveal a hidden term or push the budget. Inspect the exact rule that stops the request.", source: "Browser simulation" },
  { href: "/demo#contract-observation", title: "Inspect a project", detail: "Explore the fictional workspace, or choose a LOCAL Sandbox file to inspect its purchase and outcome records.", source: "Fixtures or selected LOCAL records" },
  { href: "/intelligence", title: "Explore project costs", detail: "Load the labelled sample or your LOCAL records. See settled costs, pending amounts and the evidence behind each outcome.", source: "Read-only sample or LOCAL report" },
] as const;

export function StartHere() {
  return <section id="try-now" className="try-now section-space page-width" aria-labelledby="try-now-heading">
    <div className="try-now-intro"><AnimatedHeading id="try-now-heading" text="What can I try right now?" />
      <p>Choose a way in. No wallet, private key or payment is needed for these previews.</p>
      <Link href="/testnet" className="text-link">Inspect recorded testnet setup<ArrowIcon direction="diagonal" /></Link>
    </div>
    <ul className="try-now-paths">{paths.map(path => <li key={path.href}><Link href={path.href}>
      <div><h3>{path.title}</h3><p>{path.detail}</p><span>{path.source}</span></div><ArrowIcon direction="diagonal" />
    </Link></li>)}</ul>
    <p className="try-now-boundary">A simulation is not a chain call. LOCAL records are not public testnet evidence. The recorded public purchase remains unresolved.</p>
  </section>;
}
