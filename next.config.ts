import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins:
    process.env.NODE_ENV === "development" ? ["192.168.1.69"] : undefined,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  reactStrictMode: true,
  typedRoutes: true,
  async headers() {
    const production = process.env.NODE_ENV === "production";
    const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").origin;
    const socketOrigin = apiOrigin.replace(/^http/, "ws");
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          ...(production ? [
            { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
            { key: "Content-Security-Policy", value: `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' ${apiOrigin} ${socketOrigin} https://api.mehtaxd.com wss://api.mehtaxd.com; frame-src 'self' https:; upgrade-insecure-requests` },
          ] : []),
        ],
      },
      { source: "/admin/:path*", headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0, must-revalidate" }] },
      { source: "/api/admin/:path*", headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0, must-revalidate" }] },
    ];
  },
};

export default nextConfig;
