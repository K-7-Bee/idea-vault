import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Browser acceptance builds must never replace the deployable production output.
  distDir: process.env.VAULT_E2E === "1" ? ".next-e2e" : ".next",
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      {
        // Browsers must always re-check the service worker so updates arrive.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
