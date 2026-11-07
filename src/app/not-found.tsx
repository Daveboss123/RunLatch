import Link from "next/link";

export default function NotFound() {
  return <main className="page-width loading-page"><h1>This page isn’t here.</h1><p>The local preview has a landing page, demo workspace and documentation.</p><Link href="/" className="button">Return to RunLatch</Link></main>;
}
