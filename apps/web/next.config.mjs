import { withSentryConfig } from "@sentry/nextjs";
/** @type {import('next').NextConfig} */
const cdnHostname = (() => {
  try {
    const cdnUrl =
      process.env.NEXT_PUBLIC_CDN_URL || process.env.NEXT_PUBLIC_ASSETS_URL;
    if (!cdnUrl) return null;
    return new URL(cdnUrl).hostname;
  } catch {
    return null;
  }
})();

const SENTRY_SAAS_HOST_REGEX = /^o\d+\.ingest(?:\.[a-z]{2})?\.sentry\.io$/;
const NUMERIC_PROJECT_ID_REGEX = /^\d+$/;

function hasValidSentryTunnelDsn(rawDsn) {
  if (!rawDsn) {
    return false;
  }

  try {
    const parsed = new URL(rawDsn);
    if (!parsed.username || !SENTRY_SAAS_HOST_REGEX.test(parsed.host)) {
      return false;
    }

    const pathSegments = parsed.pathname.split("/").filter(Boolean);
    const projectId = pathSegments[pathSegments.length - 1] ?? "";
    return NUMERIC_PROJECT_ID_REGEX.test(projectId);
  } catch {
    return false;
  }
}

const hasValidSentryTunnel = hasValidSentryTunnelDsn(
  process.env.NEXT_PUBLIC_SENTRY_DSN,
);

if (process.env.NEXT_PUBLIC_SENTRY_DSN && !hasValidSentryTunnel) {
  console.warn(
    "[Sentry] NEXT_PUBLIC_SENTRY_DSN is invalid for tunnel routing. Disabled /monitoring tunnel to prevent ProjectId rejections.",
  );
}

const nextConfig = {
  async headers() {
    return [
      {
        // Public HTML, robots.txt and sitemap.xml must revalidate at the edge
        // so a copy change is never served from a stale cache. Hashed build
        // assets under _next stay immutable and are excluded.
        source: "/:path((?!_next/static|_next/image).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
  transpilePackages: ["@edward/ui", "@shadergradient/react"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  images: {
    qualities: [68, 70, 72, 75, 78, 80],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "assets.pragnyaa.in",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "edward-cdn.s3.amazonaws.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "edward-cdn.s3.us-east-1.amazonaws.com",
        pathname: "/**",
      },
      ...(cdnHostname
        ? [
            {
              protocol: "https",
              hostname: cdnHostname,
              pathname: "/**",
            },
          ]
        : []),
    ],
  },
};

export default withSentryConfig(nextConfig, {
  org: "pragnya-7w",
  project: "edward-web",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: hasValidSentryTunnel ? "/monitoring" : undefined,

  webpack: {
    automaticVercelMonitors: true,
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
