"use client";

import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui";

// Keep each embedded page's theme in step with this one; the toggle only changes this document.
function useThemeSync() {
  const frames = useRef<(HTMLIFrameElement | null)[]>([]);
  useEffect(() => {
    const apply = () => {
      const theme = document.documentElement.dataset.theme;
      for (const frame of frames.current) {
        try {
          if (theme && frame?.contentDocument) frame.contentDocument.documentElement.dataset.theme = theme;
        } catch {}
      }
    };
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    apply();
    return () => observer.disconnect();
  }, []);
  return frames;
}

// Merged screens need room: below the width where the sidebar appears (Tailwind's md) they are off.
const WIDE = "(min-width: 768px)";
function subscribeToWidth(onChange: () => void) {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function Workspace({ panes }: { panes: { href: string; label: string }[] }) {
  const frames = useThemeSync();
  const wide = useSyncExternalStore(
    subscribeToWidth,
    () => window.matchMedia(WIDE).matches,
    () => true,
  );

  // A pane changed something (a person dropped on a position, someone removed): have the others reload.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.data?.type !== "ss-refresh-all") return;
      for (const frame of frames.current) {
        if (frame?.contentWindow && frame.contentWindow !== event.source) frame.contentWindow.postMessage({ type: "ss-refresh" }, window.location.origin);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [frames]);

  if (!wide) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Merged screens need a bigger window</h1>
        <p className="muted text-sm">Showing several tabs side by side doesn&apos;t work on a phone, so open them one at a time:</p>
        <div className="flex flex-col gap-2">
          {panes.map((pane) => (
            <Link key={pane.href} href={pane.href} className="btn btn-secondary justify-between">
              {pane.label}
              <Icon name="chevron" className="h-4 w-4" />
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="grid flex-1 gap-3 p-3 lg:h-screen lg:[grid-template-columns:repeat(var(--panes),minmax(0,1fr))]"
      style={{ "--panes": panes.length } as React.CSSProperties}
    >
      {panes.map((pane, index) => (
        <section key={pane.href} className="flex h-[80dvh] min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface lg:h-auto">
          <header className="flex items-center justify-between gap-2 border-b border-line bg-black/[0.025] px-4 py-2 dark:bg-white/[0.03]">
            <h2 className="eyebrow uppercase">{pane.label}</h2>
            <Link href={pane.href} aria-label={`Open ${pane.label} on its own`} title="Open on its own" className="icon-btn !h-7 !w-7">
              <Icon name="expand" className="h-4 w-4" />
            </Link>
          </header>
          <iframe
            ref={(el) => {
              frames.current[index] = el;
            }}
            src={pane.href}
            title={pane.label}
            onLoad={() => {
              try {
                const doc = frames.current[index]?.contentDocument;
                if (doc) doc.documentElement.dataset.theme = document.documentElement.dataset.theme ?? "dark";
              } catch {}
            }}
            className="min-h-0 w-full flex-1 border-0 bg-background"
          />
        </section>
      ))}
    </div>
  );
}
