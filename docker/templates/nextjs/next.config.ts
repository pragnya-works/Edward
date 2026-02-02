import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  assetPrefix: '/preview/',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  typescript: {
    // Type errors are caught by validation pipeline (validateTypes) before build.
    // This allows faster builds in sandboxed preview environments.
    // See: apps/api/services/validation/pipeline.ts
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
