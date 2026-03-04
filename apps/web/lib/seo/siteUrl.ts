export const STATIC_OG_IMAGE_URL = "https://assets.pragnyaa.in/home/OG.png";

function parseSiteUrl(input: string | undefined): URL | null {
  const value = input?.trim();
  if (!value) return null;

  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  try {
    const url = new URL(withScheme);
    url.hash = "";
    url.search = "";
    url.pathname = "/";
    return url;
  } catch {
    return null;
  }
}

export function getSiteUrl(): URL | null {
  return (
    parseSiteUrl(process.env.NEXT_PUBLIC_SITE_URL)
  );
}

export function getCanonicalUrl(pathname: string): string | null {
  const siteUrl = getSiteUrl();
  if (!siteUrl) return null;

  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return new URL(normalized, siteUrl).toString();
}
