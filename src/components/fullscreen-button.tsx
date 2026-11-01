"use client";

import { useSyncExternalStore } from "react";
import { Icon } from "@/components/ui";

function subscribe(onChange: () => void) {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
}
const state = () => (document.fullscreenElement ? "on" : document.fullscreenEnabled ? "off" : "none");

// Whether the browser is showing the app full screen: "on", "off", or "none"
// where it can't (an iPhone's browser, for one).
export function useFullscreen() {
  const fullscreen = useSyncExternalStore(subscribe, state, () => "none" as const);
  const toggle = () => (fullscreen === "on" ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});
  return [fullscreen, toggle] as const;
}

// Hides the browser's bars so the app fills the screen. It stays that way while
// moving around the app. Not shown where the browser can't do it, or when the app
// was opened from the home screen and has no bars to hide.
export function FullscreenButton() {
  const [fullscreen, toggle] = useFullscreen();
  if (fullscreen === "none") return null;

  return (
    <button type="button" onClick={toggle} aria-pressed={fullscreen === "on"} className="btn btn-secondary [@media(display-mode:standalone)]:hidden">
      <Icon name={fullscreen === "on" ? "shrink" : "expand"} className="h-4 w-4" />
      {fullscreen === "on" ? "Exit full screen" : "Go full screen"}
    </button>
  );
}
