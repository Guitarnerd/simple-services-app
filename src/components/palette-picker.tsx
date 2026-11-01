"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_PALETTE, PALETTES } from "@/lib/palettes";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-palette"] });
  return () => observer.disconnect();
}

// The colour theme, saved on this device. Panes of a merged screen pick the change
// up through the storage event (see the script in layout.tsx).
export function PalettePicker() {
  const current = useSyncExternalStore(subscribe, () => document.documentElement.dataset.palette ?? DEFAULT_PALETTE, () => DEFAULT_PALETTE);

  return (
    <div role="radiogroup" aria-label="Colour theme" className="grid gap-2 sm:grid-cols-2">
      {PALETTES.map((palette) => {
        const chosen = current === palette.id;
        return (
          <button
            key={palette.id}
            type="button"
            role="radio"
            aria-checked={chosen}
            onClick={() => {
              document.documentElement.dataset.palette = palette.id;
              try {
                localStorage.setItem("palette", palette.id);
              } catch {}
            }}
            className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
              chosen ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-400/10" : "border-line hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
            }`}
          >
            <span className="flex shrink-0 overflow-hidden rounded-lg border border-line" aria-hidden="true">
              {palette.swatches.map((colour) => (
                <span key={colour} className="h-9 w-4" style={{ background: colour }} />
              ))}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{palette.name}</span>
              <span className="muted block text-xs">{palette.description}</span>
            </span>
            {chosen && <span className="shrink-0 text-xs font-semibold text-indigo-700 dark:text-indigo-300">In use</span>}
          </button>
        );
      })}
    </div>
  );
}
