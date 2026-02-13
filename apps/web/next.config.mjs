/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@edward/ui", "@shadergradient/react"],
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
    ],
  },
};

export default nextConfig;
