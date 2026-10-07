import type { Metadata } from "next";
import Link from "next/link";
import { getCanonicalUrl, STATIC_OG_IMAGE_URL } from "@/lib/seo/siteUrl";
import { CONTACT_EMAIL, SITE_DESCRIPTION } from "@/lib/site";

const aboutCanonicalUrl = getCanonicalUrl("/about");

const description = SITE_DESCRIPTION;

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "About",
  description,
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    url: aboutCanonicalUrl ?? undefined,
    title: "About Edward",
    description,
    images: [STATIC_OG_IMAGE_URL],
  },
  twitter: {
    title: "About Edward | Edward",
    description,
    images: [STATIC_OG_IMAGE_URL],
  },
};

const CAPABILITIES = [
  "Planning application changes from a natural-language description",
  "Generating and editing code across the files of a project",
  "Running generated code in an isolated per-user sandbox container",
  "Installing dependencies and building the application",
  "Serving a live preview of the running application",
  "Iterating on the result through follow-up instructions",
  "Syncing projects with GitHub repositories you authorize",
];

const DETAILS = [
  { label: "Product", value: "Edward" },
  { label: "What it is", value: "AI software development platform" },
  { label: "Founder", value: "Shubhojeet Bera" },
  { label: "Public launch", value: "January 2026" },
  {
    label: "Official website",
    href: "https://edwardd.app",
    value: "https://edwardd.app",
  },
  {
    label: "Source code",
    href: "https://github.com/pragnya-works/Edward",
    value: "github.com/pragnya-works/Edward",
  },
  {
    label: "Contact",
    href: `mailto:${CONTACT_EMAIL}`,
    value: CONTACT_EMAIL,
  },
];

export default function AboutPage() {
  return (
    <main className="min-h-[100dvh] text-foreground">
      <div className="container max-w-3xl mx-auto px-4 sm:px-6 py-12 md:py-16 lg:py-20">
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight text-foreground">
          About Edward
        </h1>

        <p className="mt-6 text-base md:text-lg leading-relaxed text-muted-foreground">
          {SITE_DESCRIPTION}
        </p>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            What Edward does
          </h2>
          <ul className="mt-4 list-disc pl-6 space-y-2 text-sm leading-relaxed text-muted-foreground">
            {CAPABILITIES.map((capability) => (
              <li key={capability}>{capability}</li>
            ))}
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Model providers
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Edward supports Claude through Anthropic&apos;s API alongside OpenAI
            and Gemini. You connect a provider with your own API
            key, which means requests go straight from your key to that provider
            and your provider bills you directly.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Details
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            {DETAILS.map((detail) => (
              <div
                key={detail.label}
                className="grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-1 sm:gap-4"
              >
                <dt className="text-foreground/90">{detail.label}</dt>
                <dd className="text-muted-foreground break-words">
                  {detail.href ? (
                    detail.href.startsWith("mailto:") ? (
                      <a
                        href={detail.href}
                        className="text-foreground underline underline-offset-4 hover:text-primary transition-colors"
                      >
                        {detail.value}
                      </a>
                    ) : (
                      <a
                        href={detail.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-foreground underline underline-offset-4 hover:text-primary transition-colors"
                      >
                        {detail.value}
                      </a>
                    )
                  ) : (
                    detail.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Source code
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            The full application source is public at{" "}
            <a
              href="https://github.com/pragnya-works/Edward"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-4 hover:text-primary transition-colors"
            >
              github.com/pragnya-works/Edward
            </a>
            . Changes ship through the public changelog at{" "}
            <Link
              href="/changelog"
              className="text-foreground underline underline-offset-4 hover:text-primary transition-colors"
            >
              /changelog
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
