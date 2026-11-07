"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { LatchMark, ArrowIcon } from "./icons";
import { ThemeToggle } from "./display-settings";

const links = [{ href: "/demo", label: "Product" }, { href: "/gate", label: "The Gate" }, { href: "/intelligence", label: "Intelligence" }, { href: "/#proof", label: "Evidence" }, { href: "/docs", label: "Docs" }];
export function Header() {
  const menu = useRef<HTMLDetailsElement>(null);
  const [compact, setCompact] = useState(false);
  const pathname = usePathname();
  useEffect(() => {
    const update = () => setCompact(window.scrollY > 24);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  const close = () => { if (menu.current) menu.current.open = false; };
  return <header className="site-header" data-compact={compact}>
    <div className="header-inner">
      <Link href="/" className="brand" aria-label="RunLatch home"><LatchMark />RunLatch</Link>
      <nav className="desktop-nav" aria-label="Main navigation">{links.map(link => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined}>{link.label}</Link>)}</nav>
      <div className="header-actions"><ThemeToggle /><Link href={pathname === "/gate" ? "/demo" : "/gate"} className="button button-small nav-cta">{pathname === "/gate" ? "Inspect a project" : "Try the Gate"}<ArrowIcon /></Link></div>
      <details className="mobile-menu" ref={menu} onKeyDown={event => { if (event.key === "Escape") { close(); menu.current?.querySelector("summary")?.focus(); } }}>
        <summary aria-label="Navigation menu"><svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" aria-hidden="true"><path className="menu-line-top" d="M3 6h14" /><path className="menu-line-bottom" d="M3 13h14" /></svg></summary>
        <nav aria-label="Mobile navigation">{links.map(link => <Link key={link.href} href={link.href} onClick={close} aria-current={pathname === link.href ? "page" : undefined}>{link.label}</Link>)}</nav>
      </details>
    </div>
  </header>;
}
