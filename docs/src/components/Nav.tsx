"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav() {
  const path = usePathname();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText("npm install -g @fiber-dev-kit/cli@0.1.2");
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };
  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link href="/" className="nav-logo"><div className="nav-gem" />fiber-dev-kit</Link>
        <div className="nav-links">
          <Link href="/"     className={`nav-lnk${path === "/"     ? " on" : ""}`}>Home</Link>
          <Link href="/docs" className={`nav-lnk${path === "/docs" ? " on" : ""}`}>Docs</Link>
          <a href="https://github.com/scisamir/fiber-dev-kit" target="_blank" rel="noopener noreferrer" className="nav-lnk hi">GitHub ↗</a>
        </div>
        <button className="nav-pill" onClick={copy}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M11 1H3a1 1 0 00-1 1v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <rect x="5" y="4" width="9" height="11" rx="1" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
          {copied ? <span style={{color:"var(--tea)"}}>copied!</span> : "npm i -g @fiber-dev-kit/cli@0.1.2"}
        </button>
      </div>
    </nav>
  );
}
