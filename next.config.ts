import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for Cloud Run — bundles only the files we need
  // for the runtime. Matches the collablists deploy pattern.
  output: "standalone",
};

export default nextConfig;
