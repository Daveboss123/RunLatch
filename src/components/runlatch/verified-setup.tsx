import { EXECUTION } from "@/lib/execution";
import { VERIFIED_TESTNET } from "@/lib/near/verified-demo";

export function VerifiedSetup() {
  const testnet = EXECUTION.NEAR_TESTNET;
  return <section className="verified-setup" aria-labelledby="verified-heading" data-execution-mode={testnet.mode} data-provenance={testnet.provenance}>
    <div className="verified-heading">
      <div>
        <p className="hero-context">Recorded {VERIFIED_TESTNET.recorded_on}</p>
        <h2 id="verified-heading">Four steps are FINAL. The purchase is not.</h2>
        <p>Rows preserve each setup step and the recorded purchase snapshot, not a live balance. Each is an RPC-observed FINAL transaction or the retained record of one signed attempt. A hash, a block height or the word FINAL is never settlement, delivery or acceptance.</p>
      </div>
      <p className="verified-provenance"><strong>{testnet.label}</strong><span>RPC-observed references, recorded as static text. Verify them independently with any NEAR testnet RPC or explorer.</span><code>{testnet.mode}</code></p>
    </div>
    <ol className="verified-steps">
      {VERIFIED_TESTNET.steps.map(s => <li key={s.step} data-state={s.state}>
        <p className="verified-index" aria-hidden="true">{s.step}</p>
        <div className="verified-copy">
          <h3>{s.label} <span className="verified-state">{s.state === "FINAL" ? "FINAL" : "UNRESOLVED"}</span></h3>
          <p>{s.summary}</p>
        </div>
        <dl className="verified-details">{s.details.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl>
        <p className="verified-reference">{s.transaction_hash === null ? null : <><span>Transaction</span><code>{s.transaction_hash}</code></>}
          {s.block_height === null ? <><span>Chain record</span><code>none observed</code></> : <><span>FINAL block</span><code>{s.block_height}</code></>}</p>
      </li>)}
    </ol>
    <p className="fine-print">{VERIFIED_TESTNET.limitation} Gate <code>{VERIFIED_TESTNET.contract_id}</code> · operator <code>{VERIFIED_TESTNET.operator_id}</code>.</p>
  </section>;
}
