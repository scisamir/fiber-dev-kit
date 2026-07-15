import { kw, str, fn, num } from "@/lib/syntax";

const STEPS = [
  {
    num: "1", title: "Start and fund local nodes",
    sub: "Install the CLI, start two local nodes, then fund their generated testnet addresses before opening a channel.",
    code: [
      `npm install -g @fiber-dev-kit/cli@0.1.2`,
      `fiber start --nodes 2`,
      `fiber accounts`,
      `# fund node-a and node-b from the faucet`,
      `fiber balance`,
      `fiber channel open --node a --peer <node-b-pubkey> --amount 200 --wait 180`,
    ].join("\n"),
  },
  {
    num: "2", title: "Inspect and debug",
    sub: "Open the local dashboard from the CLI to view node health, channels, funding addresses, alerts, and payment traces.",
    code: `fiber inspect\n# open the printed browser URL`,
  },
  {
    num: "3", title: "Preflight and assert payments",
    sub: "Use test-client to check route confidence, send a payment, then assert the final payment status in CI or local test runs.",
    code: [
      `${kw("import")} { ${fn("FiberNetwork")} }`,
      `  ${kw("from")} ${str('"@fiber-dev-kit/test-client"')}`,
      ``,
      `${kw("const")} network = ${kw("new")} ${fn("FiberNetwork")}({`,
      `  nodes: { a: ${str('"http://127.0.0.1:8227"')},`,
      `           b: ${str('"http://127.0.0.1:8237"')} },`,
      `});`,
      `${kw("await")} network.${fn("start")}();`,
      ``,
      `${kw("const")} recipient = ${kw("await")} network.${fn("pubkeyOf")}(${str('"b"')});`,
      `${kw("const")} report = ${kw("await")} network.${fn("node")}(${str('"a"')})`,
      `  .${fn("routeConfidence")}({ to: recipient, amount: ${num("1")} });`,
      `${kw("if")} (!report.canPay) ${kw("throw")} ${kw("new")} Error(report.suggestions[${num("0")}]);`,
      `${kw("const")} payment = ${kw("await")} network.${fn("pay")}(${str('"a"')}, ${str('"b"')}, ${num("1")});`,
      `${kw("await")} network.${fn("node")}(${str('"a"')}).${fn("assertPaid")}(payment.payment_hash);`,
    ].join("\n"),
  },
];

export default function HowItWorks() {
  return (
    <section className="section">
      <div className="wrap">
        <div className="eyebrow">Getting started</div>
        <h2 className="section-title">Try a local Fiber payment in three steps.</h2>
        <div className="steps">
          {STEPS.map(({ num, title, sub, code }) => (
            <div key={num} className="step">
              <div className="step-num">{num}</div>
              <div className="step-title">{title}</div>
              <div className="step-sub">{sub}</div>
              <div className="step-code">
                <pre className="code-font" dangerouslySetInnerHTML={{ __html: code }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
