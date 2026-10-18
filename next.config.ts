import type { NextConfig } from "next";

// Sent with every page: HTTPS only, no framing by other sites (the app frames its own PDFs), no MIME sniffing,
// and no full URLs (which can carry patient ids) leaked to other sites in Referer.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  // The microphone is for dictation (src/components/dictation.tsx), on this site only.
  { key: "Permissions-Policy", value: "geolocation=(), microphone=(self), payment=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  experimental: {
    // Lab report uploads (resized photos or a PDF) go through a server action.
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
