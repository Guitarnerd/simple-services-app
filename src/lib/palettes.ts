// The colour themes people can pick on the Account page. Each one (other than
// Ember, the default) is a `:root[data-palette="…"]` block in globals.css that
// swaps the primary scale (`indigo-*`), the link and highlight colours, and the
// page surfaces for light and dark. The choice is saved on the device, like
// light and dark, and set before first paint by the script in layout.tsx.
// `swatches` are what the picker shows: the button colour, the page, and the highlight.

export const PALETTES = [
  { id: "ember", name: "Ember", description: "Burnt orange on near-black or warm white.", swatches: ["#b9502d", "#121314", "#e8b04a"] },
  { id: "clay", name: "Slate and Clay", description: "Slate and clay on cream.", swatches: ["#69797f", "#f4f0e5", "#8a6658"] },
  { id: "olive", name: "Olive Grove", description: "Earthy olive and sand, soft and natural.", swatches: ["#5a6a38", "#f2f0e8", "#c9a46a"] },
  { id: "rose", name: "Desert Rose", description: "Dusty terracotta and blush.", swatches: ["#a3584a", "#f6f0ec", "#e2b48a"] },
  { id: "water", name: "Deep Water", description: "Calm navy blue with a touch of gold.", swatches: ["#2e5b7a", "#f1f4f6", "#e0b860"] },
  { id: "dusk", name: "Dusk", description: "Muted plum and lavender.", swatches: ["#6d4a7d", "#f5f3f6", "#e6b980"] },
] as const;

export type PaletteId = (typeof PALETTES)[number]["id"];
export const DEFAULT_PALETTE: PaletteId = "ember";
