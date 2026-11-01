import type { MetadataRoute } from "next";

// Lets the app be added to a phone or tablet's home screen and open full-screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Simple Services",
    short_name: "Services",
    description: "Service planning, scheduling and song charts.",
    start_url: "/",
    display: "standalone",
    background_color: "#121314",
    theme_color: "#121314",
    icons: [
      // Full-bleed, with the artwork inside the middle 80%, so Android can crop it to its own shape.
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
