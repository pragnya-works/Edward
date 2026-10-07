const SITE_URL = "https://edwardd.app";
const REPOSITORY_URL = "https://github.com/pragnya-works/Edward";
const CONTACT_EMAIL = "founder@edwardd.app";

const PRODUCT_DESCRIPTION =
  "AI software development platform for generating, running, previewing, iterating on, and shipping web applications from natural-language instructions.";

/**
 * Structured data for the public surface. Entity ids are pinned to the
 * production origin so the graph stays stable across deployments.
 */

export const structuredData: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: "Edward",
        description: PRODUCT_DESCRIPTION,
        inLanguage: "en",
        publisher: { "@id": `${SITE_URL}/#operator` },
        about: { "@id": `${SITE_URL}/#software` },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#software`,
        name: "Edward",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Web",
        url: SITE_URL,
        description: PRODUCT_DESCRIPTION,
        codeRepository: REPOSITORY_URL,
        datePublished: "2026-01",
        author: { "@id": `${SITE_URL}/#founder` },
        creator: { "@id": `${SITE_URL}/#founder` },
      },
      {
        "@type": "Person",
        "@id": `${SITE_URL}/#founder`,
        name: "Shubhojeet Bera",
        jobTitle: "Founder",
        url: SITE_URL,
        worksFor: { "@id": `${SITE_URL}/#operator` },
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#operator`,
        name: "Pragnya Works",
        url: SITE_URL,
        email: CONTACT_EMAIL,
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: CONTACT_EMAIL,
          availableLanguage: "English",
        },
      },
    ],
};