const BULLETS = [
  "Start a single or multi-node Fiber test network without building Rust source.",
  "Use TypeScript helpers instead of hand-written JSON-RPC payloads.",
  "Write amounts as CKB numbers while the client handles shannon conversion.",
  "Check route confidence from test-client before sending payments.",
  "Translate common payment failures into codes, summaries, and suggested fixes.",
  "View node health, channels, funding addresses, alerts, and recent payment traces locally.",
];

export default function WorkflowSection() {
  return (
    <section className="section">
      <div className="wrap">
        <div className="eyebrow">Developer workflow</div>
        <h2 className="section-title">From local nodes to payment diagnostics.</h2>
        <p className="section-sub">
          Fiber Dev Kit adds the local development layer around Fiber nodes. The CLI
          handles local node setup, funding guidance, channels, payments, and diagnostics.
          Core provides typed RPC and diagnostics, test-client verifies payment behavior
          and route confidence, and inspector gives operators a local dashboard for health,
          channels, node funding addresses, alerts, and payment traces.
        </p>
        <div className="bullets">
          {BULLETS.map(b => (
            <div key={b} className="bullet">
              <span className="bullet-check">✓</span>
              <span className="bullet-text">{b}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
