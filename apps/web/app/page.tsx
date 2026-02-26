import type { Metadata } from "next";
import Home from "@/components/home/home";
import { getCanonicalUrl, STATIC_OG_IMAGE_URL } from "@/lib/seo/siteUrl";

const canonicalHomeUrl = getCanonicalUrl("/");

export const metadata: Metadata = {
  title: "Home",
  description: "Build and ship production-ready apps by chatting with Edward.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    url: canonicalHomeUrl ?? undefined,
    images: [STATIC_OG_IMAGE_URL],
  },
  twitter: {
    title: "Edward - AI Web App Builder",
    description: "Build and ship production-ready apps by chatting with Edward.",
    images: [STATIC_OG_IMAGE_URL],
  },
};

export default function Page() {
  return <Home />;
}
