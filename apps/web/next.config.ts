import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Shared types/constants are TypeScript source in the monorepo.
  transpilePackages: ["@texpr/shared"],
};

export default nextConfig;
