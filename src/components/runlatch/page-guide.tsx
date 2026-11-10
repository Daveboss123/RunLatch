import { fillStyle } from "@/lib/dither/style";

export function PageGuide({ title, summary, steps, result }: { title: string; summary: string; steps: readonly string[]; result: string }) {
  return <section className="page-guide" aria-labelledby={`page-guide-${title.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "-")}`}>
    <div className="page-guide-signal" aria-hidden="true" style={fillStyle("gradient", { color: "ink", edge: "left", from: .36, to: .0625, length: 70 })} />
    <div className="page-guide-intro"><span>Use this page</span><h2 id={`page-guide-${title.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "-")}`}>{title}</h2><p>{summary}</p></div>
    <ol>{steps.map(step => <li key={step}>{step}</li>)}</ol>
    <p className="page-guide-result"><strong>You leave with</strong>{result}</p>
  </section>;
}
