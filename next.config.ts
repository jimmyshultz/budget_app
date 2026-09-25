import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the project root; a stray package-lock.json in the home folder otherwise confuses detection.
  turbopack: { root: __dirname },
  // Turbopack's on-disk cache snapshots environment variables, which here include the
  // Plaid secret and the token encryption key. Keep them off disk; the app builds fast anyway.
  experimental: {
    turbopackFileSystemCacheForDev: false,
    turbopackFileSystemCacheForBuild: false,
  },
  // Self-contained server build (.next/standalone) for the desktop app. Only when asked for,
  // since `next start` (npm run app) doesn't support it.
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
  // No next/image optimization is used; this also lets desktop builds drop `sharp`.
  images: { unoptimized: true },
  // Migrations are read from disk at startup, so the tracer can't see them.
  outputFileTracingIncludes: { "/*": ["./drizzle/**/*"] },
  // NEVER ship local data or secrets: the tracer sees path.join(cwd, "data") in the config module
  // and would copy the database. "**" covers every entry, including proxy and instrumentation.
  // scripts/build-desktop.mjs double-checks the output.
  outputFileTracingExcludes: { "**": ["./data/**/*", "./.env*"] },
};

export default nextConfig;
