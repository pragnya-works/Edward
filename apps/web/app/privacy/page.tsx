import { Metadata } from "next";
import { getCanonicalUrl, STATIC_OG_IMAGE_URL } from "@/lib/seo/siteUrl";
import { CONTACT_EMAIL } from "@/lib/site";

const privacyCanonicalUrl = getCanonicalUrl("/privacy");

const LAST_UPDATED = "October 7, 2026";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Edward handles account data, prompts, generated code, and API keys.",

  alternates: {
    canonical: "/privacy",
  },
  openGraph: {
    url: privacyCanonicalUrl ?? undefined,
    images: [STATIC_OG_IMAGE_URL],
  },
  twitter: {
    title: "Privacy Policy | Edward",
    description:
      "How Edward handles account data, prompts, generated code, and API keys.",
    images: [STATIC_OG_IMAGE_URL],
  },
};

export const dynamic = "force-dynamic";

const SECTIONS: { heading: string; body: React.ReactNode }[] = [
  {
    heading: "Who runs this service",
    body: (
      <>
        <p>
          Edward is an AI software development platform. Pragnya Works is the
          legal operator responsible for the data described
          in this policy. Wherever this policy says &ldquo;we&rdquo;, it means
          Pragnya Works. &ldquo;Edward&rdquo; and &ldquo;the service&rdquo; mean
          the product at{" "}
          <a
            href="https://edwardd.app"
            className="text-foreground underline underline-offset-4 hover:text-primary transition-colors"
          >
            https://edwardd.app
          </a>
          .
        </p>
      </>
    ),
  },
  {
    heading: "Information you give us",
    body: (
      <>
        <p>You provide this information when you sign in and use the service:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>
            Account details from GitHub sign-in, including your name, email
            address, avatar, and GitHub account identifier
          </li>
          <li>
            OAuth tokens for the GitHub repositories you connect, and the
            repository and file metadata we read to sync your projects
          </li>
          <li>
            Your prompts, the responses we generate, and the resulting code and
            project files
          </li>
          <li>
            Images and documents you attach to a message, including any file
            names, file types, and the file contents we can read
          </li>
          <li>
            Your model provider selection and preferred model, for example
            Anthropic Claude, OpenAI, or Gemini
          </li>
          <li>
            Your provider API key, stored encrypted as described under API keys
          </li>
          <li>
            Build, run, and sandbox activity for your projects, including
            commands executed, command output, container logs, build status, and
            preview addresses
          </li>
          <li>
            Technical and security logs such as IP address, user agent, request
            timestamps, and error reports
          </li>
        </ul>
      </>
    ),
  },
  {
    heading: "API keys",
    body: (
      <>
        <p>
          Edward uses your own key rather than keys we hold on your behalf. When
          you save a provider API key we encrypt it with AES-256-GCM before it is
          written to our database. The decryption key lives in our server
          environment and never reaches the browser.
        </p>
        <p>
          We decrypt your key in memory only to call the provider you selected.
          Because our servers hold that key, the connection is encrypted at rest
          and in transit, but it is not end-to-end encrypted and we can read it.
        </p>
      </>
    ),
  },
  {
    heading: "Where information is stored",
    body: (
      <>
        <p>We store and process information using the following services:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>PostgreSQL for accounts, sessions, chats, and run records</li>
          <li>
            Redis for background job queues and short-lived rate limiting state
          </li>
          <li>
            Amazon S3 and CloudFront for sandbox workspaces, builds, and preview
            assets
          </li>
          <li>
            Docker containers on our own infrastructure to run your projects
            while you work on them
          </li>
          <li>GitHub, for sign-in and for repositories you connect</li>
          <li>
            Cloudflare, for email delivery on the edwardd.app domain and traffic
            handling
          </li>
          <li>
            Sentry, for error reporting, which may include request context and
            stack traces
          </li>
        </ul>
      </>
    ),
  },
  {
    heading: "Model providers",
    body: (
      <>
        <p>
          When you run a generation, the prompt content for that request is sent
          to the model provider you selected, which is Anthropic, OpenAI, or
          Google. Your API key authorizes that request. Each provider handles
          what it receives under its own privacy policy and terms.
        </p>
        <p>
          Edward sends prompts to providers only when you ask it to do work. We
          do not use your prompts to train models, and we do not sell your
          content.
        </p>
      </>
    ),
  },
  {
    heading: "How we use information",
    body: (
      <ul className="list-disc pl-6 space-y-1">
        <li>To run the service: sign-in, chats, sandboxes, builds, and previews</li>
        <li>To keep your projects working and to resume them when you return</li>
        <li>To sync projects with the GitHub repositories you authorize</li>
        <li>
          To enforce daily usage limits, protect against abuse, and keep the
          service available
        </li>
        <li>To diagnose errors and investigate security incidents</li>
        <li>To respond to your support requests</li>
      </ul>
    ),
  },
  {
    heading: "What we do not do",
    body: (
      <>
        <p>
          We do not sell your personal information. We do not run advertising or
          cross-site tracking. Edward does not use Google Analytics or any other
          advertising analytics product.
        </p>
      </>
    ),
  },
  {
    heading: "Sharing",
    body: (
      <>
        <p>
          We share information with the service providers listed above, and in
          two other cases: when we are legally required to disclose it, and when
          we are part of a business transfer such as a merger or sale of assets.
        </p>
        <p>
          Your prompts and generated code are not shared with anyone beyond the
          model provider handling the request.
        </p>
      </>
    ),
  },
  {
    heading: "Retention",
    body: (
      <>
        <p>
          Account data, chats, prompts, generated files, and run records are kept
          for as long as your account exists. Deleting your account removes
          them. Sandbox containers and their contents are deleted when a
          project is closed or abandoned, and logs are rotated out on a short
          retention cycle.
        </p>
      </>
    ),
  },
  {
    heading: "Security",
    body: (
      <>
        <p>
          Traffic is served over HTTPS. Provider API keys are encrypted at rest
          with AES-256-GCM. Sandboxes run as isolated containers with CPU and
          memory limits rather than sharing a filesystem with the host.
        </p>
        <p>
          No system is perfectly secure. If a breach affects your information we
          will tell you and describe what we changed.
        </p>
      </>
    ),
  },
  {
    heading: "Your choices and rights",
    body: (
      <>
        <p>
          You can delete your account and its data from within the app. You can
          also ask us to export or delete your information by writing to the
          address at the end of this policy.
        </p>
        <p>
          Depending on where you live you may have rights to access, correct,
          export, or delete your personal information, or to object to certain
          processing. We will honour those requests. We do not sell personal
          information, so we do not treat &ldquo;sale&rdquo; opt-out requests as
          applicable.
        </p>
      </>
    ),
  },
  {
    heading: "Children",
    body: (
      <p>
        Edward is a developer tool and is not intended for anyone under 16. We
        do not knowingly collect information from children. If you believe a
        child has given us personal information, write to us and we will delete
        it.
      </p>
    ),
  },
  {
    heading: "International transfers",
    body: (
      <p>
        Our infrastructure and our service providers process data outside your
        country of residence, including in India and the United States. Some
        providers offer their own transfer safeguards.
      </p>
    ),
  },
  {
    heading: "Changes to this policy",
    body: (
      <p>
        When this policy changes we update the date at the top of the page. If a
        change materially affects your data we will tell you before it takes
        effect.
      </p>
    ),
  },
  {
    heading: "Contact",
    body: (
      <>
        <p>Edward questions, privacy requests, and support all go to:</p>
        <ul className="list-none space-y-1">
          <li>
            <span className="text-foreground/90 font-medium">Legal operator:</span>{" "}
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

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-[100dvh] text-foreground">
      <div className="container max-w-3xl mx-auto px-4 sm:px-6 py-12 md:py-16 lg:py-20">
        <div className="mb-12 md:mb-16 lg:mb-20">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight text-foreground">
            Privacy Policy
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
