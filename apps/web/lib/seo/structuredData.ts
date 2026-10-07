import { CONTACT_EMAIL, REPOSITORY_URL, SITE_DESCRIPTION } from "@/lib/site";
import { PRODUCTION_SITE_URL } from "@/lib/seo/siteUrl";

const SITE_URL = PRODUCTION_SITE_URL;
// Every URL below was verified to resolve. Do not add an identity here that
// has not been checked, because a sameAs pointing at a page that does not
// exist works against the entity it is meant to support.
const FOUNDER = {
  name: "Shubhojeet Bera",
  url: "https://www.shubhojeet.com/",
  sameAs: [
    "https://www.linkedin.com/in/shubhobera",
    "https://github.com/shubho0908",
  ],
};

const PRODUCT_DESCRIPTION =
  "AI software development platform for generating, running, previewing, iterating on, and shipping web applications from natural-language instructions. Supports Anthropic Claude, OpenAI, and Gemini with bring your own key (BYOK).";

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
      description: SITE_DESCRIPTION,
      inLanguage: "en",
      publisher: { "@id": `${SITE_URL}/#organization` },
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
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "Person",
      "@id": `${SITE_URL}/#founder`,
      name: FOUNDER.name,
      jobTitle: "Founder",
      url: FOUNDER.url,
      sameAs: FOUNDER.sameAs,
      worksFor: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "Edward",
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      foundingDate: "2026-01",
      founder: { "@id": `${SITE_URL}/#founder` },
      sameAs: [REPOSITORY_URL],
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
