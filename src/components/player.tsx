"use client";

import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui";

// One way of hearing a song: an uploaded recording, or a YouTube video (`src` is its id).
export type Source = { kind: "audio" | "youtube"; label: string; src: string };
export type Track = { id: string; title: string; sources: Source[] };

type Player = {
  play: (tracks: Track[], index: number) => void;
  // The track that is loaded, if any, so buttons can show which one is playing.
  currentId: string | null;
  isOpen: boolean;
};

const PlayerContext = createContext<Player>({ play: () => {}, currentId: null, isOpen: false });

export function usePlayer() {
  return use(PlayerContext);
}

// ----- YouTube -----

type YouTubePlayer = { destroy: () => void };
type YouTubeApi = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      host: string;
      width: string;
      height: string;
      playerVars: Record<string, number>;
      events: { onStateChange: (event: { data: number }) => void };
    }
  ) => YouTubePlayer;
};

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youTubeApi: Promise<YouTubeApi> | null = null;

// Loads YouTube's player script once, the first time a video is played.
function loadYouTubeApi() {
  youTubeApi ??= new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT);
    window.onYouTubeIframeAPIReady = () => resolve(window.YT as YouTubeApi);
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });
  return youTubeApi;
}

const YOUTUBE_ENDED = 0;

function YouTubeFrame({ videoId, onEnded }: { videoId: string; onEnded: () => void }) {
  const holder = useRef<HTMLDivElement>(null);
  const ended = useRef(onEnded);
  useEffect(() => {
    ended.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    let player: YouTubePlayer | null = null;
    let cancelled = false;
    // The API replaces the element it is given, so hand it a throwaway child.
    const target = document.createElement("div");
    holder.current?.appendChild(target);

    loadYouTubeApi().then((api) => {
      if (cancelled) return;
      player = new api.Player(target, {
        videoId,
        host: "https://www.youtube-nocookie.com",
        width: "100%",
        height: "100%",
        playerVars: { autoplay: 1, playsinline: 1, rel: 0 },
        events: { onStateChange: (event) => event.data === YOUTUBE_ENDED && ended.current() },
      });
    });

    return () => {
      cancelled = true;
      player?.destroy();
      target.remove();
    };
  }, [videoId]);

  return <div ref={holder} className="aspect-video w-full overflow-hidden rounded-xl bg-black sm:w-72" />;
}

// ----- The dock -----

// Wraps the app. The player it shows is docked to the bottom of the window and
// keeps playing as the person moves between pages.
export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [index, setIndex] = useState(0);
  const [sourceIndex, setSourceIndex] = useState(0);

  const track = tracks[index] as Track | undefined;
  const source = track?.sources[sourceIndex] ?? track?.sources[0];

  const play = useCallback((next: Track[], at: number) => {
    setTracks(next);
    setIndex(at);
    setSourceIndex(0);
  }, []);

  const go = useCallback(
    (to: number) => {
      if (to < 0 || to >= tracks.length) return;
      setIndex(to);
      setSourceIndex(0);
    },
    [tracks.length]
  );
  const next = useCallback(() => go(index + 1), [go, index]);

  const value = useMemo(() => ({ play, currentId: track?.id ?? null, isOpen: Boolean(track) }), [play, track]);

  return (
    <PlayerContext value={value}>
      {children}
      {track && source && (
        <>
          {/* Keeps the end of the page from hiding behind the dock. */}
          <div className="h-56 shrink-0 print:hidden sm:h-48" />
          <aside
            aria-label="Player"
            className="fixed inset-x-2 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-50 rounded-2xl border border-black/[0.08] bg-surface-raised/95 p-3 shadow-2xl shadow-black/20 backdrop-blur md:bottom-4 md:left-[16rem] md:right-4 dark:border-white/10 print:hidden"
          >
            <button type="button" onClick={() => setTracks([])} aria-label="Close player" title="Close" className="icon-btn absolute right-1.5 top-1.5">
              <Icon name="close" className="h-4 w-4" />
            </button>
            <div className="mx-auto flex max-w-4xl flex-col gap-3 pr-8 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous song" className="icon-btn !h-9 !w-9">
                  <Icon name="previous" className="h-[18px] w-[18px]" filled />
                </button>
                <button type="button" onClick={next} disabled={index >= tracks.length - 1} aria-label="Next song" className="icon-btn !h-9 !w-9">
                  <Icon name="next" className="h-[18px] w-[18px]" filled />
                </button>
                <div className="min-w-0 flex-1 pl-1">
                  <div className="truncate text-sm font-semibold">{track.title}</div>
                  <div className="muted truncate text-xs">
                    {tracks.length > 1 && `${index + 1} of ${tracks.length} · `}
                    {track.sources.length > 1 ? (
                      <select
                        value={sourceIndex}
                        onChange={(e) => setSourceIndex(Number(e.target.value))}
                        aria-label="Recording"
                        className="max-w-44 cursor-pointer truncate rounded bg-transparent underline decoration-dotted underline-offset-2"
                      >
                        {track.sources.map((s, i) => (
                          <option key={i} value={i}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      source.label
                    )}
                  </div>
                </div>
              </div>

              {source.kind === "youtube" ? (
                <YouTubeFrame videoId={source.src} onEnded={next} />
              ) : (
                <audio key={source.src} src={source.src} controls autoPlay onEnded={next} className="w-full sm:w-72" />
              )}
            </div>
          </aside>
        </>
      )}
    </PlayerContext>
  );
}

// Starts playing `tracks` at `index`. Shows as "playing" while its track is loaded.
export function PlayButton({ tracks, index, label, className = "" }: { tracks: Track[]; index: number; label: string; className?: string }) {
  const { play, currentId } = usePlayer();
  const playing = currentId === tracks[index]?.id;
  return (
    <button
      type="button"
      onClick={() => play(tracks, index)}
      aria-label={label}
      title={playing ? "Playing" : "Play"}
      className={`${playing ? "inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-600/40 dark:bg-indigo-500" : "icon-btn-accent"} ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
        {/* Playing: sound bars. Otherwise: a play triangle. */}
        <path d={playing ? "M5 10h3v9H5zM10.5 5h3v14h-3zM16 12h3v7h-3z" : "M8 5.5v13l11-6.5z"} />
      </svg>
    </button>
  );
}
