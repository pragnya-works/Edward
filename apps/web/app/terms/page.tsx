import { Metadata } from "next";
import { getCanonicalUrl, STATIC_OG_IMAGE_URL } from "@/lib/seo/siteUrl";
import { CONTACT_EMAIL } from "@/lib/site";

const termsCanonicalUrl = getCanonicalUrl("/terms");

const LAST_UPDATED = "October 7, 2026";

export const metadata: Metadata = {
  title: "Terms and Conditions",
  description:
    "The terms governing your use of Edward, the AI software development platform operated by Pragnya Works.",

  alternates: {
    canonical: "/terms",
  },
  openGraph: {
    url: termsCanonicalUrl ?? undefined,
    images: [STATIC_OG_IMAGE_URL],
  },
  twitter: {
    title: "Terms and Conditions | Edward",
    description:
      "The terms governing your use of Edward, the AI software development platform operated by Pragnya Works.",
    images: [STATIC_OG_IMAGE_URL],
  },
};

export const revalidate = 3600;

const SECTIONS: { heading: string; body: React.ReactNode }[] = [
  {
    heading: "Who provides the service",
    body: (
      <>
        <p>
          These terms govern your use of Edward, the AI software development
          platform available at{" "}
          <a
            href="https://edwardd.app"
            className="text-foreground underline underline-offset-4 hover:text-primary transition-colors"
          >
            https://edwardd.app
          </a>{" "}
          (the &ldquo;service&rdquo;). Edward is operated by Pragnya Works, the
          party that provides the service. &ldquo;We&rdquo;, &ldquo;us&rdquo; and
          &ldquo;our&rdquo; mean Pragnya Works. Edward is the name of the product,
          not a separate legal company.
        </p>
        <p>
          By using the service you agree to these terms. If you do not agree,
          do not use the service.
        </p>
      </>
    ),
  },
  {
    heading: "Accounts",
    body: (
      <>
        <p>
          You sign in with GitHub. You are responsible for activity under your
          account and for keeping access to your GitHub account secure. Tell us
          promptly if you think someone else has used your account.
        </p>
        <p>
          You must be old enough to hold a GitHub account and to enter a
          contract where you live. Edward is a developer tool and is not intended
          for anyone under 16.
        </p>
      </>
    ),
  },
  {
    heading: "Your API keys and model providers",
    body: (
      <>
        <p>
          Edward works with model providers through keys you supply. You are
          responsible for your keys, for the charges your provider bills you,
          and for complying with that provider&apos;s terms. A key you give us
          can be revoked by you at any time.
        </p>
        <p>
          We do not resell model access and we receive no revenue from the keys
          you provide.
        </p>
      </>
    ),
  },
  {
    heading: "Your content",
    body: (
      <>
        <p>
          You keep ownership of the prompts, code, files, and attachments you
          create or upload. You grant us the licence needed to host, process,
          and display that content to you and to run the service you asked for.
          That licence ends when you delete the content, except for copies that
          we are required to retain.
        </p>
        <p>
          We do not claim ownership of your projects and we do not sell them.
        </p>
      </>
    ),
  },
  {
    heading: "Generated output",
    body: (
      <p>
        Model output is produced by third-party services and may be wrong,
        incomplete, or similar to output generated for someone else. Review
        generated code before you use it, and check it against your licence and
        compliance obligations. We do not warrant that output is accurate,
        original, or free of third-party rights.
      </p>
    ),
  },
  {
    heading: "Acceptable use",
    body: (
      <>
        <p>You agree not to use the service to:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>
            Break the law, or infringe the rights of others, including
            intellectual property rights
          </li>
          <li>
            Generate malware, or code intended to attack systems you are not
            authorized to test
          </li>
          <li>
            Probe, scan, or overload the service, its API, or the infrastructure
            of third parties
          </li>
          <li>Try to reach other users&apos; sandboxes, projects, or accounts</li>
          <li>
            Use the service to build or operate anything unlawful, including
            content that exploits or harms people
          </li>
        </ul>
        <p>
          We may suspend or terminate an account that does this. Where the law
          allows, we will tell you why.
        </p>
      </>
    ),
  },
  {
    heading: "GitHub integration",
    body: (
      <p>
        If you connect a GitHub repository, you authorize us to read and write
        to the repositories and branches you select, so we can sync your
        project. You can revoke that access in GitHub at any time, and we stop
        syncing when you do. You are responsible for what you push from Edward to
        your repositories.
      </p>
    ),
  },
  {
    heading: "Service availability",
    body: (
      <p>
        The service is provided as is. Sandboxes, builds, and previews depend on
        containers, storage, and third-party model providers, so any part can
        fail. We aim to keep the service running but we do not promise a
        specific uptime level.
      </p>
    ),
  },
  {
    heading: "Disclaimer of warranty",
    body: (
      <p>
        The service is provided &ldquo;as is&rdquo; and &ldquo;as
        available&rdquo;, without warranties of any kind, whether express or
        implied, including merchantability, fitness for a particular purpose,
        and non-infringement. We do not warrant that the service will be
        uninterrupted, error-free, or that generated code will meet your
        requirements.
      </p>
    ),
  },
  {
    heading: "Limitation of liability",
    body: (
      <p>
        To the fullest extent the law allows, we are not liable for indirect,
        incidental, special, or consequential damages, or for lost profits, data,
        or goodwill, arising from your use of the service. Our total liability
        to you for all claims relating to the service is limited to the greater
        of the amount you paid us in the twelve months before the claim, or USD
        50. Nothing here excludes liability that cannot be excluded by law.
      </p>
    ),
  },
  {
    heading: "Indemnity",
    body: (
      <p>
        You agree to indemnify and hold harmless Pragnya Works against claims
        arising from your use of the service, your content, or your breach of
        these terms.
      </p>
    ),
  },
  {
    heading: "Changes and termination",
    body: (
      <>
        <p>
          We may change or discontinue parts of the service. If we make a
          material change to these terms we will update the date at the top of
          this page and, where the change affects you materially, tell you before
          it takes effect.
        </p>
        <p>
          You may stop using the service and delete your account at any time. We
          may suspend or terminate your account if you breach these terms or if
          we are required to by law.
        </p>
      </>
    ),
  },
  {
    heading: "Governing law",
    body: (
      <p>
        These terms are governed by the laws of India, without regard to
        conflict of law rules. Where you live as a consumer, mandatory
        protections under the law of your country still apply.
      </p>
    ),
  },
  {
    heading: "Contact",
    body: (
      <>
        <p>Questions about these terms go to:</p>
        <ul className="list-none space-y-1">
          <li>
            <span className="text-foreground/90 font-medium">Operator:</span>{" "}
            Pragnya Works
          </li>
          <li>
            <span className="text-foreground/90 font-medium">Email:</span>{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-foreground underline underline-offset-4 hover:text-primary transition-colors"
            >
              {CONTACT_EMAIL}
            </a>
          </li>
          <li>
            <span className="text-foreground/90 font-medium">Website:</span>{" "}
            <a
              href="https://edwardd.app"
              className="text-foreground underline underline-offset-4 hover:text-primary transition-colors"
            >
              https://edwardd.app
            </a>
          </li>
        </ul>
      </>
    ),
  },
];

export default function TermsAndConditionsPage() {
  return (
    <main className="min-h-[100dvh] text-foreground">
      <div className="container max-w-3xl mx-auto px-4 sm:px-6 py-12 md:py-16 lg:py-20">
        <div className="mb-12 md:mb-16 lg:mb-20">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight text-foreground">
            Terms and Conditions
          </h1>
          <p className="mt-4 text-sm text-muted-foreground/50">
            Last Updated: {LAST_UPDATED}
          </p>
        </div>

        <div className="space-y-10 text-sm leading-relaxed text-muted-foreground">
          {SECTIONS.map((section) => (
            <section key={section.heading} className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground tracking-tight">
                {section.heading}
              </h2>
              <div className="space-y-4">{section.body}</div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}