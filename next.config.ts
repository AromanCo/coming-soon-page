import type { NextConfig } from "next";

// Mini App rendering is scoped to one deliberately public, data-free route.
// Bale Web uses an iframe, so its Mini App response cannot inherit XFO=DENY.
// Keep the rest of the website deny-framed. Reverse proxies must not re-add
// X-Frame-Options on this route; verify the final HTTPS response before rollout.
const sharedSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];
const securityHeaders = [
  ...sharedSecurityHeaders,
  { key: "X-Frame-Options", value: "DENY" },
];
const miniAppSecurityHeaders = [
  ...sharedSecurityHeaders,
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'self' https://*.bale.ai https://*.telegram.org; frame-src 'self' https://*.bale.ai",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      {
        // Keep the production website deny-framed; explicitly exclude the
        // isolated Mini App route and its optional child paths.
        source: "/((?!scent-quest/mini(?:/|$)).*)",
        headers: securityHeaders,
      },
      {
        source: "/scent-quest/mini/:path*",
        headers: miniAppSecurityHeaders,
      },
    ];
  },
};

export default nextConfig;
