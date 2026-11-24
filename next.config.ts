import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
  // read Excel uploads on the server (Admin → Data Management) – plain Node package, not bundled
  serverExternalPackages: ["exceljs"],
  // Dev server only: hosts besides localhost that may load the dev bundles.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
