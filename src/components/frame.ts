"use client";

import { useSyncExternalStore } from "react";

// What a person being dragged from the People pane of a merged screen carries.
export const PERSON_MIME = "application/x-simple-services-person";

const none = () => () => {};

// True when this page is a pane inside a merged screen (the theme script in layout.tsx notes it).
export function useEmbedded(): boolean {
  return useSyncExternalStore(
    none,
    () => document.documentElement.dataset.embedded === "1",
    () => false,
  );
}

// Tell the merged screen that something changed, so every pane on it reloads its data.
export function notifyPanes() {
  if (window.parent !== window) window.parent.postMessage({ type: "ss-refresh-all" }, window.location.origin);
}
