import { BROWSER_EXECUTION } from "@/lib/execution";

export function ExecutionLabel() {
  return <p className="execution-label" data-execution-mode={BROWSER_EXECUTION.mode} data-provenance={BROWSER_EXECUTION.provenance}><strong>{BROWSER_EXECUTION.label}</strong><span>{BROWSER_EXECUTION.detail}</span><code>{BROWSER_EXECUTION.mode}</code></p>;
}
