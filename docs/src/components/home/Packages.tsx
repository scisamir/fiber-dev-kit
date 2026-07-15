import CopyBtn from "@/components/shared/CopyBtn";
import { packages, installCommand } from "@/lib/site";

const ACCENT: Record<string, { background: string; color: string }> = {
  "@fiber-dev-kit/cli": { background: "rgba(255,255,255,.05)", color: "#7880A4" },
  "@fiber-dev-kit/core": { background: "rgba(124,92,246,.12)", color: "#A594F9" },
  "@fiber-dev-kit/test-client": { background: "rgba(16,204,170,.10)", color: "#10CCAA" },
  "@fiber-dev-kit/inspector": { background: "rgba(240,162,67,.10)", color: "#F0A243" },
};

export default function Packages() {
  return (
    <section className="section">
      <div className="wrap">
        <div className="eyebrow">Packages</div>
        <h2 className="section-title">Four packages, one local Fiber workflow.</h2>
        <p className="section-sub">
          Focused packages for local Fiber development. The packages are independent but
          designed to work together: CLI starts nodes, core speaks RPC, test-client verifies
          flows, and inspector visualizes node state.
        </p>
        <div className="pkg-grid">
          {packages.map((pkg) => {
            const { name, version, tags, desc } = pkg;
            const href = `https://www.npmjs.com/package/${name}`;
            const install = installCommand(pkg);
            return (
              <div key={name} className="pkg-card">
                <div>
                  <span className="tag" style={{ ...ACCENT[name], marginBottom: 8, display: "inline-block" }}>{version}</span>
                  <a href={href} target="_blank" rel="noopener noreferrer" className="pkg-name" style={{ display: "block" }}>{name}</a>
                </div>
                <div className="pkg-desc">{desc}</div>
                <div className="pkg-tags">{tags.map(t => <span key={t} className="tag tag-g">{t}</span>)}</div>
                <div className="pkg-install"><span>{install}</span><CopyBtn text={install} /></div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
