import { CONTACT_EMAIL, REPOSITORY_URL } from "@/lib/site";
import { getSiteUrl } from "@/lib/seo/siteUrl";

// Entity ids follow the origin the site actually canonicalises to, so the
// graph stays stable and matches the canonical URLs in the page metadata.
const SITE_URL = getSiteUrl()?.origin ?? "https://edwardd.app";
// Every URL below was verified to resolve. Do not add an identity here that
// has not been checked, because a sameAs pointing at a page that does not
// exist works against the entity it is meant to support.
const OPERATOR = {
  name: "Pragnya Works",
  url: "https://www.pragnyaa.in/",
  sameAs: ["https://github.com/pragnya-works"],
};

const FOUNDER = {
  name: "Shubhojeet Bera",
  url: "https://www.shubhojeet.com/",
  sameAs: [
    "https://www.linkedin.com/in/shubhobera",
    "https://github.com/shubho0908",
  ],
};

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
      operator: { "@id": `${SITE_URL}/#operator` },
    },
    {
      "@type": "Person",
      "@id": `${SITE_URL}/#founder`,
      name: FOUNDER.name,
      jobTitle: "Founder",
      url: FOUNDER.url,
      sameAs: FOUNDER.sameAs,
      worksFor: { "@id": `${SITE_URL}/#operator` },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#operator`,
      name: OPERATOR.name,
      url: OPERATOR.url,
      foundingDate: "2026",
      founder: { "@id": `${SITE_URL}/#founder` },
      sameAs: OPERATOR.sameAs,
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