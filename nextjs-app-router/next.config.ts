import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep `next dev` from writing an AGENTS.md into the sample.
  agentRules: false,
  // The detector assets under /models-v3 are large and versioned by the SDK: cache them.
  async headers() {
    return [{ source: "/models-v3/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=604800" }] }];
  },
};

export default nextConfig;
