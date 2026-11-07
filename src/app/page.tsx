import Link from "next/link";
import { fillStyle } from "@/lib/dither/style";
import { Header } from "@/components/runlatch/header";
import { Footer } from "@/components/runlatch/footer";
import { AnimatedLatch } from "@/components/runlatch/animated-latch";
import { AnimatedHeading } from "@/components/runlatch/animated-heading";
import { RunBoard } from "@/components/runlatch/run-board";
import { Simulator } from "@/components/runlatch/simulator";
import { Receipts } from "@/components/runlatch/receipts";
import { ReportPreview } from "@/components/runlatch/report-preview";
import { BuildStrip } from "@/components/runlatch/build-strip";
import { ArrowIcon, StatusIcon } from "@/components/runlatch/icons";
import { ProblemStory } from "@/components/runlatch/problem-story";
import { CommitmentVisual } from "@/components/runlatch/commitment-visual";
import { PurchaseLifecycle } from "@/components/runlatch/purchase-lifecycle";
import { Reveal } from "@/components/runlatch/reveal";

const questions = [
  ["Can the agent increase its own budget?", "No. The human defines authority. Policy is immutable per capsule; changes require a new owner-reviewed capsule. AI explanations cannot activate policy or override a hard denial."],
  ["Does paying prove the purchase was useful?", "No. Approval, native settlement, provisioning evidence, objective checks and human acceptance are separate facts. A fixture check or a hash cannot make external delivery true."],
  ["What happens when a project is withdrawn?", "Owner-authenticated state prevents future authorization. It cannot recall an already-scheduled transfer. Pending records and future commitments are not discarded on withdrawal, expiry or a timeout."],
  ["What if a payment outcome is unknown?", "The reservation remains fail-closed. A private callback must inspect the actual transfer outcome. No timer, browser error or owner-supplied outcome can trigger an automatic release or resend."],
  ["Is this a deployed NEAR or mainnet demo?", "No. This interface is credential-free and seeded. The Rust contract has LOCAL SDK/Sandbox evidence; no public testnet contract or mainnet execution exists. Native NEAR amounts are not pegged to fiat."],
  ["Are private client files stored on-chain?", "Full prompts, artifacts and sensitive client material stay off-chain. Bounded references or hashes detect changes, not truth or confidentiality. The report shares only fields the owner selects."],
];
const enforcement = [
  ["Current project authority", "Owner-authenticated status, revision, expiry and exact capsule binding.", "C / P cases"],
  ["Canonical quote", "Registered provider, pinned recipient, hash, asset, terms and one-use quote.", "Q / G cases"],
  ["Full commitment", "Checked integers; immediate reservations and future authority remain separate.", "P-06–13"],
  ["Replay & resource duplication", "Unique requests and atomic canonical project-resource claims.", "G-09–11 / P-10–11"],
  ["Actual settlement outcome", "Private callbacks inspect the native transfer and resolve at most once.", "S cases"],
];

export default function LandingPage() {
  return <><a className="skip-link" href="#main">Skip to content</a><Header /><main id="main">
    <section className="hero page-width" aria-labelledby="hero-heading">
      <Reveal className="hero-copy"><p className="hero-context" data-motion-item>Project-bound purchasing for AI studios</p><AnimatedHeading id="hero-heading" as="h1" entrance text="Your agents can run. Your budget stays yours." lines={["Your agents can run.", "Your budget stays yours."]} /><p className="hero-description" data-motion-item>Give an agent a client project, not a blank cheque. Bind each purchase to approved terms and bounded authority. Then see what was paid, provisioned and checked.</p><div className="hero-actions" data-motion-item><Link href="/gate" className="button">Try the Gate<ArrowIcon /></Link><Link href="/demo" className="button button-secondary">Inspect a project</Link></div><p className="hero-disclaimer">Credential-free demo. No wallet connection or money movement.</p></Reveal>
      <AnimatedLatch />
    </section>

    <section id="board" className="board-section page-width" aria-labelledby="board-heading"><div className="section-heading"><div><AnimatedHeading id="board-heading" text="A project. Not a blank cheque." /><p>Every request belongs to the work. Every balance has a meaning.</p></div><Link href="/demo" className="text-link">Open demo workspace<ArrowIcon direction="diagonal" /></Link></div><RunBoard /><BuildStrip /></section>

    <section id="problem" className="comparison-section section-space page-width" aria-labelledby="problem-heading"><div className="section-heading narrow-heading"><AnimatedHeading id="problem-heading" text="A spending limit is only the start." lines={["A spending limit", "is only the start."]} /><p>The question isn’t just “Can the agent afford it?” It’s “Does this purchase still belong to the job?”</p></div><ProblemStory /><p className="comparison-limit">Illustrative workflow, not a claim that every unbounded agent overspends. The Rust contract enforces only authenticated state and supported terms.</p></section>

    <div className="section-transition" aria-hidden="true" data-dither="transition" style={fillStyle("gradient", { color: "ink", edge: "bottom", length: 34, from: .28, to: 0 })} />
    <section id="simulator" className="simulator-section section-space" aria-labelledby="simulator-heading"><div className="page-width"><div className="section-heading"><div><AnimatedHeading id="simulator-heading" text="Give the boundary a test." /><p>Change the quote. Push the budget. See which rule keeps the latch closed.</p></div><span className="simulation-label">Local preview · no chain call</span></div><Simulator /><noscript><p className="notice">JavaScript is required for the interactive simulator. The board, receipts and documentation remain readable. Use the documented local tests to evaluate the actual Rust Gate.</p></noscript></div></section>

    <section id="commitment" className="commitment-section section-space page-width" aria-labelledby="commitment-heading"><div className="section-heading"><div><AnimatedHeading id="commitment-heading" text="A small first charge can be a long commitment." lines={["A small first charge.", "A long commitment."]} /><p>A Client Work Capsule checks what is due now—and what you are agreeing to later.</p></div></div><CommitmentVisual /></section>

    <section id="lifecycle" className="lifecycle-section section-space page-width" aria-labelledby="lifecycle-heading"><div className="section-heading"><div><AnimatedHeading id="lifecycle-heading" text="A purchase is not one success state." /><p>Follow the boundary from human authority to an explicit record of acceptance.</p></div></div><Reveal kind="diagram"><PurchaseLifecycle /></Reveal></section>

    <section id="receipts" className="receipts-section section-space page-width" aria-labelledby="receipts-heading"><div className="receipt-intro"><AnimatedHeading id="receipts-heading" text="Paid is a fact. Delivered needs evidence." /><p>An Outcome Receipt keeps approval, settlement, provisioning, objective checks and human acceptance separate.</p><div className="receipt-principle"><StatusIcon state="neutral" /><p>A successful transfer does not prove a database exists. A fixture check does not prove a client is satisfied.</p></div><Link href="/docs#outcomes" className="text-link">Read the evidence boundaries<ArrowIcon direction="diagonal" /></Link></div><Receipts /></section>

    <section id="intelligence" className="intelligence-section section-space page-width" aria-labelledby="intelligence-heading"><div className="section-heading"><div><AnimatedHeading id="intelligence-heading" text="A clear account of the work." /><p>Run Intelligence starts with project costs and inspectable outcomes, not an opaque score.</p></div></div><ReportPreview /></section>

    <div id="capabilities" className="legacy-anchor" aria-hidden="true" />

    <section id="proof" className="proof-section section-space" aria-labelledby="proof-heading"><div className="page-width"><div className="section-heading"><div><AnimatedHeading id="proof-heading" text="Built to be checked." /><p>Concrete enforcement. Explicit limits. Local evidence you can reproduce.</p></div><Link href="/docs#reproduce" className="text-link">Run the tests<ArrowIcon direction="diagonal" /></Link></div><p className="fine-print">Recorded checkpoint · 7 November 2026 · not a live test counter</p><div className="proof-summary"><div><strong>140</strong><span>Rust / SDK tests</span><small>Mocked host outcomes · backend checkpoint</small></div><div><strong>114</strong><span>Node regression tests</span><small>Exact hashes, validation, commitments & reports</small></div><div className="sandbox-proof"><StatusIcon state="good" /><strong>LOCAL Sandbox</strong><span>Recorded all-mode backend checkpoint</span><small>7 November 2026 · not a live status or public testnet claim</small></div></div>
      <div className="enforcement-grid"><div><h3>The Rust contract checks</h3><ul className="enforcement-list">{enforcement.map(([title, text, cases]) => <li key={title}><div><strong>{title}</strong><p>{text}</p></div><code>{cases}</code></li>)}</ul></div><aside className="limits"><h3>What it cannot promise</h3><ul><li>An owner-held deployment key can replace the contract. This is not immutable custody.</li><li>A callback catastrophe retains pending reservations. There is no timeout refund or automatic recovery.</li><li>Fixture provisioning and owner-recorded checks are not independent external-delivery proof.</li><li>No mainnet, fiat peg, supplier cancellation, AP2 conformance or security audit is claimed.</li></ul><div className="deployment-status"><span>Public testnet contract</span><strong>Not deployed</strong><p>No invented account or explorer link.</p></div></aside></div>
    </div></section>

    <section id="architecture" className="architecture-section section-space page-width" aria-labelledby="architecture-heading"><div className="section-heading"><div><AnimatedHeading id="architecture-heading" text="The boundary is the architecture." /><p>The model proposes. The contract authorizes. Evidence says only what it can prove.</p></div></div><ol className="architecture-flow"><li><span>Proposal</span><h3>AI / scripted agent</h3><p>References the task and quote. Cannot raise its budget or approve itself.</p></li><li><span>Authority</span><h3>Rust Gate on NEAR</h3><p>Loads canonical terms, checks current policy and reserves before a supported transfer.</p></li><li><span>Observation</span><h3>Outcome evidence</h3><p>Private settlement callback, off-chain fixture checks and explicit owner records.</p></li></ol><div className="documentation-links"><Link href="/docs#architecture"><span>Architecture & accounting</span><ArrowIcon direction="diagonal" /></Link><Link href="/docs#contract"><span>Contract API & limits</span><ArrowIcon direction="diagonal" /></Link><Link href="/docs#reproduce"><span>Setup & local reproduction</span><ArrowIcon direction="diagonal" /></Link><Link href="/docs#privacy"><span>Security & privacy assumptions</span><ArrowIcon direction="diagonal" /></Link></div><p className="fine-print">Public repository: not published. Documentation is available locally; public actions require separate human approval.</p></section>

    <section id="questions" className="faq-section section-space page-width" aria-labelledby="questions-heading"><div><AnimatedHeading id="questions-heading" text="Clear boundaries. Including our own." /><p>Useful questions before you delegate.</p><span className="demo-tag">LOCAL prototype</span></div><div className="faq-list">{questions.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><div className="faq-answer"><p>{answer}</p></div></details>)}</div></section>
  </main><Footer /></>;
}
