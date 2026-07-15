"use client";
import { useState } from "react";

type LT = "prompt"|"out"|"ok"|"err"|"warn";
interface Line { t: LT; v: string; }

const TABS: { id: string; label: string; lines: Line[] }[] = [
  {
    id: "start", label: "fiber start",
    lines: [
      { t:"prompt", v:"fiber start --nodes 2 --channel 200" },
      { t:"out",    v:"Fiber Dev Kit home: ~/.fiber-dev-kit" },
      { t:"ok",     v:"Binaries: using bundled fnn and fnn-cli" },
      { t:"ok",     v:"node-a: online | pubkey 0280f3aa..." },
      { t:"ok",     v:"node-b: online | pubkey 027450c8..." },
      { t:"out",    v:"Connecting node-a -> node-b" },
      { t:"warn",   v:"Skipping channel open: funding required" },
      { t:"out",    v:"fund node-a: Fund ckt1... from https://faucet.nervos.org/" },
      { t:"out",    v:"fund node-b: Fund ckt1... from https://faucet.nervos.org/" },
      { t:"prompt", v:"fiber channel open --node a --peer 027450c8... --amount 200 --wait 180" },
      { t:"ok",     v:"channel: ChannelReady" },
    ],
  },
  {
    id: "inspector", label: "inspector",
    lines: [
      { t:"prompt", v:"fiber inspect" },
      { t:"out",    v:"Starting Fiber Inspector" },
      { t:"out",    v:"state: ~/.fiber-dev-kit/state.json" },
      { t:"out",    v:"browser: open the URL below in your browser" },
      { t:"out",    v:"fiber-dev-kit-inspector watching a=http://127.0.0.1:8227, b=http://127.0.0.1:8237" },
      { t:"ok",     v:"Open in browser: http://127.0.0.1:3030" },
    ],
  },
  {
    id: "preflight", label: "routeConfidence",
    lines: [
      { t:"prompt", v:"node preflight.mjs" },
      { t:"out",    v:"network.start() ..." },
      { t:"ok",     v:"✓ both nodes reachable" },
      { t:"out",    v:"" },
      { t:"out",    v:"network.pubkeyOf('b') → 0372e3c0..." },
      { t:"out",    v:"network.node('a').routeConfidence({ to: '0372...', amount: 1 })" },
      { t:"out",    v:"" },
      { t:"ok",     v:"  canPay:   true" },
      { t:"ok",     v:"  score:    91 / 100" },
      { t:"ok",     v:"  level:    high" },
      { t:"out",    v:"  reasons:" },
      { t:"out",    v:"    - A ready channel has enough local balance for 1 CKB before fees." },
      { t:"out",    v:"    - FNN dry-run accepted the payment." },
    ],
  },
  {
    id: "diagnose", label: "diagnose()",
    lines: [
      { t:"prompt", v:"node diagnose.mjs" },
      { t:"out",    v:"Attempting payment beyond channel capacity..." },
      { t:"err",    v:"✗ node.payInvoice() threw" },
      { t:"out",    v:"" },
      { t:"out",    v:"diagnose(error):" },
      { t:"ok",     v:"  code:       INSUFFICIENT_LIQUIDITY" },
      { t:"out",    v:"  summary:    The route has capacity in total, but not enough usable" },
      { t:"out",    v:"              balance in the direction this payment needs to flow." },
      { t:"ok",     v:"  suggestion: Reduce the payment amount, open a larger channel, or" },
      { t:"ok",     v:"              rebalance existing channels toward the recipient." },
    ],
  },
];

export default function DemoTerminal() {
  const [active, setActive] = useState("start");
  const tab = TABS.find(t => t.id === active)!;
  return (
    <div className="terminal">
      <div className="term-bar">
        <div className="term-dot td-r" /><div className="term-dot td-a" /><div className="term-dot td-g" />
        <span className="term-title">fiber-dev-kit — interactive demo</span>
      </div>
      <div className="term-tabs">
        {TABS.map(t => (
          <button key={t.id} className={`term-tab${active===t.id?" on":""}`} onClick={() => setActive(t.id)}>{t.label}</button>
        ))}
      </div>
      <div className="term-body">
        {tab.lines.map((line, i) => (
          <div key={i}>
            {line.t === "prompt" && <span><span className="tp">❯ </span><span className="tc">{line.v}</span></span>}
            {line.t === "out"  && <span className="to">{line.v}</span>}
            {line.t === "ok"   && <span className="tok">{line.v}</span>}
            {line.t === "err"  && <span className="te">{line.v}</span>}
            {line.t === "warn" && <span className="tw">{line.v}</span>}
          </div>
        ))}
        <div style={{marginTop:8}}><span className="tp">❯ </span><span className="cursor" /></div>
      </div>
    </div>
  );
}
