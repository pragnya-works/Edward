import type { Metadata, Viewport } from "next";
import { Providers } from "../components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Edward App",
  description: "Built with Edward AI",
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
