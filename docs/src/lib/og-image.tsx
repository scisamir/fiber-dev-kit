import { siteName, siteTagline, packages } from "@/lib/site";

// Shared JSX tree for opengraph-image.tsx and twitter-image.tsx, so the two conventions
// can't silently drift into two different-looking cards. Colors match globals.css's
// --bg/--vio/--tea/--t1/--t2 tokens rather than inventing a separate OG-only palette.
export function OgImageMarkup() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px",
        background: "#08091A",
        backgroundImage:
          "radial-gradient(circle at 15% 15%, rgba(124,92,246,0.35), transparent 45%), " +
          "radial-gradient(circle at 85% 85%, rgba(16,204,170,0.28), transparent 45%)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 999,
            background: "linear-gradient(135deg, #7C5CF6, #10CCAA)",
            display: "flex",
          }}
        />
        <div style={{ fontSize: 30, color: "#7880A4", letterSpacing: -0.5 }}>fiber-dev-kit</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ fontSize: 64, fontWeight: 700, color: "#EAE6F8", lineHeight: 1.15, display: "flex" }}>
          Build, test, and debug Fiber payments from npm.
        </div>
        <div style={{ fontSize: 26, color: "#7880A4", lineHeight: 1.5, display: "flex", maxWidth: 920 }}>
          {siteTagline}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        {packages.map(({ name }) => (
          <div
            key={name}
            style={{
              display: "flex",
              fontSize: 18,
              color: "#EAE6F8",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 999,
              padding: "8px 18px",
            }}
          >
            {name}
          </div>
        ))}
      </div>
    </div>
  );
}

export const ogImageSize = { width: 1200, height: 630 };
export const ogImageContentType = "image/png";

// Referenced by layout metadata as a fallback name; kept here so it travels with the markup.
export const ogImageAlt = `${siteName} — local Fiber Network development toolchain`;
