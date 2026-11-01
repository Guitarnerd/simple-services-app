"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChartScreen, type ScreenMode } from "@/components/chart-screen";
import { PlayButton, usePlayer, type Track } from "@/components/player";
import { Icon } from "@/components/ui";
import { useFullscreen } from "@/components/fullscreen-button";

export type SetlistSong = {
  id: string;
  title: string;
  // Played as its tag in this service.
  tag?: boolean;
  author: string | null;
  // Key for this service.
  key: string | null;
  details: string | null;
  // The order of sections in short form: "Intro V1 Ch×2 Br".
  sequence: string | null;
  notes: string | null;
  chart: string | null;
  chartKey: string | null;
  // Uploaded charts, shown when there is no typed chart.
  files: { id: string; name: string; isImage: boolean }[];
  // Position in `tracks`, when the song has something to listen to.
  trackIndex: number | null;
  // Buttons shown under the sheet, such as "Edit song sheet".
  actions?: { label: string; href: string }[];
};

const SIZES = { S: 13, M: 16, L: 20, XL: 24 } as const;
// Numerals first and by default: they read the same in every key.
const MODES: ScreenMode[] = ["numerals", "chords", "numbers", "lyrics"];

// A swipe only turns the page when it is clearly sideways: this far, this much
// more across than up or down, and done in one quick movement.
const SWIPE_DISTANCE = 90;
const SWIPE_STRAIGHTNESS = 3;
const SWIPE_MS = 600;


// The music stand: every song of a service as a page of its own, covering the
// whole window including the app's navigation. One song shows at a time and
// scrolls up and down like any page; the arrows, the arrow keys or a firm
// sideways swipe move to the next song.
export function SetlistViewer({
  back,
  heading,
  songs,
  tracks,
  startAt = 0,
}: {
  // Where the arrow at the top left goes: the plan, or the song list.
  back: { href: string; label: string };
  heading: string;
  songs: SetlistSong[];
  tracks: Track[];
  // Which song to open on.
  startAt?: number;
}) {
  const swipe = useRef<{ x: number; y: number; at: number } | null>(null);
  const pages = useRef<HTMLDivElement>(null);
  const [fullscreen, toggleFullscreen] = useFullscreen();
  const [index, setIndex] = useState(startAt);
  const [size, setSize] = useState<keyof typeof SIZES>("M");
  const [mode, setMode] = useState<ScreenMode>("numerals");
  // The phone's settings popover.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [canSave, setCanSave] = useState(false);
  const { isOpen: playerOpen } = usePlayer();

  const go = useCallback(
    (to: number) => {
      if (to >= 0 && to < songs.length) setIndex(to);
    },
    [songs.length]
  );

  // Once a touch is plainly heading sideways it belongs to the page turn, not the browser.
  // Otherwise the browser treats the swipe as a flick of its own and swallows the next tap.
  // (This has to be a listener of our own: the ones React adds can't refuse a touch.)
  useEffect(() => {
    const element = pages.current;
    if (!element) return;
    const onMove = (event: TouchEvent) => {
      const start = swipe.current;
      const touch = event.touches[0];
      if (!start || !touch || !event.cancelable) return;
      const across = Math.abs(touch.clientX - start.x);
      if (across > 12 && across > 2 * Math.abs(touch.clientY - start.y)) event.preventDefault();
    };
    element.addEventListener("touchmove", onMove, { passive: false });
    return () => element.removeEventListener("touchmove", onMove);
  }, []);

  // Arrow keys and page keys turn pages (foot pedals send these).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement) return;
      if (event.key === "ArrowRight" || event.key === "PageDown") go(index + 1);
      if (event.key === "ArrowLeft" || event.key === "PageUp") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index]);

  // Keep the screen from dimming or locking while the set list is open.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      try {
        if (document.visibilityState === "visible") lock = await navigator.wakeLock?.request("screen");
      } catch {
        // Not supported, or refused (low battery): the set list still works.
      }
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      document.removeEventListener("visibilitychange", acquire);
      lock?.release().catch(() => {});
    };
  }, []);

  // Saving for offline needs the service worker, which only runs in the deployed app.
  useEffect(() => {
    navigator.serviceWorker?.getRegistration().then((registration) => setCanSave(Boolean(registration?.active)));
  }, []);

  // Fetching this page and each file once puts them in the offline cache.
  async function saveOffline() {
    setSaved("saving");
    try {
      const urls = [location.pathname, ...songs.flatMap((song) => song.files.map((file) => `/files/${file.id}`))];
      const audio = tracks.flatMap((track) => track.sources.filter((s) => s.kind === "audio").map((s) => s.src));
      const responses = await Promise.all([...urls, ...audio].map((url) => fetch(url)));
      setSaved(responses.every((r) => r.ok) ? "saved" : "failed");
    } catch {
      setSaved("failed");
    }
  }

  const song = songs[index];

  return (
    <div className={`fixed inset-0 z-40 flex flex-col bg-background text-foreground ${playerOpen ? "pb-60 sm:pb-36" : ""}`}>
      <header className="relative flex items-center gap-2 border-b border-black/10 px-2 py-2 sm:gap-3 sm:px-3 dark:border-white/10">
        <Link href={back.href} aria-label={`Back to ${back.label}`} className="icon-btn !h-10 !w-10 sm:!w-auto sm:gap-1 sm:!px-3 sm:text-sm">
          <Icon name="back" className="h-5 w-5" />
          <span className="hidden sm:inline">{back.label}</span>
        </Link>
        <div className="min-w-0 flex-1">
          {/* Two lines on a phone, so a normal title is never cut off. */}
          <div className="line-clamp-2 text-sm font-semibold leading-tight sm:line-clamp-1">
            {song?.tag && <span className="badge-tag mr-1.5 align-[0.1em]">TAG</span>}
            {song ? `${songs.length > 1 ? `${index + 1}/${songs.length} · ` : ""}${song.title}` : heading}
            {song?.key && ` [${song.key}]`}
          </div>
          <div className="muted hidden truncate text-xs sm:block">{heading}</div>
        </div>

        {/* On a wide screen the settings sit in the bar; on a phone they open from the Aa button. */}
        <div
          id="setlist-settings"
          className={`${
            settingsOpen ? "flex" : "hidden"
          } absolute right-2 top-full z-10 mt-1 w-64 flex-col gap-3 rounded-2xl border border-black/10 bg-surface-raised p-4 shadow-xl sm:static sm:mt-0 sm:flex sm:w-auto sm:flex-row sm:items-center sm:gap-3 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none dark:border-white/10`}
        >
          <label className="flex items-center justify-between gap-2 text-sm">
            <span className="sm:sr-only">Show</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as ScreenMode)} className="input !w-auto !py-1 capitalize">
              {MODES.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <div role="group" aria-label="Text size" className="flex items-center justify-between gap-2 text-sm">
            <span className="sm:hidden">Text size</span>
            <span aria-hidden="true" className="muted hidden font-semibold sm:inline">
              Aa
            </span>
            <span className="flex overflow-hidden rounded-xl border border-black/10 dark:border-white/20">
              {(Object.keys(SIZES) as (keyof typeof SIZES)[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSize(s)}
                  aria-pressed={size === s}
                  aria-label={{ S: "Small", M: "Medium", L: "Large", XL: "Extra large" }[s]}
                  className={`min-w-9 cursor-pointer px-2 py-1.5 text-xs font-semibold ${size === s ? "bg-indigo-600 text-white dark:bg-indigo-500" : "hover:bg-black/[0.05] dark:hover:bg-white/10"}`}
                >
                  {s}
                </button>
              ))}
            </span>
          </div>
          {fullscreen !== "none" && (
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-pressed={fullscreen === "on"}
              className="btn btn-secondary !min-h-9 !py-1"
            >
              <Icon name={fullscreen === "on" ? "shrink" : "expand"} className="h-4 w-4" />
              {fullscreen === "on" ? "Exit full screen" : "Full screen"}
            </button>
          )}
          {canSave && back.href.startsWith("/plans/") && (
            <button type="button" onClick={saveOffline} disabled={saved === "saving"} className="btn btn-secondary !min-h-9 !py-1">
              {saved === "saving" ? "Saving…" : saved === "saved" ? "Saved on this device ✓" : saved === "failed" ? "Couldn't save. Try again" : "Save for offline"}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(!settingsOpen)}
          aria-label="Display settings"
          aria-expanded={settingsOpen}
          aria-controls="setlist-settings"
          className={`btn btn-secondary !min-h-10 !px-3 !py-1 font-semibold sm:hidden ${settingsOpen ? "!border-indigo-500" : ""}`}
        >
          Aa
        </button>

        {songs.length > 1 && (
          <div className="flex gap-1">
            <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous song" className="btn btn-secondary !min-h-10 !px-3.5 !py-1">
              <Icon name="back" className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => go(index + 1)} disabled={index >= songs.length - 1} aria-label="Next song" className="btn btn-secondary !min-h-10 !px-3.5 !py-1">
              <Icon name="chevron" className="h-5 w-5" />
            </button>
          </div>
        )}
      </header>

      {songs.length === 0 ? (
        <p className="muted p-6 text-sm">This plan has no songs yet.</p>
      ) : (
        <div
          ref={pages}
          className="relative min-h-0 flex-1"
          onTouchStart={(e) => {
            const touch = e.touches.length === 1 ? e.touches[0] : null;
            swipe.current = touch ? { x: touch.clientX, y: touch.clientY, at: Date.now() } : null;
          }}
          onTouchEnd={(e) => {
            const start = swipe.current;
            swipe.current = null;
            const touch = e.changedTouches[0];
            if (!start || !touch || Date.now() - start.at > SWIPE_MS) return;
            const across = touch.clientX - start.x;
            const down = touch.clientY - start.y;
            if (Math.abs(across) >= SWIPE_DISTANCE && Math.abs(across) >= SWIPE_STRAIGHTNESS * Math.abs(down)) go(index + (across < 0 ? 1 : -1));
          }}
        >
          {songs.map((item) => (
            <section
              key={item.id}
              aria-label={item.title}
              // The songs not showing stay laid out but out of sight and out of reach. (Taking one
              // out of the page altogether, mid-touch, made the browser swallow the next tap.)
              inert={songs[index]?.id !== item.id}
              onClick={() => setSettingsOpen(false)}
              // The only thing on screen that scrolls, and only up and down. Each song keeps its own place.
              className={`absolute inset-0 touch-pan-y overflow-y-auto overflow-x-hidden overscroll-contain px-4 pb-24 pt-4 sm:px-8 ${songs[index]?.id === item.id ? "" : "invisible"}`}
            >
              <div className="mx-auto max-w-4xl">
                <div className="mb-3 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl font-bold leading-tight">
                      {item.tag && <span className="badge-tag mr-2 align-[0.2em]">TAG</span>}
                      {item.title}
                    </h2>
                    {item.author && <div className="muted text-xs">{item.author}</div>}
                    {item.details && <div className="muted text-xs">{item.details}</div>}
                    {item.sequence && <div className="mt-1 text-sm font-semibold">{item.sequence}</div>}
                  </div>
                  {item.key && <div className="shrink-0 font-bold">Key: {item.key}</div>}
                  {item.trackIndex !== null && <PlayButton tracks={tracks} index={item.trackIndex} label={`Play ${item.title}`} />}
                </div>
                {item.notes && <p className="mb-3 whitespace-pre-wrap rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">{item.notes}</p>}

                {item.chart ? (
                  <ChartScreen text={item.chart} chartKey={item.chartKey} targetKey={item.key} mode={mode} fontSize={SIZES[size]} />
                ) : item.files.length > 0 ? (
                  <div className="flex flex-col gap-4">
                    {item.files.map((file) =>
                      file.isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element -- a private, signed-in file, not a static asset
                        <img key={file.id} src={`/files/${file.id}`} alt={file.name} className="w-full" />
                      ) : (
                        <div key={file.id} className="flex flex-col gap-1">
                          <a href={`/files/${file.id}`} target="_blank" rel="noopener noreferrer" className="link text-sm">
                            Open {file.name} in a new tab
                          </a>
                          <iframe src={`/files/${file.id}`} title={file.name} className="h-[80vh] w-full rounded-md border border-black/10 bg-white dark:border-white/10" />
                        </div>
                      )
                    )}
                  </div>
                ) : (
                  <p className="muted text-sm">No chart for this song yet.</p>
                )}

                {item.actions && item.actions.length > 0 && (
                  <div className="mt-8 flex flex-wrap gap-2 border-t border-black/10 pt-4 dark:border-white/10">
                    {item.actions.map((action) => (
                      <Link key={action.href} href={action.href} className="btn btn-secondary">
                        {action.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
