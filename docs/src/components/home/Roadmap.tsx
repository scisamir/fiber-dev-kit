const ITEMS = [
  { dot: "✓", color: "var(--tea)", label: "Shipped", text: "CLI node launcher, typed core client, diagnostics, test-client, inspector." },
  { dot: "→", color: "var(--vio)", label: "Next",    text: "Richer route analytics, alert persistence, inspector topology improvements." },
  { dot: "○", color: "var(--t3)", label: "Later",   text: "Cross-chain experiments, production monitoring workflows, hosted/team use cases." },
];

export default function Roadmap() {
  return (
    <section className="section">
      <div className="wrap">
        <div className="eyebrow">Roadmap</div>
        <h2 className="section-title" style={{maxWidth:620}}>
          Built for local Fiber development today,<br />extensible for deeper infrastructure later.
        </h2>
        <p className="section-sub">
          The current release focuses on local node setup, typed RPC access, diagnostics, route
          preflight, integration testing, and local inspection. Future work can extend this
          foundation into richer route analytics, persistent alerting, cross-chain experiments,
          and production operator workflows.
        </p>
        <div className="rm-list">
          {ITEMS.map(({ dot, color, label, text }) => (
            <div key={label} className="rm-item">
              <span className="rm-dot" style={{ color }}>{dot}</span>
              <div>
                <span className="rm-label" style={{ color }}>{label}</span>
                <span className="rm-text">{text}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
