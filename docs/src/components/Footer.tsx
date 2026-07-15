import Link from "next/link";

const PKGS = ["@fiber-dev-kit/cli","@fiber-dev-kit/core","@fiber-dev-kit/test-client","@fiber-dev-kit/inspector"];

export default function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-inner">
          <div>
            <div className="footer-logo"><div className="nav-gem" />fiber-dev-kit</div>
            <div className="footer-sub">Built for the Gone in 60ms Fiber Network Infrastructure Hackathon · July 2026 · MIT</div>
            <div>{PKGS.map(n => <a key={n} href={`https://www.npmjs.com/package/${n}`} target="_blank" rel="noopener noreferrer" className="npm-chip">{n}</a>)}</div>
          </div>
          <div className="footer-links">
            <Link href="/"     className="footer-lnk">Home</Link>
            <Link href="/docs" className="footer-lnk">Docs</Link>
            <a href="https://github.com/scisamir/fiber-dev-kit" target="_blank" rel="noopener noreferrer" className="footer-lnk">GitHub ↗</a>
            <a href="https://www.npmjs.com/package/@fiber-dev-kit/cli" target="_blank" rel="noopener noreferrer" className="footer-lnk">npm ↗</a>
            <a href="https://www.fiber.world" target="_blank" rel="noopener noreferrer" className="footer-lnk">Fiber Network ↗</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
