import { Metadata } from "next";
import { getCanonicalUrl, STATIC_OG_IMAGE_URL } from "@/lib/seo/siteUrl";
import { Shield } from "lucide-react";

const privacyCanonicalUrl = getCanonicalUrl("/privacy");

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Learn how Pragnya Works collects, uses, and protects your information when you use Edward.",
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
      "Learn how Pragnya Works collects, uses, and protects your information when you use Edward.",
    images: [STATIC_OG_IMAGE_URL],
  },
};

const PRIVACY_POLICY_CONTENT = (
    <main className="min-h-[100dvh] text-foreground">
      <div className="container max-w-3xl mx-auto px-4 sm:px-6 py-12 md:py-16 lg:py-20">
        <div className="mb-12 md:mb-16 lg:mb-20">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/5 border border-primary/10">
              <Shield className="w-4 h-4 text-primary/70" />
            </div>
            <span className="text-xs font-medium tracking-[0.2em] uppercase text-muted-foreground/60">
              Legal
            </span>
          </div>

          <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight text-foreground">
            Privacy Policy
          </h1>

          <p className="mt-3 text-base md:text-lg text-muted-foreground/80 max-w-lg leading-relaxed">
            How we collect, use, and protect your information.
          </p>

          <p className="mt-4 text-sm text-muted-foreground/50">
            Last Updated: February 28, 2026
          </p>
        </div>

        <div className="prose-container space-y-10 text-sm leading-relaxed text-muted-foreground">
          <p>
            This Privacy Policy describes how Pragnya Works (&ldquo;we,&rdquo;
            &ldquo;us,&rdquo; or &ldquo;our&rdquo;) collects, uses, and shares
            information about you when you use our website/application Edward (
            <a
              href="https://edwardd.app"
              className="text-foreground underline underline-offset-4 hover:text-primary transition-colors"
            >
              https://edwardd.app
            </a>
            ).
          </p>
          <p>
            By using our services, you agree to the collection and use of
            information in accordance with this policy.
          </p>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground tracking-tight">
              1. Information We Collect
            </h2>
            <p>
              We collect several types of information for various purposes to
              provide and improve our service to you.
            </p>
            <h3 className="text-base font-medium text-foreground/90">
              1.1 Personal Information
            </h3>
            <p>
              When you use our services, we may collect the following personal
              information:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Full name</li>
              <li>Email address</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground tracking-tight">
              2. How We Use Your Information
            </h2>
            <p>We use the collected information for various purposes:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>To provide and maintain our service</li>
              <li>To notify you about changes to our service</li>
              <li>To provide customer support</li>
              <li>
                To gather analysis or valuable information to improve our service
              </li>
              <li>To monitor the usage of our service</li>
              <li>To detect, prevent and address technical issues</li>
              <li>
                To communicate with you about products, services, offers, and
                events
              </li>
              <li>To analyze usage patterns and trends</li>
            </ul>
            <p>
              We will not use your information for purposes other than those
              described in this Privacy Policy without your explicit consent.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground tracking-tight">
              3. Sharing Your Information
            </h2>
            <p>
              We do not sell, trade, or rent your personal information to third
              parties. We may share your information in the following
              circumstances:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <span className="text-foreground/90 font-medium">
                  Service Providers:
                </span>{" "}
                We may employ third-party companies and individuals to facilitate
                our service, provide service on our behalf, perform
                service-related tasks, or assist us in analyzing how our service
                is used.
              </li>
              <li>
                <span className="text-foreground/90 font-medium">
                  Legal Requirements:
                </span>{" "}
                We may disclose your information if required to do so by law or
                in response to valid requests by public authorities (e.g., a
                court or government agency).
              </li>
              <li>
                <span className="text-foreground/90 font-medium">
                  Business Transfers:
                </span>{" "}
                If we are involved in a merger, acquisition, or asset sale, your
                personal information may be transferred. We will provide notice
                before your personal information is transferred and becomes
                subject to a different Privacy Policy.
              </li>
              <li>
                <span className="text-foreground/90 font-medium">
                  With Your Consent:
                </span>{" "}
                We may disclose your personal information for any other purpose
                with your consent.
              </li>
            </ul>

            <h3 className="text-base font-medium text-foreground/90">
              3.1 Third-Party Services
            </h3>
            <p>
              We use the following types of third-party services that may collect
              information:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                <span className="text-foreground/90 font-medium">
                  Analytics Services:
                </span>{" "}
                We use analytics services (such as Google Analytics) to
                understand how users interact with our website/app. These
                services may use cookies and collect usage data.
              </li>
            </ul>
            <p>
              These third-party service providers have their own privacy policies
              addressing how they use such information.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground tracking-tight">
              4. Data Security
            </h2>
            <p>
              The security of your personal information is important to us. We
              implement appropriate technical and organizational security
              measures to protect your personal information against unauthorized
              access, alteration, disclosure, or destruction.
            </p>
            <p>These measures include:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Encryption of data in transit using SSL/TLS</li>
              <li>Secure servers and databases</li>
              <li>Regular security assessments</li>
              <li>Access controls and authentication</li>
              <li>Employee training on data protection</li>
            </ul>
            <p>
              However, please note that no method of transmission over the
              Internet or method of electronic storage is 100% secure. While we
              strive to use commercially acceptable means to protect your
              personal information, we cannot guarantee its absolute security.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground tracking-tight">
              5. Data Retention
            </h2>
            <p>
              We will retain your personal information only for as long as
              necessary to fulfill the purposes outlined in this Privacy Policy,
              unless a longer retention period is required or permitted by law.
            </p>
            <p>
              When we no longer need your personal information, we will securely
              delete or anonymize it. The criteria we use to determine retention
              periods include:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                The length of time we have an ongoing relationship with you
              </li>
              <li>
                Whether there is a legal obligation to which we are subject
              </li>
              <li>
                Whether retention is advisable in light of our legal position
              </li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground tracking-tight">
              6. Children&apos;s Privacy
            </h2>
            <p>
              Our service is not intended for children under the age of 13 (or
              16 in the European Economic Area). We do not knowingly collect
              personal information from children under these ages.
            </p>
            <p>
              If you are a parent or guardian and you are aware that your child
              has provided us with personal information, please contact us. If we
              become aware that we have collected personal information from
              children without verification of parental consent, we will take
              steps to remove that information from our servers.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground tracking-tight">
              7. International Data Transfers
            </h2>
            <p>
              Your information, including personal data, may be transferred to
              and maintained on computers located outside of your state,
              province, country, or other governmental jurisdiction where data
              protection laws may differ.
            </p>
            <p>
              If you are located outside India and choose to provide information
              to us, please note that we transfer the data, including personal
              data, to India and process it there.
            </p>
            <p>
              We will take all steps reasonably necessary to ensure that your
              data is treated securely and in accordance with this Privacy
              Policy.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground tracking-tight">
              8. Links to Other Websites
            </h2>
            <p>
              Our service may contain links to other websites that are not
              operated by us. If you click on a third-party link, you will be
              directed to that third party&apos;s site.
            </p>
            <p>
              We strongly advise you to review the Privacy Policy of every site
              you visit. We have no control over and assume no responsibility for
              the content, privacy policies, or practices of any third-party
              sites or services.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground tracking-tight">
              9. Changes to This Privacy Policy
            </h2>
            <p>
              We may update our Privacy Policy from time to time. We will notify
              you of any changes by posting the new Privacy Policy on this page
              and updating the &ldquo;Last Updated&rdquo; date at the top.
            </p>
            <p>
              We will notify you via email and/or a prominent notice on our
              service prior to the change becoming effective if the changes are
              significant.
            </p>
            <p>
              You are advised to review this Privacy Policy periodically for any
              changes. Changes to this Privacy Policy are effective when they are
              posted on this page.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground tracking-tight">
              10. Contact Us
            </h2>
            <p>
              If you have any questions about this Privacy Policy, please
              contact us:
            </p>
            <ul className="list-none space-y-1">
              <li>
                <span className="text-foreground/90 font-medium">
                  Company:
                </span>{" "}
                Pragnya Works
              </li>
              <li>
                <span className="text-foreground/90 font-medium">Email:</span>{" "}
                <a
                  href="mailto:founder@edwardd.app"
                  className="text-foreground underline underline-offset-4 hover:text-primary transition-colors"
                >
                  founder@edwardd.app
                </a>
              </li>
              <li>
                <span className="text-foreground/90 font-medium">
                  Website:
                </span>{" "}
                <a
                  href="https://edwardd.app"
                  className="text-foreground underline underline-offset-4 hover:text-primary transition-colors"
                >
                  https://edwardd.app
                </a>
              </li>
            </ul>
            <p>
              We are committed to resolving complaints about your privacy and
              our collection or use of your personal information. If you have
              concerns, please contact us first so we can attempt to resolve your
              issue.
            </p>
          </section>
        </div>
      </div>
    </main>
);

export default function PrivacyPolicyPage() {
  return PRIVACY_POLICY_CONTENT;
}
