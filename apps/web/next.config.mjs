import { withSentryConfig } from "@sentry/nextjs";
/** @type {import('next').NextConfig} */
const cdnHostname = (() => {
  try {
    const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL;
    if (!cdnUrl) return null;
    return new URL(cdnUrl).hostname;
  } catch {
    return null;
  }
})();

const nextConfig = {
  transpilePackages: ["@edward/ui", "@shadergradient/react"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  images: {
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
  tunnelRoute: "/monitoring",

  webpack: {
    automaticVercelMonitors: true,
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
