"use client";

import { useEffect } from "react";

// Registers the offline cache (public/sw.js). Only in the built app: in
// development it would serve stale files while code is being changed.
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
