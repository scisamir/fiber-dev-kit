import DocsSidebar  from "@/components/docs/DocsSidebar";
import DocsContent  from "@/components/docs/DocsContent";
import DemoTerminal from "@/components/docs/DemoTerminal";
import Footer       from "@/components/Footer";

export const metadata = {
  title: "Docs — fiber-dev-kit",
  description: "API reference and guides for @fiber-dev-kit/core, test-client, inspector, and CLI.",
};

export default function DocsPage() {
  return (
    <>
      <div className="docs-shell">
        <DocsSidebar />
        <div>
          <div className="docs-body" style={{ paddingBottom: 0 }}>
            <div className="docs-title">Documentation</div>
            <div className="docs-lead">API reference and guides for all four fiber-dev-kit packages.</div>
            <div id="demo" style={{ scrollMarginTop: 80 }}>
              <div className="docs-h2" style={{ marginTop: 0 }}>Quick demo</div>
              <p className="docs-p">Click each tab to see fiber-dev-kit in action — starting a local network, opening the inspector, checking route confidence, and diagnosing a payment failure.</p>
              <DemoTerminal />
            </div>
          </div>
          <DocsContent />
        </div>
      </div>
      <Footer />
    </>
  );
}
