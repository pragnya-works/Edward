import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"

import "@workspace/ui/globals.css"
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
    icon: "/favicon.ico",
  },
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
