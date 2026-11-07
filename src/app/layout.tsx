import type { Metadata } from "next";
import localFont from "next/font/local";
import { DisplayProvider } from "@/components/runlatch/display-settings";
import { DemoProvider } from "@/components/runlatch/demo-state";
import "./globals.css";

const heading = localFont({ src: "../../public/fonts/space-grotesk-latin-wght-normal.woff2", variable: "--font-heading", weight: "300 700", display: "swap" });
const body = localFont({ src: "../../public/fonts/inter-latin-wght-normal.woff2", variable: "--font-body", weight: "100 900", display: "swap" });
const mono = localFont({ src: "../../public/fonts/ibm-plex-mono-latin-400-normal.woff2", variable: "--font-mono", weight: "400", display: "swap" });

export const metadata: Metadata = {
  title: "RunLatch | Project-bound purchasing for agents",
  description: "Bound agent purchases to a client project, canonical quote and full commitment. Inspect approval, settlement and outcome evidence separately.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-scroll-behavior="smooth" className={`dark ${heading.variable} ${body.variable} ${mono.variable}`}><body><DisplayProvider><DemoProvider>{children}</DemoProvider></DisplayProvider></body></html>;
}
