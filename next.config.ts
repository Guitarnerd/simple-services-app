import type { NextConfig } from "next";

// cacheComponents / partialPrefetching (on in the create-next-app template) are
// left off: every page here is per-user and permission-gated, so pages render
// on each request rather than from a cached shell.
const nextConfig: NextConfig = {
  // Only this site may put its own pages in a frame (merged screens show several tabs side by
  // side that way). Another site framing the app could trick someone into clicking its buttons.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
    ];
  },
  // Multi View was called the matrix, and links to it may be saved.
  async redirects() {
    return [{ source: "/plans/matrix", destination: "/plans/multi-view", permanent: true }];
  },
  // Keep the dev badge off the sidebar's "Log out" button.
  devIndicators: { position: "bottom-right" },
  // The dev server only hands its scripts to localhost unless told otherwise, so
  // a phone or another computer got a page whose buttons did nothing. These let
  // the home network, Tailscale and this computer's name in. Development only.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "100.*.*.*", "**.ts.net", "desktop-apf8sn7", "*.local"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
