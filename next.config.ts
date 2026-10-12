import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Lab report uploads (resized photos or a PDF) go through a server action.
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
