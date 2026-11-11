import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Image optimisation needs a Node or Cloudflare Images service; photos come from R2 at their stored size (ADR-001).
const nextConfig: NextConfig = {
  images: { unoptimized: true },
  typedRoutes: false,
};

export default nextConfig;

// Gives `next dev` the same bindings (D1, R2, Queues) as the deployed Worker.
initOpenNextCloudflareForDev();
