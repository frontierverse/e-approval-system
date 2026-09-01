import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { serverActionBodySizeLimitMb } from "./src/lib/attachment-limits";

export default function nextConfig(phase: string): NextConfig {
  return {
    // Keep `next dev` isolated from production builds. Sharing the same output
    // directory can briefly invalidate nested App Router routes during a build.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
    allowedDevOrigins: ["127.0.0.1"],
    outputFileTracingIncludes: {
      "/*": ["public/fonts/**/*"],
    },
    experimental: {
      serverActions: {
        bodySizeLimit: `${serverActionBodySizeLimitMb}mb`,
      },
    },
  };
}
