import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

// Phase 6B: the protective headers go on every response. The site CSP goes everywhere except
// /api/drive/file/*, which serves Drive files with its own stricter "default-src 'none'; sandbox"
// policy that must not be replaced (the Drive browser test caught this).
const headers = securityHeaders();
const isCsp = (h: { key: string }) => h.key.startsWith("Content-Security-Policy");

const nextConfig: NextConfig = {
  // Browser acceptance builds must never replace the deployable production output.
  distDir: process.env.VAULT_E2E === "1" ? ".next-e2e" : ".next",
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      { source: "/:path*", headers: headers.filter((h) => !isCsp(h)) },
      { source: "/((?!api/drive/file/).*)", headers: headers.filter(isCsp) },
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
