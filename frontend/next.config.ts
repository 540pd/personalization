import type { NextConfig } from "next";
import { version } from "./package.json";

// `turbopack.root` is pinned to this directory to prevent Next.js from
// misdetecting the monorepo root. Without it, Next.js walks upward and finds
// the root-level package-lock.json (husky-only tooling), treats the repo root
// as the workspace root, and nests standalone output one level deeper than
// the Cloud Run runner expects (.next/standalone/frontend/.next/... instead
// of .next/standalone/.next/...). Pinning removes that ambiguity.
const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: import.meta.dirname,
  },
  poweredByHeader: false,
  // Sent with a support message (#428), so the team knows which build it came from.
  env: { NEXT_PUBLIC_APP_VERSION: version },
  // The dev-tools button defaults to bottom-left, where it covers the
  // minimised sidebar's user button. Next keeps a moved button's position
  // per checkout in .next/cache, so a fresh checkout or worktree failed
  // sidebar.spec.ts:224 while an older one passed. Dev only.
  devIndicators: { position: "bottom-right" },
  webpack: (config) => {
    // Konva's package.json `main` field resolves to index-node.js which
    // requires the `canvas` npm package (a native Node.js binding). Webpack
    // picks this up even for the browser bundle. Stubbing `canvas` to false
    // tells webpack to skip it — Konva detects the browser at runtime and uses
    // the native HTMLCanvasElement instead.
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    return config;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
