import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"

import "@edward/ui/globals.css"
import "@edward/ui/sonner.css"
import { Providers } from "@/components/providers"
import ConditionalSidebarLayout from "@/components/layouts/conditionalSidebarLayout"
import Navbar from "@/components/navbar"

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: {
    default: "Edward - AI Web App Builder",
    template: "%s | Edward",
  },
  description: "Create stunning apps & websites by chatting with Edward.",
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
