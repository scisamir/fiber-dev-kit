import Link from "next/link";
import { kw, str, fn, cmt } from "@/lib/syntax";

const LEFT = [
  `${cmt("// Raw JSON-RPC")}`,
  `${cmt("// Useful, but verbose for application")}`,
  `${cmt("// and test code.")}`,
  ``,
  `const res = await fetch("http://127.0.0.1:8227", {`,
  `  method: "POST",`,
  `  headers: { "content-type": "application/json" },`,
  `  body: JSON.stringify({`,
  `    jsonrpc: "2.0", id: 1,`,
  `    method: "send_payment",`,
  `    params: [{`,
  `      target_pubkey: "0x02...",`,
  `      amount: "0x3B9ACA00",`,
  `      keysend: true,`,
  `    }]`,
  `  })`,
  `});`,
  `// raw RPC errors still need`,
  `// application-level interpretation`,
].join("\n");

const RIGHT = [
  `${kw("import")} { ${fn("FiberClient")}, ${fn("FiberError")}, ${fn("diagnose")} }`,
  `  ${kw("from")} ${str('"@fiber-dev-kit/core"')}`,
  ``,
  `${kw("const")} node = ${kw("new")} ${fn("FiberClient")}({`,
  `  nodeUrl: ${str('"http://127.0.0.1:8227"')},`,
  `  network: ${str('"devnet"')},`,
  `});`,
  ``,
  `${kw("try")} {`,
  `  ${kw("await")} node.${fn("payInvoice")}(${str('"fibt1..."')});`,
  `} ${kw("catch")} (error) {`,
  `  ${kw("if")} (${fn("FiberError.is")}(error)) {`,
  `    ${kw("const")} d = ${fn("diagnose")}(error);`,
  `    console.log(d.code);`,
  `    console.log(d.suggestion);`,
  `  }`,
  `}`,
].join("\n");

export default function Hero() {
  return (
    <section className="hero">
      <div className="wrap">
        <div className="eyebrow">Fiber Network Infrastructure</div>
        <h1>Build, test, and debug<br /><span className="grad">Fiber payments</span> from npm.</h1>
        <p className="hero-sub">
          Fiber Dev Kit gives developers a fast local workflow for CKB Fiber Network
          nodes: start a single or multi-node test network, send typed payments, inspect
          channels, and diagnose failures with actionable messages.
        </p>
        <div className="hero-ctas">
          <Link href="/docs" className="btn-p">Read the docs →</Link>
          <a href="https://github.com/scisamir/fiber-dev-kit" target="_blank" rel="noopener noreferrer" className="btn-g">View on GitHub ↗</a>
        </div>
        <div className="split">
          <div className="split-pane pane-l">
            <div className="pane-label lbl-l">Raw JSON-RPC</div>
            <div className="pane-note">Useful, but verbose for application and test code.</div>
            <pre className="code-font" dangerouslySetInnerHTML={{ __html: LEFT }} />
          </div>
          <div className="beam-col"><div className="beam-line"><div className="beam-dot" /></div></div>
          <div className="split-pane pane-r">
            <div className="pane-label lbl-r">With fiber-dev-kit</div>
            <div className="pane-note">Typed helpers, CKB amounts, and structured diagnostics.</div>
            <pre className="code-font" dangerouslySetInnerHTML={{ __html: RIGHT }} />
          </div>
        </div>
      </div>
    </section>
  );
}
