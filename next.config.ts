import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The agent registry + prisma run server-side only.
  serverExternalPackages: ["@prisma/client", "@anthropic-ai/sdk"],
  webpack: (config) => {
    // Resolve NodeNext-style ".js" specifiers on TS sources to their .ts/.tsx
    // files (real .js still falls through), so the same imports work under tsc,
    // Vitest, and the Next bundler.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
