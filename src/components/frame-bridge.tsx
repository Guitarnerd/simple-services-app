"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Lets the merged screen (components/workspace.tsx) ask this page to reload its data, for
// example after a person is dropped on a position in the pane beside it.
export function FrameBridge() {
  const router = useRouter();
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      if (event.data?.type === "ss-refresh") router.refresh();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [router]);
  return null;
}
