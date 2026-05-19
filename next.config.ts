import type { NextConfig } from "next";
import { serverActionBodySizeLimitMb } from "./src/lib/attachment-limits";

const nextConfig: NextConfig = {
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

export default nextConfig;
