import CodeBlock from "@/components/shared/CodeBlock";
import { kw, str, fn, cmt, num } from "@/lib/syntax";

const A = ({ id }: { id: string }) => <div id={id} style={{ scrollMarginTop: 80 }} />;

const Tbl = ({ rows, cols }: { rows: string[][], cols: string[] }) => (
  <table className="ref-table">
    <thead><tr>{cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
    <tbody>{rows.map(r => <tr key={r[0]}>{r.map((c,i) => <td key={i}>{c}</td>)}</tr>)}</tbody>
  </table>
);

export default function DocsContent() {
  return (
    <div className="docs-body">

      {/* ── Installation ── */}
      <A id="install" />
      <div className="docs-h2">Installation</div>
      <p className="docs-p">All packages require Node.js ≥ 18. Install only what you need.</p>
      <CodeBlock label="bash" code={[
        `${cmt("# Node launcher — Linux x64")}`,
        `npm install -g @fiber-dev-kit/cli@0.1.2`,``,
        `${cmt("# Typed RPC client and diagnostics")}`,
        `npm install @fiber-dev-kit/core@0.1.0`,``,
        `${cmt("# Integration test harness")}`,
        `npm install @fiber-dev-kit/test-client@0.1.0`,``,
        `${cmt("# Local web dashboard")}`,
        `npm install -g @fiber-dev-kit/inspector@0.1.0`,
      ].join("\n")} />
      <div className="docs-note">⚠️ The CLI bundles Linux x64 binaries. Core, test-client, and inspector are platform-independent.</div>

      {/* ── First payment ── */}
      <A id="quickstart" />
      <div className="docs-h2">First payment</div>
      <p className="docs-p">Start two local nodes, fund their generated testnet addresses, open a channel, then send and assert a test payment in code.</p>
      <CodeBlock label="bash" code={[
        `fiber start --nodes 2`,
        `fiber accounts`,
        `${cmt("# Fund both node-a and node-b testnet addresses from https://faucet.nervos.org/")}`,
        `fiber balance`,
        `fiber channel open --node a --peer <node-b-pubkey> --amount 200 --wait 180`,
        `fiber inspect`,
      ].join("\n")} />
      <div className="docs-note">Fresh nodes start unfunded. If <code>fiber start --nodes 2 --channel 200</code> cannot open the channel yet, the CLI prints both funding addresses and the retry command.</div>
      <CodeBlock label="ts" code={[
        `${kw("import")} { ${fn("FiberNetwork")} } ${kw("from")} ${str('"@fiber-dev-kit/test-client"')}`,``,
        `${kw("const")} network = ${kw("new")} ${fn("FiberNetwork")}({`,
        `  nodes: { a: ${str('"http://127.0.0.1:8227"')}, b: ${str('"http://127.0.0.1:8237"')} },`,
        `});`,
        `${kw("await")} network.${fn("start")}();`,``,
        `${kw("const")} recipient = ${kw("await")} network.${fn("pubkeyOf")}(${str('"b"')});`,
        `${kw("const")} report    = ${kw("await")} network.${fn("node")}(${str('"a"')}).${fn("routeConfidence")}({`,
        `  to: recipient, amount: ${num("1")},`,
        `});`,
        `${kw("if")} (!report.canPay) ${kw("throw")} ${kw("new")} Error(report.suggestions.join(${str('"\\n"')}));`,``,
        `${kw("const")} payment = ${kw("await")} network.${fn("pay")}(${str('"a"')}, ${str('"b"')}, ${num("1")});`,
        `${kw("await")} network.${fn("node")}(${str('"a"')}).${fn("assertPaid")}(payment.payment_hash);`,
        `console.log(payment.payment_hash, ${str('"paid"')});`,
      ].join("\n")} />

      {/* ── FiberClient ── */}
      <A id="core-client" />
      <div className="docs-h2">FiberClient</div>
      <p className="docs-p">Typed JSON-RPC client for a Fiber Network Node. Ergonomic write methods accept CKB numbers and convert them to hex shannons before calling FNN.</p>
      <CodeBlock label="@fiber-dev-kit/core" code={[
        `${kw("import")} { ${fn("FiberClient")} } ${kw("from")} ${str('"@fiber-dev-kit/core"')}`,``,
        `${kw("const")} node = ${kw("new")} ${fn("FiberClient")}({`,
        `  nodeUrl: ${str('"http://127.0.0.1:8227"')},`,
        `  network: ${str('"testnet"')},  ${cmt("// 'devnet' | 'testnet' | 'mainnet'")}`,
        `});`,``,
        `${kw("const")} info     = ${kw("await")} node.${fn("info")}();`,
        `${kw("const")} peers    = ${kw("await")} node.${fn("listPeers")}();`,
        `${kw("const")} channels = ${kw("await")} node.${fn("listChannels")}({ includeClosed: ${kw("true")} });`,``,
        `${kw("const")} invoice = ${kw("await")} node.${fn("createInvoice")}({ amount: ${num("1")}, description: ${str('"demo"')} });`,
        `${kw("await")} node.${fn("payInvoice")}(${str('"fibt1q..."')});`,
      ].join("\n")} />
      <div className="docs-h3">Constructor options</div>
      <Tbl cols={["Option","Type","Description"]} rows={[
        ["nodeUrl","string","RPC endpoint, e.g. http://127.0.0.1:8227"],
        ["authToken","string (optional)","Bearer token for nodes with RPC auth enabled."],
        ["timeoutMs","number (optional)","Request timeout in milliseconds. Default: 30000."],
        ["defaultCurrency","string (optional)","Invoice currency used by createInvoice/sendPayment when omitted. Default: Fibt."],
        ["network","string (optional)","'devnet' | 'testnet' | 'mainnet'. Set mainnet to enable write guards."],
        ["allowMainnetWrites","boolean (optional)","Required for fund-moving calls when network is mainnet. Default: false."],
      ]} />
      <div className="docs-h3">Methods</div>
      {[
        { sig:"node.info()",              desc:"Node info: version, pubkey, channel count, peer count, announced addresses." },
        { sig:"node.listPeers()",         desc:"Connected Fiber peers with pubkey and connection address." },
        { sig:"node.listChannels(params?)", desc:"Channels for this node. Pass { includeClosed: true } to include closed records." },
        { sig:"node.createInvoice({ amount, description })", desc:"Create an invoice. Numeric amounts are CKB and are converted to hex shannons." },
        { sig:"node.sendPayment(params)", desc:"Send an invoice or keysend payment. Supports dryRun for route checks." },
        { sig:"node.payInvoice(invoice)", desc:"Send a payment by encoded invoice string (fibt1q...)." },
        { sig:"node.getPayment(paymentHash)", desc:"Fetch one payment by payment hash." },
        { sig:"node.listPayments(params?)", desc:"List recent payments, e.g. { limit: 50 }." },
      ].map(({ sig, desc }) => (
        <div key={sig} className="method-card"><div className="method-sig">{sig}</div><div className="method-desc">{desc}</div></div>
      ))}

      {/* ── FiberEventClient ── */}
      <A id="core-events" />
      <div className="docs-h2">FiberEventClient</div>
      <p className="docs-p">FNN has no server-push subscriptions. FiberEventClient polls and diffs channel and payment state to emit typed events.</p>
      <CodeBlock code={[
        `${kw("import")} { ${fn("FiberClient")}, ${fn("FiberEventClient")} } ${kw("from")} ${str('"@fiber-dev-kit/core"')}`,``,
        `${kw("const")} node   = ${kw("new")} ${fn("FiberClient")}({ nodeUrl: ${str('"http://127.0.0.1:8227"')} });`,
        `${kw("const")} events = ${kw("new")} ${fn("FiberEventClient")}({ client: node, pollIntervalMs: ${num("1000")} });`,``,
        `events.${fn("on")}(${str('"payment.succeeded"')}, ({ payment }) => console.log(${str('"paid"')}, payment.payment_hash));`,
        `events.${fn("on")}(${str('"payment.failed"')},    ({ diagnosis }) => console.error(diagnosis?.summary));`,
        `events.${fn("on")}(${str('"channel.opened"')},   ({ channel }) => { ${cmt("...")} });`,``,
        `events.${fn("start")}(); ${cmt("// later: events.stop()")}`,
      ].join("\n")} />
      <p className="docs-p">Events: <code>channel.opened</code>, <code>channel.updated</code>, <code>channel.closed</code>, <code>payment.created</code>, <code>payment.updated</code>, <code>payment.succeeded</code>, <code>payment.failed</code>.</p>

      {/* ── diagnose ── */}
      <A id="core-diagnose" />
      <div className="docs-h2">diagnose()</div>
      <p className="docs-p">Translates a raw FNN error into a structured, actionable diagnosis.</p>
      <CodeBlock code={[
        `${kw("import")} { ${fn("FiberError")}, ${fn("diagnose")} } ${kw("from")} ${str('"@fiber-dev-kit/core"')}`,``,
        `${kw("try")} {`,
        `  ${kw("await")} node.${fn("payInvoice")}(${str('"fibt1q..."')});`,
        `} ${kw("catch")} (error) {`,
        `  ${kw("if")} (${fn("FiberError.is")}(error)) {`,
        `    ${kw("const")} d = ${fn("diagnose")}(error);`,
        `    ${cmt("// d.code:       'INSUFFICIENT_LIQUIDITY'")}`,
        `    ${cmt("// d.summary:    'The route has capacity in total, but not enough")}`,
        `    ${cmt("//                usable balance in the direction this payment")}`,
        `    ${cmt("//                needs to flow.'")}`,
        `    ${cmt("// d.suggestion: 'Reduce the payment amount, open a larger channel,")}`,
        `    ${cmt("//                or rebalance existing channels toward the recipient.'")}`,
        `  }`,
        `}`,
      ].join("\n")} />
      <div className="docs-h3">Diagnosis codes</div>
      <Tbl cols={["Code","When it fires"]} rows={[
        ["INSUFFICIENT_LIQUIDITY","Not enough outbound balance in the payment direction"],
        ["ROUTE_NOT_FOUND","No path exists from this node to the target"],
        ["PEER_NOT_CONNECTED","Target peer is not connected"],
        ["PEER_UNREACHABLE","Connection attempt to peer failed"],
        ["INVOICE_EXPIRED","Invoice expiry window has passed"],
        ["INVOICE_ALREADY_PAID","Invoice has already been settled"],
        ["INVOICE_CANCELLED","Invoice was cancelled before payment"],
        ["INVALID_PARAMS","A parameter was missing, malformed, or the wrong type"],
        ["TIMEOUT","RPC call exceeded the configured timeout"],
        ["UNKNOWN","No known pattern matched — inspect the raw error"],
      ]} />

      {/* ── evaluateAlerts ── */}
      <A id="core-alerts" />
      <div className="docs-h2">evaluateAlerts()</div>
      <p className="docs-p">Takes a snapshot of node state and returns actionable operational alerts. Used by the inspector server to power the alerts panel.</p>
      <CodeBlock code={[
        `${kw("import")} { ${fn("FiberClient")}, ${fn("evaluateAlerts")} } ${kw("from")} ${str('"@fiber-dev-kit/core"')}`,``,
        `${kw("const")} node = ${kw("new")} ${fn("FiberClient")}({ nodeUrl: ${str('"http://127.0.0.1:8227"')} });`,``,
        `${kw("const")} snapshot = {`,
        `  node:     ${kw("await")} node.${fn("info")}(),`,
        `  peers:    ${kw("await")} node.${fn("listPeers")}(),`,
        `  channels: ${kw("await")} node.${fn("listChannels")}({ includeClosed: ${kw("true")} }),`,
        `  payments: ${kw("await")} node.${fn("listPayments")}({ limit: ${num("50")} }),`,
        `};`,``,
        `${kw("const")} alerts = ${fn("evaluateAlerts")}(snapshot);`,
        `${kw("for")} (${kw("const")} a ${kw("of")} alerts) {`,
        `  console.log(\`[\${a.severity}] \${a.code}: \${a.summary}\`);`,
        `  console.log(\`  → \${a.suggestion}\`);`,
        `}`,
      ].join("\n")} />
      <Tbl cols={["Code","When it fires"]} rows={[
        ["NODE_UNREACHABLE","RPC endpoint is not reachable"],
        ["ZERO_PEERS","Node has no connected Fiber peers"],
        ["NO_READY_CHANNELS","No channels are in ChannelReady state"],
        ["LOW_LOCAL_BALANCE","A ready channel has less than 1 CKB of outbound balance"],
        ["PAYMENT_FAILED","A recent payment ended in Failed status"],
      ]} />

      {/* ── amount utils ── */}
      <A id="core-utils" />
      <div className="docs-h2">Amount utilities</div>
      <CodeBlock code={[
        `${kw("import")} { ${fn("ckbToShannonHex")}, ${fn("shannonHexToCkb")}, ${fn("formatAmount")} }`,
        `  ${kw("from")} ${str('"@fiber-dev-kit/core"')}`,``,
        `${fn("ckbToShannonHex")}(${num("1")})                  ${cmt("// → '0x5f5e100'")}`,
        `${fn("shannonHexToCkb")}(${str('"0x5f5e100"')})        ${cmt("// → 1")}`,
        `${fn("formatAmount")}(${str('"0x5f5e100"')})            ${cmt("// → '1 CKB'")}`,
        `${fn("formatAmount")}(${str('"0x5f5e100"')}, ${str('"shannon"')})   ${cmt("// → '100000000 shannon'")}`,
      ].join("\n")} />

      {/* ── FiberNetwork ── */}
      <A id="tc-network" />
      <div className="docs-h2">FiberNetwork</div>
      <p className="docs-p">Local integration test harness for Fiber payment flows. It wraps already-running Fiber node RPC URLs by alias; it does not start or stop FNN processes.</p>
      <CodeBlock label="@fiber-dev-kit/test-client" code={[
        `${kw("import")} { ${fn("FiberNetwork")} } ${kw("from")} ${str('"@fiber-dev-kit/test-client"')}`,``,
        `${kw("const")} network = ${kw("new")} ${fn("FiberNetwork")}({`,
        `  nodes: { a: ${str('"http://127.0.0.1:8227"')}, b: ${str('"http://127.0.0.1:8237"')} },`,
        `});`,``,
        `${kw("await")} network.${fn("start")}();`,``,
        `${kw("const")} recipient = ${kw("await")} network.${fn("pubkeyOf")}(${str('"b"')});`,
        `${kw("const")} report    = ${kw("await")} network.${fn("node")}(${str('"a"')}).${fn("routeConfidence")}({`,
        `  to: recipient, amount: ${num("1")},`,
        `});`,
        `console.log(report.canPay, report.level);`,
      ].join("\n")} />

      {/* ── routeConfidence ── */}
      <A id="tc-confidence" />
      <div className="docs-h2">routeConfidence()</div>
      <p className="docs-p">Pre-flight check on a <code>FiberTestClient</code>. It combines local peer/channel signals with FNN dry-run payment support.</p>
      <CodeBlock code={[
        `${kw("import")} { ${fn("FiberNetwork")} } ${kw("from")} ${str('"@fiber-dev-kit/test-client"')}`,``,
        `${kw("const")} network = ${kw("new")} ${fn("FiberNetwork")}({`,
        `  nodes: { a: ${str('"http://127.0.0.1:8227"')}, b: ${str('"http://127.0.0.1:8237"')} },`,
        `});`,
        `${kw("await")} network.${fn("start")}();`,``,
        `${kw("const")} recipient = ${kw("await")} network.${fn("pubkeyOf")}(${str('"b"')});`,
        `${kw("const")} report = ${kw("await")} network.${fn("node")}(${str('"a"')}).${fn("routeConfidence")}({`,
        `  to: recipient,`,
        `  amount: ${num("1")},`,
        `});`,``,
        `${cmt("// report.canPay      → true | false")}`,
        `${cmt("// report.score       → 0–100")}`,
        `${cmt("// report.level       → 'high' | 'medium' | 'low'")}`,
        `${cmt("// report.reasons     → string[]")}`,
        `${cmt("// report.suggestions → string[]")}`,
        `${cmt("// report.dryRunPayment → PaymentResult | null")}`,
        `${cmt("// report.diagnosis   → Diagnosis | null")}`,
      ].join("\n")} />

      {/* ── Assertions ── */}
      <A id="tc-assert" />
      <div className="docs-h2">Assertions</div>
      <p className="docs-p">Test helpers that poll until a payment reaches a terminal state, then assert its outcome. Failures throw with a diagnosis summary.</p>
      <CodeBlock code={[
        `${kw("const")} nodeA = network.${fn("node")}(${str('"a"')});`,``,
        `${kw("const")} { payment_hash } = ${kw("await")} nodeA.${fn("pay")}({ invoice: ${str('"fibt1q..."')} });`,``,
        `${kw("await")} nodeA.${fn("assertPaid")}(payment_hash);`,
        `${kw("await")} nodeA.${fn("assertFailed")}(payment_hash);`,
        `${kw("await")} nodeA.${fn("assertError")}(payment_hash, ${str('"INSUFFICIENT_LIQUIDITY"')});`,
      ].join("\n")} />

      {/* ── Simulations ── */}
      <A id="tc-simulate" />
      <div className="docs-h2">Failure simulations</div>
      <p className="docs-p">Named failure scenarios for testing error-handling paths.</p>
      <CodeBlock code={[
        `${kw("const")} r1 = ${kw("await")} network.simulate.${fn("insufficientLiquidity")}(${str('"a"')}, ${str('"b"')}, channelId);`,
        `${kw("const")} r2 = ${kw("await")} network.simulate.${fn("unreachablePeer")}(${str('"a"')}, ${str('"c"')}, ${num("10")});`,
        `${kw("const")} r3 = ${kw("await")} network.simulate.${fn("expiredInvoice")}(${str('"a"')}, ${str('"b"')}, ${num("5")});`,``,
        `console.log(r1.diagnosis?.code); ${cmt("// 'INSUFFICIENT_LIQUIDITY'")}`,
      ].join("\n")} />

      {/* ── Inspector CLI ── */}
      <A id="insp-cli" />
      <div className="docs-h2">Inspector — CLI usage</div>
      <p className="docs-p">Local dashboard for development and operator diagnostics. Shows node health, peer and channel state, wallet funding addresses, active alerts, and recent payment traces.</p>
      <CodeBlock label="bash" code={[
        `${cmt("# Recommended when @fiber-dev-kit/cli is installed")}`,
        `fiber inspect`,
        `fiber inspect --port=3030`,``,
        `${cmt("# Standalone inspector binary")}`,
        `fiber-dev-kit-inspector`,``,
        `${cmt("# Explicit node URLs")}`,
        `fiber-dev-kit-inspector a=http://127.0.0.1:8227 b=http://127.0.0.1:8237`,``,
        `${cmt("# Custom port")}`,
        `fiber-dev-kit-inspector a=http://127.0.0.1:8227 --port=4000`,
      ].join("\n")} />

      {/* ── Inspector library ── */}
      <A id="insp-lib" />
      <div className="docs-h2">Inspector — as a library</div>
      <CodeBlock label="@fiber-dev-kit/inspector" code={[
        `${kw("import")} { ${fn("startInspector")} } ${kw("from")} ${str('"@fiber-dev-kit/inspector"')}`,``,
        `${kw("const")} handle = ${kw("await")} ${fn("startInspector")}({`,
        `  nodes: [`,
        `    { id: ${str('"a"')}, rpcUrl: ${str('"http://127.0.0.1:8227"')} },`,
        `    { id: ${str('"b"')}, rpcUrl: ${str('"http://127.0.0.1:8237"')} },`,
        `  ],`,
        `  port: ${num("3030")}, pollIntervalMs: ${num("1500")},`,
        `});`,
        `${cmt("// handle.stop() to shut it down")}`,
      ].join("\n")} />

      {/* ── CLI start ── */}
      <A id="cli-start" />
      <div className="docs-h2">fiber start</div>
      <p className="docs-p">Provides a fast local Fiber runtime for Linux x64 by bundling fnn and fnn-cli. It starts local nodes, creates dev keys, guides testnet funding, connects managed peers, and can open a channel once the wallets are funded.</p>
      <CodeBlock label="bash" code={[
        `fiber start --nodes 2`,
        `fiber start --nodes 2 --channel 200`,
        `fiber start --nodes 2 --channel 200 --wait 300`,
        `fiber start --background`,
        `fiber start --nodes 2 --channel 200 --dry-run`,``,
        `${cmt("# Pass raw fnn options after --")}`,
        `fiber start -- --ckb-node-rpc-url http://127.0.0.1:8114`,
        `fiber start -- --fiber-announced-node-name my-node`,
      ].join("\n")} />
      <div className="docs-note">Use <code>fiber accounts</code> to copy funding addresses and <code>fiber balance</code> to verify faucet funds before opening a funded channel.</div>

      {/* ── CLI connect ── */}
      <A id="cli-connect" />
      <div className="docs-h2">fiber connect</div>
      <p className="docs-p">Connect a managed local node to an external peer by reachable multiaddr, or by pubkey when the node can resolve the peer from graph data.</p>
      <CodeBlock label="bash" code={[
        `fiber connect --node a --address /ip4/1.2.3.4/tcp/8228/p2p/QmPeer...`,
        `fiber connect --node a --pubkey 03abc...`,
        `fiber address --node a --host 203.0.113.10`,
      ].join("\n")} />

      {/* ── CLI channel ── */}
      <A id="cli-channel" />
      <div className="docs-h2">fiber channel</div>
      <p className="docs-p">Open and inspect channels from a managed node. The CLI preflights CKB funding before opening unless <code>--skip-balance-check</code> is used.</p>
      <CodeBlock label="bash" code={[
        `fiber channel open --node a --peer 03abc... --amount 200 --wait 180`,
        `fiber channel open --node a --peer 03abc... --shannons 20000000000`,
        `fiber channel list --node a`,
        `fiber channel list --node a --pending --closed --json`,
      ].join("\n")} />

      {/* ── CLI pay ── */}
      <A id="cli-pay" />
      <div className="docs-h2">fiber pay</div>
      <p className="docs-p">Create an invoice on the receiver, pay it from the sender, then poll until the payment reaches success or failure.</p>
      <CodeBlock label="bash" code={[
        `fiber pay --from a --to b --amount 1`,
        `fiber pay --from a --to b --amount 5 --wait 120`,
      ].join("\n")} />

      {/* ── CLI status ── */}
      <A id="cli-status" />
      <div className="docs-h2">fiber status / fiber doctor</div>
      <CodeBlock label="bash" code={[
        `fiber status          ${cmt("# node + channel snapshot")}`,
        `fiber status --watch  ${cmt("# live polling")}`,
        `fiber doctor          ${cmt("# guided diagnostic checklist")}`,
        `fiber inspect         ${cmt("# start browser inspector and print the URL")}`,
        `fiber accounts        ${cmt("# wallet funding addresses")}`,
        `fiber balance         ${cmt("# wallet balance and faucet address")}`,
      ].join("\n")} />

      {/* ── CLI env ── */}
      <A id="cli-env" />
      <div className="docs-h2">Environment variables</div>
      <Tbl cols={["Variable","Default","Purpose"]} rows={[
        ["FIBER_DEV_KIT_HOME",       "~/.fiber-dev-kit",           "Dev-kit state and node home directories"],
        ["FIBER_HOME",               "~/.fiber-node",              "Single-node runtime directory"],
        ["FIBER_RPC_URL",            "auto-detected",              "Single-node RPC URL override"],
        ["FIBER_CONFIG_TEMPLATE",    "testnet.yml",                "testnet.yml or rpc-only.yml"],
        ["FIBER_SECRET_KEY_PASSWORD","password",                   "Dev key passphrase"],
        ["CKB_NODE_RPC_URL",         "https://testnet.ckbapp.dev/","CKB RPC for balance checks"],
        ["NO_COLOR",                 "unset",                      "Set to 1 to disable colour output"],
      ]} />
      <div className="docs-note">⚠️ The CLI generates local development CKB keys on first start. Do not use them for production funds.</div>

    </div>
  );
}
