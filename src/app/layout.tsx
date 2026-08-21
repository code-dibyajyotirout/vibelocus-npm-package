import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "@/styles/style.css";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-family",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://vibelocus.animatrous.com"),
  title: "VibeLocus - Private Local AI Memory Hub",
  description:
    "A 100% private, local-first AI learning platform. Transform documents into structured courses, lock onto subtopics with a browser-native local AI tutor, and build a secure Memory Palace.",
  keywords: [
    "VibeLocus",
    "Private AI",
    "Local AI",
    "Offline Learning",
    "Spatial Learning",
    "Memory Palace",
    "AI Tutor",
    "Study Notes",
    "EPUB Export",
    "PDF Export",
  ],
  authors: [{ name: "VibeLocus Team" }],
  openGraph: {
    type: "website",
    url: "https://vibelocus.app/",
    title: "VibeLocus - Private Local AI Memory Hub",
    description:
      "A 100% private, local-first AI learning platform. Transform documents into structured courses, lock onto subtopics with a browser-native local AI tutor, and build a secure Memory Palace.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "VibeLocus - Spatial Memory Hub",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "VibeLocus - Private Local AI Memory Hub",
    description:
      "A 100% private, local-first AI learning platform. Transform documents into structured courses, lock onto subtopics with a browser-native local AI tutor, and build a secure Memory Palace.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "VibeLocus",
    "url": "https://vibelocus.app/",
    "logo": "https://vibelocus.app/favicon.svg",
    "image": "https://vibelocus.app/og-image.png",
    "description":
      "A 100% private, local-first AI learning platform. Transform documents into structured courses, lock onto subtopics with a browser-native local AI tutor, and build a secure Memory Palace.",
    "applicationCategory": "EducationalApplication",
    "operatingSystem": "All",
  };

  return (
    <html lang="en">
      <head>
        {/* Strict Client-Side Content Security Policy safeguarding */}
        <meta
          httpEquiv="Content-Security-Policy"
          content="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://* wss://* http://localhost:11434 http://127.0.0.1:11434 ws://localhost:* ws://127.0.0.1:* https://cdn.jsdelivr.net; worker-src 'self' blob:;"
        />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={outfit.className}>
        {/* Background glowing ambient circles */}
        <div className="ambient-glow glow-1"></div>
        <div className="ambient-glow glow-2"></div>
        <div className="ambient-glow glow-3"></div>

        <div className="app-container">{children}</div>
      </body>
    </html>
  );
}
