import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"

import "@edward/ui/globals.css"
import "@edward/ui/sonner.css"
import "@/app/motion-accessibility.css"
import { Providers } from "@/app/providers"
import ConditionalSidebarLayout from "@/components/layouts/conditionalSidebarLayout"
import Navbar from "@/components/navbar"
import {
  getCanonicalUrl,
  getSiteUrl,
  STATIC_OG_IMAGE_URL,
} from "@/lib/seo/siteUrl"

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

const siteUrl = getSiteUrl()
const canonicalHomeUrl = getCanonicalUrl("/")
const defaultTitle = "Edward - AI Web App Builder"
const defaultDescription =
  "Create stunning apps and websites by chatting with Edward."

export const metadata: Metadata = {
  metadataBase: siteUrl ?? undefined,
  title: {
    default: defaultTitle,
    template: "%s | Edward",
  },
  description: defaultDescription,
  applicationName: "Edward",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: canonicalHomeUrl ?? undefined,
    siteName: "Edward",
    title: defaultTitle,
    description: defaultDescription,
    images: [
      {
        url: STATIC_OG_IMAGE_URL,
        width: 1200,
        height: 630,
        alt: defaultTitle,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: defaultTitle,
    description: defaultDescription,
    images: [STATIC_OG_IMAGE_URL],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
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
  manifest: "/manifest.webmanifest",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${fontSans.variable} ${fontMono.variable} font-sans antialiased `}
      >
        <Providers>
          <ConditionalSidebarLayout>
            <Navbar />
            {children}
          </ConditionalSidebarLayout>
        </Providers>
      </body>
    </html>
  )
}
