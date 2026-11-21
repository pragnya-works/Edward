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

export default nextConfig;
