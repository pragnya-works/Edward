import type { Metadata, Viewport } from "next";
import { Providers } from "../components/providers";
import { getCanonicalUrl, getSiteUrl, STATIC_OG_IMAGE_URL } from "../lib/seo";
import "./globals.css";

const siteUrl = getSiteUrl();
const canonicalUrl = getCanonicalUrl("/");
const title = "Edward App";
const description = "A production-ready web application built with Edward AI.";

export const metadata: Metadata = {
  metadataBase: siteUrl ?? undefined,
  title: {
    default: title,
    template: "%s | Edward App",
  },
  description,
  alternates: canonicalUrl ? { canonical: canonicalUrl } : undefined,
  openGraph: {
    type: "website",
    url: canonicalUrl ?? undefined,
    title,
    description,
    images: [
      {
        url: STATIC_OG_IMAGE_URL,
        width: 1200,
        height: 630,
        alt: title,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [STATIC_OG_IMAGE_URL],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      { url: "https://assets.pragnyaa.in/home/favicon_io/favicon.ico" },
      {
        url: "https://assets.pragnyaa.in/home/favicon_io/favicon-16x16.png",
        sizes: "16x16",
        type: "image/png",
      },
      {
        url: "https://assets.pragnyaa.in/home/favicon_io/favicon-32x32.png",
        sizes: "32x32",
        type: "image/png",
      },
    ],
    apple: [
      { url: "https://assets.pragnyaa.in/home/favicon_io/apple-touch-icon.png" },
    ],
  },
  manifest: "https://assets.pragnyaa.in/home/favicon_io/site.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
