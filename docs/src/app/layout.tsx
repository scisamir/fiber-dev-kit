import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import { siteUrl, siteName, siteTitle, siteDescription, siteKeywords, githubUrl, npmUrls, packages } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteTitle,
    template: `%s — ${siteName}`,
  },
  description: siteDescription,
  keywords: siteKeywords,
  applicationName: siteName,
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: ["/icon.svg"],
  },
  authors: [{ name: "fiber-dev-kit contributors", url: githubUrl }],
  category: "technology",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: siteUrl,
    siteName,
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
  },
};

// SoftwareApplication per published package, plus a WebSite/Organization node tying them
// together — deliberately no single "product version" claim, since the four packages ship
// on independent version numbers (see lib/site.ts for why this data lives in one place).
function jsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: siteUrl,
        name: siteName,
        description: siteDescription,
        publisher: { "@id": `${siteUrl}/#organization` },
      },
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: siteName,
        url: siteUrl,
        sameAs: [githubUrl, ...npmUrls],
      },
      ...packages.map((pkg) => ({
        "@type": "SoftwareApplication",
        "@id": `${siteUrl}/#${pkg.name}`,
        name: pkg.name,
        softwareVersion: pkg.version,
        description: pkg.desc,
        applicationCategory: "DeveloperApplication",
        operatingSystem: pkg.operatingSystem,
        url: `https://www.npmjs.com/package/${pkg.name}`,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        isPartOf: { "@id": `${siteUrl}/#website` },
      })),
    ],
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd()) }}
        />
        <Nav />
        {children}
      </body>
    </html>
  );
}
