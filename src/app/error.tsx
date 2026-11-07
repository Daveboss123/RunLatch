"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="page-width loading-page"><h1>The preview could not load.</h1><p>No purchase was submitted. Reload the local preview to try again; an interface error is not a payment failure.</p><button className="button" onClick={reset}>Reload preview</button></main>;
}
