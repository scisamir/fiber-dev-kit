/**
 * Single source of truth for site-wide identity — used by layout metadata, the generated
 * OG/Twitter images, robots.ts, sitemap.ts, and JSON-LD. Keeping this in one file is what
 * stops the name/description/URL from drifting out of sync across those surfaces.
 */

// No production domain is known at the time this was written — set NEXT_PUBLIC_SITE_URL in
// the deployment environment (e.g. Vercel project settings) before going live. Metadata that
// requires an absolute URL (canonical, Open Graph, sitemap, robots) falls back to localhost
// so local `next build`/`next dev` still work without it.
export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const siteName = "Fiber Dev Kit";

export const siteTitle = "Fiber Dev Kit — Local development tools for CKB Fiber Network";

export const siteTagline =
  "Start local Fiber Network nodes, send typed payments, inspect channels, and diagnose payment failures.";

export const siteDescription =
  "Fiber Dev Kit is an open-source toolchain for CKB Fiber Network development: a CLI that " +
  "starts local Fiber nodes without building Rust from source, a typed TypeScript RPC client " +
  "(@fiber-dev-kit/core) with CKB amount conversion and structured failure diagnostics, an " +
  "integration test harness (@fiber-dev-kit/test-client) for asserting payment outcomes, and " +
  "a local inspector dashboard for node health, channels, and payment traces.";

export const siteKeywords = [
  "Fiber Network",
  "CKB",
  "Nervos",
  "Nervos CKB",
  "payment channels",
  "Lightning Network",
  "Fiber Network Node",
  "FNN",
  "TypeScript RPC client",
  "Fiber SDK",
  "CKB developer tools",
  "local devnet",
  "payment diagnostics",
];

export const githubUrl = "https://github.com/scisamir/fiber-dev-kit";

/**
 * The one place package name/version/description/tags/install-command are defined. Both
 * the homepage package grid (`Packages.tsx`) and the JSON-LD structured data in
 * `layout.tsx` render from this array, so a version bump or copy change only needs to
 * happen here — the exact drift-between-surfaces problem this file exists to prevent.
 */
export const packages = [
  {
    name: "@fiber-dev-kit/cli",
    version: "0.1.2",
    global: true,
    tags: ["CLI", "Linux x64", "global"],
    desc: "Start and manage local Fiber nodes using bundled Linux x64 fnn and fnn-cli binaries. It guides funding, peer connection, channel opening, payments, diagnostics, and inspection.",
    operatingSystem: "Linux x64",
  },
  {
    name: "@fiber-dev-kit/core",
    version: "0.1.0",
    global: false,
    tags: ["TypeScript", "RPC client", "diagnostics"],
    desc: "Typed Fiber RPC client with CKB amount conversion, mainnet write guards, diagnostics, event polling, and alert rules.",
    operatingSystem: "Cross-platform (Node.js ≥ 18)",
  },
  {
    name: "@fiber-dev-kit/test-client",
    version: "0.1.0",
    global: false,
    tags: ["testing", "CI", "multi-node"],
    desc: "Integration test helpers for already-running Fiber nodes. Wrap nodes by alias, check route confidence, assert payment outcomes, and simulate common failures.",
    operatingSystem: "Cross-platform (Node.js ≥ 18)",
  },
  {
    name: "@fiber-dev-kit/inspector",
    version: "0.1.0",
    global: true,
    tags: ["dashboard", "diagnostics", "global"],
    desc: "Local dashboard for development and operator diagnostics. Shows node health, peer and channel state, wallet funding addresses, active alerts, and recent payment traces.",
    operatingSystem: "Cross-platform (Node.js ≥ 18)",
  },
] as const;

export const installCommand = (pkg: (typeof packages)[number]): string =>
  `npm install ${pkg.global ? "-g " : ""}${pkg.name}@${pkg.version}`;

export const npmUrls = packages.map((pkg) => `https://www.npmjs.com/package/${pkg.name}`);

